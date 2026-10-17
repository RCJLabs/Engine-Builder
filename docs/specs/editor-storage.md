# Spec: where the editor keeps projects

This covers M2.1:

- projects stored in the browser (OPFS);
- folders opened from disk;
- zips in and out;
- asking the browser to keep it all.

The code is in `apps/editor/src/projects/`. The zip format itself, which the CLI shares, is in [project-format.md](project-format.md#zips).

The editor lives at `engine.rcjlabs.com` (D28). Browser storage belongs to that origin, so nothing here is shared with any game.

## Stored in the browser

```
OPFS root/
  projects/
    salvage-run/          one folder per project, holding its own files as they sit on disk
      project.json
      records/item/medkit.json
    salvage-run-2/        a second project whose id is also salvage-run
    dirtbag/
      .unfinished         a copy that stopped part way: listed as unfinished, never opened
```

- **One folder per project.** It is named after the project's id, with `-2`, `-3`… when that name is taken. project.json keeps its own id, so two copies of one game can sit side by side.
- **Only a project's own files** are copied in: project.json and the project's folders (`PROJECT_FOLDERS`: `records/`, plus `scenes/`, `ui/`, `scripts/`, `dialogue/`, `assets/` and `locales/` for later milestones). Hidden entries are left out.
- **Copies are marked until done.** A copy writes an empty `.unfinished` first, then the files, then removes the marker. A copy cut short (the tab closed, the disk full) is listed as unfinished with a Delete button; it is never opened as a project.
- **A new project** holds only project.json: format 1, an id made from the name ("Salvage Run!" gives `salvage-run`; a name with no Latin letters or digits gives `project`), the name trimmed, and version `0.1.0`. It is written with two-space indents and a last newline, as the fixtures are.
- **Listing** reads each folder's project.json through the compiler's `checkManifest`. A folder whose project.json is missing or broken is listed with what is wrong, so it can be deleted.

### Writing

- **Every write to OPFS goes through one worker** (`opfs.worker.ts`), which uses sync access handles. They are the only way to write an OPFS file that Chrome (102), Firefox (111) and Safari (15.2) all have. `createWritable` reached Safari only in 26, and Safari 26.5 has an unconfirmed report of it leaving temporary copies behind.
- **Order.** The worker takes requests one at a time, in the order they came. Within a request it writes 16 files at a time, so a request's paths must differ.
- **Speed.** Each file costs the worker about 2 ms in headless Chromium: 1,001 small files took 1.95 s (Readings). Most of it is the handle's open, truncate, flush and close, each a round trip to the browser. Flushing isn't the slow part: leaving it out changed nothing measurable.
- **A write** truncates the file, writes the bytes, checks that every byte was written, flushes, and closes the handle even when something failed. The handle locks the file only while it is open.
- **Names** are checked before anything is written: no empty name, no `.` or `..`, and no `/`, `\` or NUL inside one. A zip entry like `../x` stops there.
- **Not atomic.** A crash in the middle of a write can leave that one file cut short. M2.1 writes only when a project is created or copied in, and the marker covers those. Saving edits (M2.3) needs a safer write; see the open questions.

## Opened folders

- **Where.** "Open folder" appears only where `showDirectoryPicker` exists: desktop Chrome and Edge. It is the route for working on the same git checkout as Claude Code.
- **Read only.** M2.1 asks to read the folder and never writes to it. It can summarise the project, export it as a zip, or copy it into the browser. Editing (M2.3–M2.5) will ask to write, once, when it first saves.
- **Recent folders** are kept in IndexedDB, database `eb-editor`, store `folders`: the handle, its name, and when it was last opened. These names are storage keys and are never renamed. Each folder is kept once (`isSameEntry`), newest first, and only the newest 8.
- **Permission** belongs to the browser.
  - Reopening a recent folder checks `queryPermission`, and asks with `requestPermission` only when it must, which needs a tap.
  - Chrome remembers the answer when the user chooses "Allow on every visit", or when the app is installed.
- **Android.** Chrome has the picker on Android, but reports say permission doesn't last across reloads there, so a phone works with zips instead.

## Zips

- **Export** gives `<id>-<version>.zip` as a download: the project's own files in one top folder named by its id. The same files always give the same bytes ([project-format.md](project-format.md#zips)).
- **Import** reads a zip with the project at its root or in one top folder, skipping hidden files, `__MACOSX` and folder entries.
  - It refuses a zip of more than **10,000 files** or **100 MB** unpacked, counted from the zip's own listing before anything is unpacked.
  - It refuses a zip with no usable project.json.
  - Then it copies the project in as above.
  - A file that isn't a zip at all gets "isn't a zip this editor can read".

## Keeping the storage

- **Asking.** The first project stored in the browser asks for persistent storage (`navigator.storage.persist()`).
- **Who grants it.** Chrome grants it to installed apps and well-used sites without a prompt, Firefox asks the user, and Safari decides by heuristics such as being on the Home Screen.
- **The panel says** whether the browser will keep the projects, and how much the site uses.

| What | Established | Not established |
| --- | --- | --- |
| Safari's 7-day rule | WebKit deletes a site's script-writable storage after 7 days of Safari use without a visit to it. Home Screen web apps keep their own count of days of use. | Whether OPFS counts as script-writable storage, and whether a granted `persist()` exempts a site from the 7-day rule. |
| Safari's quota (17+) | Up to 60% of the disk for a browser app's origin, and eviction under pressure skips persistent origins. | The quota for a Home Screen web app. |
| Chrome's eviction | Best-effort storage can be evicted under pressure; persistent storage isn't. | — |

Until GitHub sync (Phase 4), a zip export is the backup the editor can't lose. On a phone, installing the editor to the Home Screen is the best protection.

## Tests

- **Unit tests** (Node) run against an in-memory file system with the File System API's shapes, errors and locks (`apps/editor/test/memory-fs.ts`). They cover:
  - the library: names, markers, refusals and listing;
  - the writer;
  - project.json;
  - the summary;
  - recent folders and permissions;
  - the storage line.
- **The round trip** (`roundtrip.test.ts`).
  - The project sits in a real git checkout. Its bytes are what tends to get lost on the way: a byte order mark, Windows line ends, no last newline, text past ASCII, tabs, a binary file, and notes among the records. The repo's own files sit around it.
  - It is copied into the browser through the library, exported as a zip, and unpacked over the checkout by Python's zipfile.
  - `git status` must then be empty.
- **e2e tests** run on real OPFS in Chromium:
  - a project survives a reload;
  - a zip made the way an OS makes one imports, and exports to the same files, which the CLI reads to the fixture's content hash;
  - a non-zip is refused;
  - a folder opens (the picker is replaced, since a native dialog can't be driven), is copied in, and is remembered after a reload;
  - every script the build made is in the service worker's cache, the writer's worker included, and a project can be stored offline. Playwright's offline mode doesn't reach a dedicated worker's script, which loaded from the server even when left out of the cache, so the test reads the cache itself;
  - the panel fits 360, 390 and 844 px wide, with 44 px targets and no serious axe issues.

## Open questions

1. **Safer saves.** Before M2.3 saves edits, decide how a write survives a crash: write a sibling file and `move()` it over the original (supported in all three engines, but Chrome only for files), or keep a journal.
2. **CRC checks.** fflate doesn't check a zip's CRCs, so a damaged zip imports damaged files. A damaged record fails to parse (E007); a damaged asset would not be noticed. Check CRCs when assets arrive (M2.7)?
3. **The compiler's weight.** It is 33.8 kB of the editor's 51.1 kB of gzipped JS, mostly zod, loaded at start so the library can read project names (Readings). Load it later, or in the worker the architecture plans for it, once the editor's start-up is measured on a phone.
4. **Share instead of download.** On a phone, the share sheet's "Save to Files" or Drive may suit exports better than Downloads.
