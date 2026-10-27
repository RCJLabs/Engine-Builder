# Spec: scripts in the editor

M3.2's place in the editor for a project's scripts ([scripts.md](scripts.md), D38): the script worker that checks and runs them, trust per project, the Logic panel's Scripts section with Run, and the script editor in the inspector. The code is `apps/editor/src/scripts/`, with the Scripts section and Run in `apps/editor/src/logic/` (`ScriptsSection.tsx`, `RunGame.tsx`).

## The script worker

- **Two jobs** (`jobs.ts`, plain functions that tests run in Node):
  - **check:** the files under `scripts/`, read as the compiler reads them (E028 to E030, W111, W112), and game.ts run when the project is trusted (E031, E032). The answer is plain data: the scripts' ids, their problems, and the game's catalogue;
  - **play:** the project compiled as `eb sim` compiles it, then 20 seeds played with a bot, and the report as `eb sim --seeds 20 --policy <bot>` prints it, line for line. A test holds the two together.
- **Two workers.** One checks, after every change under `scripts/`; the other plays, so a long Run never holds up a check. Each starts on first use: a project with no scripts never starts either.
- **A job past its time** stops its worker, since a script that loops forever can't be stopped from inside: 5 seconds to check, the worker's start included, and 60 to play. A check that runs out is E031 ("It didn't finish loading within 5 seconds: does a loop never end?"); the next job starts a new worker.
- **Locked down.** Before the first job that runs a script, the worker takes the host's ways out off its global: `fetch`, XMLHttpRequest, WebSocket, WebTransport, EventSource, RTCPeerConnection, `importScripts`, IndexedDB, `caches`, `cookieStore`, `navigator` (and with it OPFS), BroadcastChannel, Worker, SharedWorker and Notification. A script that breaks the purity rules on purpose finds none of them (an e2e test looks). It is best effort, on top of trust, not a sandbox: the worker shares the editor's origin.
- **What crosses** is data both ways: the page sends files, the worker answers with diagnostics, a catalogue and lines of text. Nothing in an answer runs on the page, whatever a script did.

## Trust

- **A project made here runs its scripts at once** (D38): its first script is made in the editor, and making it trusts the project. Whether it is the first is read from the project's files as the button is pressed, never from the game's state, which a project just opened hasn't read yet: New stage on a zip just imported trusted its scripts unasked that way (M7.4).
- **A project imported from a zip or opened from a folder asks first, once.** Until then its scripts are checked but not run, its content is checked as if it had no game, and the Logic panel says so above the scripts with **Run its scripts**. One with no scripts, which then gets its first here, runs it without asking.
- **The answers** are kept in localStorage under `eb-scripts-trusted`, by the project's key: `library:<folder>` for a project stored here, `folder:<n>` for an opened folder by its key in the recent list. A folder the list couldn't keep is trusted until the page closes. Deleting a project, or taking a folder off the list, forgets its answer, so a project copied in later under the same folder is asked about afresh. Copying a trusted folder into the browser trusts the copy.
- **Answers that can't be read** (storage blocked, not JSON) count as none: those projects are asked again, which costs a tap, never a script run unasked.

## The game, through the editor

- **The open project carries its game** (`gameState.ts`): its scripts by id, their problems, and once game.ts has run, its catalogue. Its status is one of: no scripts; scripts without game.ts; not run yet (untrusted); broken (a script game.ts reaches has an error); failed (E031, E032); loaded.
- **Re-checked as you type.** After each change under `scripts/`, the worker checks the scripts again; then the record index checks the records against the game's facts, events and effects. The game's checks are grounds like the types (M2.5): an edit that changes what the game declares checks every record again; one inside a function's body checks none.
- **Problems** lists the scripts' problems with the rest, as `eb validate` gives them, a test holding the two together. A script's problem is titled "Script hold.ts", placed at its line ("line 15, column 3"), and opens the script with the cursor there.
- **The forms offer the game.** Once it has loaded, a row's When lists the game's events by their labels, a condition reads the game's facts (the engine's keeping their wording), and Add effect offers the game's own effects beside the engine's ("stash (this game's)"), edited as JSON. The Logic panel's cards read rows with the game's facts and events too.

## The Scripts section

