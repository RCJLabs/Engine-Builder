# Spec: editing a project safely

This covers M2.3:

- undo and redo through a command log;
- saving by itself, in a way a crash can't tear;
- one editing tab per project;
- the first edits: a project's name and version.

The code is in `apps/editor/src/editing/`, with the open project in `apps/editor/src/projects/opened.ts`. The decision behind it is D30.

## Steps and the command log

`history.ts` is pure. The caller passes the time, so its rules are tested without a clock.

- **A step** is a set of file changes, each `{ path, before, after }`. `before` and `after` are the file's bytes, or null for no file. A step also has a label for people ("Rename the project"), an optional group, and the time it was made.
- **Undo** puts each change's `before` back, and **redo** puts each `after` back. A new edit drops what redo held. This is ported from space-wrecked's builder session, which keeps past and future stacks of entries carrying both states and a label.
- **Grouping.** A step joins the one before it when they share a group, and it comes within 500 ms of that step. The delay counts from the last edit, so steady typing stays one step and a pause starts the next.
  - A joined step keeps each file's first `before` and takes its last `after`.
  - Undo and redo close the last step, so the next edit starts a new one.
  - A joined step that leaves every file as it was is dropped: typing a name back to what it was leaves nothing to undo.
- **Depth.** The newest 100 steps are kept.
- **The 500 ms and the 100** are the history defaults of [CodeMirror 6](https://github.com/codemirror/commands/blob/main/src/history.ts) (`newGroupDelay`, `minDepth`) and [ProseMirror](https://github.com/ProseMirror/prosemirror-history/blob/master/src/history.ts) (`newGroupDelay`, `depth`). Both also break a group when an edit lands somewhere else; here a group is one field, which does the same job.
- **The history lives in the editing tab's memory.** Closing the project, handing it over or losing the lock clears it.

## Edits keep the file's layout

An edited JSON file is written back in the layout it was written in (`jsonText.ts`), so git shows only the lines that changed. Four things are kept:

- the byte order mark;
- the line ends, CRLF or LF;
- the indentation, which the first indented line sets (spaces, a tab, or none for a file on one line);
- the last newline, or its absence.

Numbers and key order come out as `JSON.stringify` writes them. An edit that leaves the value as it was gives back the same bytes, untouched.

The round-trip test opens the format-1 fixture's git checkout as a folder. Its `project.json` has a byte order mark and Windows line ends.

- An edit that is then undone, and saved, leaves `git status` empty.
- A rename, saved, changes exactly one line, `"name"`, keeping the BOM and the CRLF.

## The working copy

`workingCopy.ts` is the open project as the editor sees it: the stored files with the edits not yet saved laid over them.

- Everything that reads the open project reads it: the summary, export, and later the compiler. Nothing sees a file older than the last edit.
- It tracks which files are unsaved. A save marks a file saved only if no edit touched it while the save ran; it tells by checking that the bytes object is the same one.
- `forget()` drops every edit laid over the files. A tab that stops editing calls it, so it reads the files again, and with them the other tab's saves.

## Saving

`autosave.ts` decides when to save.

- **When.**
  - 1 s after the last edit.
  - At once when the page is hidden. On a phone that is the last moment the page can count on: closing a tab or the browser app fires neither `pagehide` nor `beforeunload` ([Chrome's Page Lifecycle guide](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)). `pagehide` is a second chance for Safari before 14.1, which didn't fire `visibilitychange` on leaving.
  - When the project closes, and before handing it to another tab.
- **A save the page is frozen in the middle of.** Chrome freezes a page's workers with it, so a save running then finishes when the page thaws. If the page is discarded instead, a journal already written is finished the next time the project opens; an edit not yet in a journal is lost.
- **One save at a time.** Edits made while a save runs go in the next one.
- **A failed save** keeps the edits in memory. The panel says "Not saved:" with the reason and offers Try again; the next edit tries again too.
- **Unsaved means not yet written, or not yet even made.** Each edit first reads the file, and so does an edit in the queue. Two e2e runs failed where only the edits already made were counted:
  - A page closed mid-typing lost its typing without asking.
  - A reload right after the save line said "All changes saved." lost a rename that was still queued.

  The unload guard and the save line now count the queue too.
  - While anything is unsaved, the update toast waits.
  - Leaving the page asks first (`beforeunload`), where the browser honours it: Chrome, Firefox and desktop Safari, once the page has been used. iOS Safari doesn't, and Android doesn't fire it when the app is closed from the app switcher.
  - The listener is there only while something is unsaved, since in Firefox any `beforeunload` listener keeps the page out of the back/forward cache.

### Stored projects: the journal

`journal.ts` runs in the OPFS worker. A save happens in three steps:

1. **The journal.** The save is written into `.eb-journal` in the project's folder, and flushed. The file is one line of JSON holding the paths and their bytes in base64, then a line with that line's FNV-1a 64 hash.
2. **The files.** Each is written (truncate, write, flush) or removed.
3. **The journal goes.**

The editor looks for a journal, which can only be from a save cut short, at two moments, each time holding the project's lock:
- when it starts, before it lists the library (`recovery.ts`), for every project no other tab is editing. A save torn in the middle of `project.json` would otherwise list the project as broken, offering only Delete;
- when a project opens.

What it finds is dealt with as follows:

- **A whole journal** is applied again. That is safe to repeat.
- **A torn journal** (its hash doesn't match) is dropped. No file is touched before the journal is whole, so no file was.

The journal's name starts with a dot, so the compiler, zips and the library never take it for part of the project.

**Why a journal, not a temporary file moved over the old one.**
- **Many files at once.** A save of many files is all or nothing this way, which renames (M2.5) need. `move()` replaces one file at a time.
- **Firefox's `move()` isn't atomic.** `move()` onto an existing file overwrites it in all three engines. It is one atomic step in Chrome's and Safari's OPFS, but Firefox deletes the old file and then renames, in two steps ([Firefox's source](https://github.com/mozilla-firefox/firefox/blob/main/dom/fs/parent/datamodel/FileSystemDatabaseManagerVersion001.cpp)).
- **Nothing new.** A journal uses only what M2.1's writer already relies on in every engine: sync access handles and their flush.

**What a flush promises** varies, which no file layout can fix:
- In a Chrome Incognito window, OPFS lives in memory, so flush does nothing and everything goes with the window.
- On Apple hardware, Firefox and Safari flush with plain `fsync`, which doesn't force the drive's own cache to disk.
- Unless the browser grants persistent storage (M2.1 asks), stored data can be evicted, and Safari deletes script-written data after 7 days of use without a visit ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)).

**Tested by cutting the power at every step.** The in-memory file system can cut the power at any write, truncation, flush or removal; a cut write keeps half its bytes, and nothing changes after. The test saves four changes at once (a longer file, a shorter one, a new one and a removal) with the cut at each of the save's operations in turn. After recovery, every cut leaves either all the old files or all the new ones, and both outcomes occur.

### Opened folders

`folderSave.ts` writes each file through a writable stream. Chrome fills a swap file beside it, `name.crswap`, and moves it into place on close, in OPFS and in picked folders alike ([Chrome's source](https://github.com/chromium/chromium/blob/main/content/browser/file_system_access/file_system_access_file_writer_impl.cc)). A crash leaves the old file or the new one, though it can leave a stale `.crswap` beside it. A save of several files into a folder isn't all or nothing; see the open questions.

Folders open to be read (M2.1). Changing one waits for a tap on **Allow changes**, which asks the browser. Until then the project is read only and says why.

## One editing tab per project

`projectLock.ts`, `projectEditing.ts` and `tabs.ts` implement this.

- **The lock.** Editing holds a Web Lock: `eb-editor:project:<folder>` for a stored project, `eb-editor:folder:<key>` for an opened one.
  - The key is the folder's in the recent-folders list. M2.1 removed and re-added a folder's record each time it opened, which gave it a new key every time, so two tabs opening it at different times would have named different locks. A folder now keeps its record and key; copies left by M2.1 fold into one.
  - The browser lets go of a tab's locks when the tab closes, crashes or is discarded ([the spec](https://w3c.github.io/web-locks/)). Web Locks are in Chrome 69, Firefox 96 and Safari 15.4, phones included.
  - Chrome won't freeze a page that holds a lock. Safari lets a page's locks go when the page enters the back/forward cache, so a page that comes back takes the lock again if it is free. A tab iOS has suspended may hold its lock until the system ends it, which is what Take over is for.
- **Opening.** The lock is taken only if it is free. When it is, the project is editable. Otherwise the project opens read only: "This project is open for editing in another tab."
- **Edit here** asks the editing tab, over a `BroadcastChannel`, to hand over.
  - The editing tab saves, lets the lock go, and reads the files again: "Editing moved to another tab."
  - The asking tab waits for the lock, then edits.
  - An editing tab that can't save first says why, and keeps editing.
- **Take over.** If the editing tab hasn't answered after 5 s, perhaps asleep in the background, Take over takes the lock from it.
  - That tab's lock request fails with an `AbortError`, so it stops saving and drops its unsaved edits, and says so when it wakes.
  - Stealing can't be combined with taking a lock only if it is free, which is why Take over is a second step, never the first.
- **Read-only tabs follow** each save the editing tab announces. This comes from who-am-i-'s answers store, which reloads when another tab says it changed the data.
  - Since M2.5 the announcement names the files the save wrote, so a read-only tab reads only those again: its record index re-reads a few files, not every record ([editor-tables.md](editor-tables.md#the-record-index)). One from an older editor names none, and the tab reads everything.
  - A tab reads everything again when it stops editing and drops its unsaved edits, when it takes over, and when it comes back from the back/forward cache with another tab still editing, since saves made while it was away went unheard.
  - Opening reads the project once: the editing layer asks for another read as it starts only when it finished a save cut short.
- **Deleting** a project needs its lock, so a project open for editing elsewhere stays.
- **Without Web Locks**, editing works without the guard, and the console says so.

## The first edits

The Project panel's open project has **Name** and **Version** fields (`projectEdits.ts`, `ProjectFields.tsx`).

- Each keystroke is an edit of `project.json`, grouped by field.
- **Validation.** A name can't be blank. A version must be one the compiler reads, and the message is the compiler's own.
- **What shows.** The field shows what is typed at once, and the stored value follows when the edit lands, so the caret never jumps.
  - Typing the field can't hold stays in the field, with the reason beside it. Leaving the field puts the stored value back.
  - An undo or redo shows the stored value.

## Undo and redo in the editor

- **The top bar** has Undo and Redo while a project is open. They are 44 px, named for the step they would take ("Undo: Rename the project"), and disabled when there is none.
  - On a phone the version stamp gives way to them. The console and the Project panel still say which build is running.
- **Keys.** Ctrl/⌘+Z undoes. Ctrl/⌘+Shift+Z and Ctrl+Y redo.
  - Other text fields keep the browser's own undo: the palette's field, a picker's search, the new project's name and a new record's name.
  - In the project's own fields, the editor's undo takes over from the keys. Those are the project's name and version and, since M2.4, every box of a record form that writes as it is typed in (`data-project-field`). A planted bug in M2.4 found the forms' boxes left out: Ctrl+Z there typed the old text back as a new edit. The browser's own undo can't step back past a value set by script, which is how the fields show the stored value, so it would lose track of the project.
  - The Edit menu and a shake on iOS arrive as `beforeinput` events with `historyUndo` or `historyRedo`, which the editor takes over too. They fire only while the browser's own undo has typing of its own in the field, so they reach the editor's undo for the latest typing, not for every step.
- **The palette** offers "Undo: …" and "Redo: …".
- **The console** notes each one: "Undone: Rename the project."

## The deploy check needs HTTPS

M2.2's check passed while Pages served the editor as `http://engine.rcjlabs.com/`. Over plain HTTP the browser withholds service workers and OPFS, so the editor can't work offline or keep a project there. The check now fails a site that isn't HTTPS. `localhost` is allowed, since browsers count it as secure and the tests serve from it.

## Tests

**Unit tests:**

- the command log;
- each layout kept;
- the working copy;
- the journal, with the power cut at every step;
- autosave with hand-run timers;
- the edit session's queue and pending count;
- the lock against a fake of the Web Locks spec;
- two tabs on a shared fake lock and channel: read-only, hand-over, refusal, take over, taking the lock back, folders, recovery;
- the unload guard, present only while something is unsaved;
- the keys;
- stable folder keys;
- the deploy check.

**The git round trip** (`roundtrip.test.ts`) is re-proven with edits saved into an opened folder.

**e2e tests** on real OPFS, Web Locks and `BroadcastChannel` in Chromium:

- an edit saved by itself, kept through a reload;
- undo and redo by key, button and palette, with typing pauses as separate steps;
- fields refusing a blank name and a bad version, and an undo while a field holds one;
- saving at once when the page hides;
- the warning before leaving with an unsaved edit;
- a torn journal dropped and a whole one finished;
- a second tab read only, following saves;
- the hand-over;
- take over from a tab that can't hear;
- delete refused;
- an opened folder that asks, then saves;
- 360, 390 and 844 px with the top bar's buttons, axe at every impact.

**Planted bugs.** Forty-one were planted, one at a time, and the first run caught 37. Each of the other four changed something:
- **An undo that left the step open** went unseen because the test's undo came more than 500 ms after the step before it. The test now undoes within the delay.
- **Edits run side by side**, not queued, went unseen because the test's three renames joined one group, and grouping hides a stale `before`. A test of ungrouped edits, undone one at a time, catches it.
- **A field keeping what was typed after an undo** went unseen because the typing had already landed. The e2e test now undoes while the field holds an empty name.
- **One planted bug was invalid**: deleting its line left a dangling `else`, so the build failed, not a test. Planted again correctly, it fails two tests.

The research added two behaviours, and a last review of the change found a gap: a torn `project.json` listed as broken until opened. That made three more fixes, each with a planted bug of its own that a test catches:
- the unload guard, present only while something is unsaved;
- taking the lock back after the back/forward cache;
- finishing cut-short saves before listing.

## Readings

| Reading | Value |
| --- | --- |
| One save through the journal (project.json) | 14–20 ms (median 17), from "Saving…" to "All changes saved." |
| From keystroke to saved | 1,027–1,044 ms (median 1,031), nearly all of it the 1 s wait |
| Editor JS at start | 58.3 kB gzip, up 4.8 kB |
| The OPFS worker | 3.4 kB raw, up from 1.1 kB with the journal |

All timings: headless Chromium 1194 on `vite preview`, cloud container, fresh contexts, 5 runs.

## Open questions

1. **Folders and many files.** A save of several files into an opened folder isn't all or nothing. Renames (M2.5) will make such saves. Keep a journal for the folder in OPFS, or accept it?
2. **Undo after a reload.** The history lives in memory, so a reload, a hand-over or a crash loses it. Keep it in OPFS beside the project?
3. **What Take over costs.** It drops the old tab's unsaved edits, by design. A save the old tab already had in flight can still land after the new tab has read the files; the new tab's next save of those files wins.
4. **Browsers other than Chromium.** Web Locks, `BroadcastChannel` and the page-hide save are tested in Chromium only; the claims above about Safari and Firefox come from their source, not from runs. Safari 15.2 and 15.3 have OPFS but not Web Locks, so they would edit without the guard.
5. **A stale `.crswap`.** A crash while Chrome writes into an opened folder can leave `name.crswap` beside the file. The compiler counts it as a project file, so a zip export carries it. Should the compiler pass over `*.crswap`, as it does dotfiles?
6. **Android's picked folders** are `content://` locations, where Chrome's writable stream copies back on close rather than moving, so a crash there could cut a file short. The editor opens folders only where `showDirectoryPicker` exists; check what that covers on Android before relying on it.
7. **Hand-written numbers.** A `1.0` in an edited file comes back as `1`, as `JSON.stringify` writes it. Fine for the engine's files; keep it in mind for records written by hand.