- **Below Trigger sheets and Flags** in the Logic panel: each script as a card (game.ts as "The game"), with its problem count, opening it in the inspector; then what the game is in a sentence ("The game: main, starting in play; 2 actions; bots worker."), or why it hasn't run.
- **Start a game**, while there is no game.ts, writes it with a first module, `main.ts` (or `main-2.ts` when a script has that name), as one step. They run as they stand: ten days to work or rest, work paying 1 to 3 coins, a `day-ended` event, `day` and `coins` facts, and a bot. A test holds them to loading clean and playing 20 games to the end with no refused offer.
- **New script** names a module script as New names a record, its file shown as typed (`scripts/crew.ts`). It writes a module with a fact, not yet listed by game.ts, which W112 says.
- **Run** plays 20 games with a bot, the game's first or one chosen, and shows the report and how long it took. It waits while the project has errors, as `eb sim` plays nothing then, and says when the project has changed since the last run.

## The script editor

- **CodeMirror 6 in the inspector**, loaded when a script is first opened: TypeScript's colours from the app's tokens (light and dark), line numbers, bracket matching, and lines that wrap rather than scroll sideways on a phone. 16 px text on a touch screen, so iOS doesn't zoom in.
- **Completion** from lists, not TypeScript's language service (D38): what `"eb"` gives, a handler's `ctx` after `ctx.`, an rng stream's members after `.rng(…).`, defineModule's parts inside its braces, the file's own names, and in a string the project's: the game's facts, events and effects, record types and records. Tests hold the lists to the API they describe.
- **Problems in the gutter** and listed below, each with a Line button that puts the cursor there.
- **Typing is an edit like a form's.** Each change becomes a step, joining the one before within half a second as typing in a field does, and the editor's undo takes it back: CodeMirror keeps no history of its own, and Ctrl+Z in the code is the editor's. Changes from the file (undo, redo, another tab's save) come into the code as the part that differs, keeping the cursor where it maps. Typing still on its way to the file is told from them (`typedAhead.ts`), so a slow read never takes a keystroke back.
- **Read only** while another tab edits the project. **Delete** asks first, as an asset's does; undo brings the script back.
- **Keys.** Tab indents; Escape then Tab moves on, as CodeMirror has it. Ctrl+Space asks for completion.

## Checks

- **Timing:** `test/scripts-bench.ts` (the jobs in Node), and the browser's timed in the page (ROADMAP.md's Readings).
- **Unit:** `scripts/trust.test.ts`, `lockDown.test.ts`, `scriptWorker.test.ts` (answers matched to jobs, a job past its time, a dead worker), `jobs.test.ts` (checked as the compiler does; Run's report against `eb sim`'s, line for line), `gameState.test.ts`, `templates.test.ts`, `scriptEdits.test.ts`, `playFiles.test.ts`, `typedAhead.test.ts`, `codeEditor.test.ts` (the change a file brings, completion), `known.test.ts`; `problems/scriptProblems.test.ts` (the editor's problems equal `eb validate`'s with a game, broken every way; the index re-checking when the game changes).
- **e2e on desktop** (`e2e/scripts.spec.ts`): a game started, a module edited in CodeMirror, a sheet made on the game's own event, fact and effect, Run before and after (five coins more each game), exported, and played by `eb sim` to the same lines (the gate); trust for an imported project, kept through a reload and forgotten on delete; a project imported with no scripts running its first; a problem opening its line, undo in the code, completion as you type, a worker with no `fetch`, and a game that never loads.
- **e2e on phones** (`e2e/scriptsPhone.spec.ts`), at 360×740, 390×844 and 740×360: a game started by touch, its script in the inspector's sheet, and Run, with nothing past the screen, 44 px targets and axe.

## Open questions

1. **A sandbox.** Locking the worker down is best effort; a separate origin with no storage would hold a script written to escape. Mods (Phase 9) need it.
2. **Renaming a script.** Imports name scripts by id, so a rename would rewrite them, as renaming a record rewrites its references (M2.6). Today a script is deleted and made again.
3. **The precache.** CodeMirror and the worker nearly double what an install downloads (ROADMAP.md's Readings), so the editor works offline from the first visit. A phone that never opens a script pays for them too.
4. **Type errors as you type** wait on TypeScript in the browser (D38, [scripts.md](scripts.md#open-questions)).
5. **A phone's keyboard.** CodeMirror on a phone has been tried only in Playwright's emulation: the keyboard covering the code, and selection by touch, want a real phone.
