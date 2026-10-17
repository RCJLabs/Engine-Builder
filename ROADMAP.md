# ROADMAP.md: Engine-Builder

**One-liner:** a browser engine and editor for the games RCJ Labs makes. You put in records, missions, scripts, worlds and screens, and the engine does the rest. It runs on a PC, tablet or phone and ships as a PWA or a Play TWA.

**CURRENT MILESTONE: M2.5.** Records tables (Phase 2). M2.4 (forms from type files) is done. The editor is live over HTTPS at engine.rcjlabs.com, and the deploy check confirms it. Phase 1 waits only on your phone: open [`engine.rcjlabs.com/spikes/3d/`](https://engine.rcjlabs.com/spikes/3d/), tap **Measure all tiers**, and send the reading. Phase 0 waits only on your phone check: install the editor from engine.rcjlabs.com and reopen it offline. Worth a look on the phone too: type in a record's form in the inspector sheet, and check the keyboard leaves the box in view ([editor-forms.md](docs/specs/editor-forms.md#open-questions), question 1).

How to read this file:

- Phases run in order. Milestones inside a phase may overlap.
- Gates are tagged **[auto]** when CI or an agent can verify them, and **[you]** when they need your call or a check on a real phone.
- A phase is done when its gates pass, not when its scope list is ticked off.
- Numbers are readings: each records its instrument, date and N in [Readings](#readings) and gets re-taken before anything is built on it.
- Decisions live in [docs/decisions.md](docs/decisions.md), and the design lives in [docs/architecture.md](docs/architecture.md).

**Build order:** core + UI first, then the 3D world, then 2D. This was your call on 2026-10-17. The core and UI phases already cover the menu- and map-driven games (sims, party RPGs, narrative). 3D is the headline, and 2D reuses the 3D viewport.

---

## Phase 0: Foundations

**Goal:** the plan written down, a monorepo whose checks can fail, and an editor shell you can install.

- **M0.1 Plan and docs.** README, ROADMAP, CLAUDE.md, architecture, decisions, and the survey of the existing games.
- **M0.2 Monorepo and guards.**
  - pnpm workspace, TypeScript 7 strict, Biome, Vitest.
  - `@eb/core`, holding the first pure code (FNV-1a over UTF-8).
  - The purity lint (`tools/lint-boundaries`), with fixtures that must fail.
- **M0.3 Editor shell.**
  - Preact + signals.
  - Phone, tablet and desktop layouts.
  - Updates offered only by prompt, never forced.
  - Build stamp and `version.json`; icons.
  - Playwright e2e at 390×844, 844×390 and 1280×800 with axe, plus an offline reload.
- **M0.4 CI and Pages.** One workflow verifies every push and PR, deploys the verified `dist` on `main`, and waits for the live `version.json`.

**Done when:**

- `pnpm check` passes locally and in CI. [auto]
- Every guard has been seen failing: the purity lint on planted code, three tokenizer mutations, axe, the overflow checks, console errors. [auto] Done on the first PR.
- The first deploy from `main` is confirmed by `version.json`. [auto] Done 2026-10-17: CI run 38995712285 saw the live site serve commit `84b8332`.
- You enabled Pages, opened the editor on your phone, installed it, and reopened it offline. [you] Pages is enabled; the phone check is still open.

## Phase 1: Deterministic core

**Goal:** the kernel every game runs on. It is pure and headless, and the same in every browser, in Node and in a worker.

- **M1.1 RNG streams.** Done 2026-10-17.
  - sfc32 seeded through splitmix32, with `fork(label)` streams that don't depend on how many numbers were drawn (as in chooser-of-the-dead).
  - A stream's state is plain data (`toState` / `fromState`), so it lives in game state.
  - Integer helpers: range, percent chance, weighted pick, shuffle.
  - [`docs/specs/rng.md`](docs/specs/rng.md) with golden vectors, so a C++ port can match it.
  - An independent Python implementation, [`rng_oracle.py`](docs/specs/rng_oracle.py), runs in CI against every golden case.
  - Seven planted bugs were each caught by the tests, and so was breaking only the oracle.
- **M1.2 Canonical state hash.** Done 2026-10-17.
  - `canonicalJson` is RFC 8785. Anything a JSON save can't hold throws, with a JSON Pointer path to it.
  - `stateHash` is FNV-1a 64.
  - `readFacets` gives one hash and size per top-level key, with an `exclude` list for logs.
  - `firstDifference` names the first path where two states differ.
  - [`docs/specs/state-hash.md`](docs/specs/state-hash.md) is the spec. [`state_hash_oracle.py`](docs/specs/state_hash_oracle.py) checks it in CI against fixed values plus 300 generated ones.
  - Eight planted bugs were each caught, including one in the oracle alone.
- **M1.3 Records registry.** Done 2026-10-17.
  - Ids and type names are kebab-case, at most 64 characters, and unique per type. A field that points at one type holds a bare id; a field that allows several holds `type:id`.
  - `createRecordStore` in `@eb/core` gives sorted, frozen lookups at runtime.
  - `@eb/schema` defines record types as strict zod schemas and refuses defaults, transforms, `any` and `unknown` when a type is defined.
  - `validateRecords` reports coded diagnostics E001–E006 with a file and a JSON Pointer path, plus a `usedBy` index for the editor. The output never depends on input order (property-tested).
  - `recordJsonSchema` exports draft 2020-12 with `x-eb-ref` on reference fields.
  - [`docs/specs/records.md`](docs/specs/records.md) is the spec. Twenty-six planted bugs were each caught by the tests.
- **M1.4 Project format v1.** Done 2026-10-17.
  - `project.json` (format 1: id, name, version) and `records/<type>/<id>.json`. A newer format asks for a newer engine. A v1 fixture project must keep compiling to its golden pack hash.
  - `@eb/compiler` reads a project from memory, a File System API directory handle (OPFS or an opened folder) or a zip. It checks the files, runs record validation and builds a content pack.
  - A pack is canonical JSON with an FNV-1a 64 content hash. The same files give the same hash whatever their order or formatting (property-tested), and the Python state-hash oracle agrees on the golden. `readPack` in `@eb/core` checks a pack's format, shape and hash before the sim uses it.
  - `pnpm eb validate` and `pnpm eb build` take a folder or a zip, with record types from a `--types` module until kits exist. Exit codes are 0, 1 (errors) and 2 (couldn't run).
  - [`docs/specs/project-format.md`](docs/specs/project-format.md) is the spec. Twenty-two planted bugs were each caught by the tests.
  - The directory-handle source is tested against a fake; it meets real OPFS in M2.1.
- **M1.5 Reducer and module API.** Done 2026-10-17.
  - `reduce(state, action, sim) → { state, beats, accepted }`. A refused action, whether refused by a handler or because the mode doesn't allow it, returns the same state and one `rejected` beat, and keeps none of its changes or draws.
  - Modules register a state slice with actions (`crew/rest`), facts (`crew.alive`), effects (`wound`) and modes. A module changes only its own slice: it reads others through facts and changes them through effects.
  - A slice is copied on its first write in an action. New state is checked as JSON and frozen, and unchanged slices are shared.
  - RNG streams are named `module/name` and saved in the state, so draws carry on across actions and saves and never shift each other.
  - A mode stack whose modes list the actions they allow. Beats carry data, not prose, and `createSession` queues them for the stage to drain and logs accepted actions for replay.
  - Salvage run, a test-only text game, plays 1,000 seeds twice to identical hashes. Replay from the log, and a save→reload→continue run, match an uninterrupted run by hash.
  - [`docs/specs/sim.md`](docs/specs/sim.md) is the spec. Twenty-one planted bugs were each caught by the tests.
- **M1.6 Conditions and effects.** Done 2026-10-17.
  - A condition is a JSON tree (`all`, `any`, `not`, fact tests). Its text form, `hold.count(medkit) >= 2 and not voyage.night`, reads back as the same tree (property-tested over 500 random trees), and parse errors give a column and a hint.
  - Evaluation is three-valued, and a gate opens only on true. Menus (`game.check`) and the sim (`ctx.check`) use the same evaluation, and `describeCondition` words a condition: "Needs 2 medkits and not night".
  - Facts declare their arguments and a domain (bool, int, number, enum, record reference, text). The kernel throws when a fact answers outside its domain.
  - The lint asks whether each condition in content can be true and can be false (W102 to W104), trying every combination of values up to 100,000 and seeded samples past that. A property test holds it to trying every value on small domains.
  - Records carry conditions through `condition()` in `@eb/schema`. Validation checks them against the game's facts (E011 to E014) and adds the records they name to "used by". The compiler and `eb` take the facts from the `--types` module.
  - `game.preview` shows what effects would do from the current state. The `roll` effect in `logicModule` reads one table for its roll and its preview, so the odds shown are the odds rolled (checked over every roll from 1 to 100).
  - Salvage run now gates choices by condition and rolls its outcomes, and its bot offers only what `game.check` allows.
  - [`docs/specs/conditions.md`](docs/specs/conditions.md) is the spec. Fifty-four planted bugs were each caught by the tests.
- **M1.7 Time.** Done 2026-10-17.
  - One tick count, read through the game's own calendar: ticks per day, parts of the day, weekdays, months or a year length, seasons and a start. It is whole-number arithmetic with no `Date`, and a test walks every tick of four years against an independent counter.
  - Time moves only by action: a game action's `wait`, `time/advance`, or `time/elapse` with wall-clock milliseconds. The cap bounds how much one elapse counts, and the part of a tick left over carries, so a stretch settled at once or in pieces gives the same state (property-tested).
  - Timers hold absolute due ticks. They fire by due tick, then in the order scheduled, with the clock at their due tick. They can repeat without drift, carry a condition checked when due, and be replaced or cancelled by name.
  - Each timer fires as one `ctx.attempt`, a new kernel call that undoes refused work by running the action again without it. A consequence that refuses is reported, and time still passes.
  - Facts (`time.day`, `time.phase`, `time.season`, `time.left(timer)`…) feed conditions. Waits and schedules preview what they would fire, and `waitEffect`, `scheduleEffect` and `cancelTimerEffect` check content when a project is built.
  - Salvage run counts its days with the time module. A debt promised to raiders falls due three days later; over 1,000 runs, 1,655 couldn't be paid, and each was refused while the day still passed.
  - [`docs/specs/time.md`](docs/specs/time.md) is the spec. Thirty-one planted bugs were each caught by the tests.
- **M1.8 Saves.** Done 2026-10-17.
  - A save is JSON: a snapshot, the actions since it, the hash of the state they reach, the stage's info (game, edition, build, `savedAt`, a summary) and an FNV-1a 64 checksum. `SAVE_VERSION` 1 covers the file and the kernel's state.
  - Each module versions its slice in `kernel.versions` and migrates it one version at a time. A migration sees only its slice: no content, tuning or clock.
  - Loading old states:
    - a module the save lacks starts from its init, drawing as a new game would;
    - a slice no module owns is kept;
    - a slice from a newer game is refused as `newer`.
  - `loadSave` replays the log strictly on the same build with nothing migrated. After an update it replays leniently, skipping refused actions and reporting the difference, so an update never costs a player their save.
  - `@eb/platform`:
    - IndexedDB, localStorage and memory stores with atomic multi-key writes;
    - slots under `eb/<game>/<edition>/`, each with a summary and a backup;
    - a quarantined copy before anything could lose a save, and a fallback to the backup on load;
    - one write gate that reports every failure;
    - `writeSession` compaction at 200 actions;
    - `EB1` save codes with a 4 MiB unpacking cap;
    - persistence requests.
  - A file export is the save's own JSON. The buttons for files and codes come with the save/load screen (M4.2).
  - [`docs/specs/saves.md`](docs/specs/saves.md) is the spec. Seventy-one of 72 planted bugs were caught by the tests. The survivor removes the cap on a code's inflate buffer, which bounds memory where no test looks; the size check behind it was caught.
- **M1.9 Headless runner.** Done 2026-10-17.
  - **Options.** Actions can list their options, and `game.options` gives every concrete action the current mode allows, so a bot can play any game without code of its own. What is offered must be accepted: the runner counts every refused offer, and `eb sim` fails on one.
  - **Policies.** A bot sees what a player sees: the options, the screen, facts, conditions and previews, never the state. It draws from a stream of its own. There are three: `random`, `weighted` by action type, and `rule`, made of conditions and preferred options as data.
  - **Sweeps.** `sweep` plays many seeds and reports ends, distinct endings, turns, metrics read from facts, and the beats reached.
    - Every number has a 95% interval: Wilson's for shares, Student's t for means.
    - An independent Python oracle checks the statistics in CI.
  - **Golden files.** Each seed keeps its state hash and a hash per slice, so a run that moves names the modules where it moved.
  - **`eb sim <project> --game <module>`** compiles the project, plays it, and prints the report or JSON. `--golden` checks a golden file, and with `--update` writes it. Salvage run's content is now a project folder, and 50 golden runs of it are checked in CI.
  - **A first finding.** Resting costs salvage run no time, so a bot that rests whenever someone is hurt never loses. The game is test-only, so this is noted, not fixed.
  - [`docs/specs/runner.md`](docs/specs/runner.md) is the spec. Forty-seven planted bugs were each caught by the tests. The first run let three through, and each got a test that fails it: options listed in registration order, an empty `modules` export, and a report that printed the run count where it meant distinct endings.
- **M1.10 3D spike** (throwaway, served at `/spikes/3d/`). Built 2026-10-17; its gate waits on your phone.
  - [`apps/spike-3d`](apps/spike-3d/README.md): three.js's WebGPURenderer, which falls back to WebGL2. It draws a 256² heightmap terrain, 5,000 instanced trees, one skinned character, and a sun with shadows.
  - **Tiers.** Low, medium and high change the pixel ratio, the shadow map, soft shadows and 4× MSAA, never the scene. An overlay shows frames per second, the median and 95th-percentile frame, draw calls, triangles, and Rapier's load time.
  - **Measure all tiers** runs each tier on each backend, on a fresh page load per step, and ends with a reading to copy into Readings.
  - **Physics stands on the drawn ground.** Rays on Rapier's heightfield land within 8.4e-6 of the drawn triangles, and a transposed field or the other diagonal fails the check.
  - **Deployment.** It is built into the editor's `dist` after the editor, so it never enters the editor's bundle or offline cache. The editor's service worker leaves `/spikes/` to the network; without that, an installed editor answers the spike's URL with itself, which an e2e test shows.
  - Thirty-four planted bugs were each caught. The first run let four through, and each got a test: a tolerance loose enough to pass the wrong diagonal, trees above the band, trees on steep ground, and a camera allowed into hills.

**Done when:**

- A test-only text game runs 1,000 seeds deterministically. [auto] Done 2026-10-17 (M1.5): salvage run in `packages/core/src/sim/salvage.test.ts`.
- Save → load → continue matches an uninterrupted run by hash. [auto] Done 2026-10-17 (M1.8): 50 seeds through save files in `packages/core/src/save/save.test.ts`, and 5 through each store in `packages/platform/src/saves.test.ts`.
- A v1 save fixture loads after a planted v2 migration. [auto] Done 2026-10-17 (M1.8): `packages/core/test/fixtures/saves/salvage-v1.json`, with a planted v2 of the hold.
- RNG golden vectors are frozen in the spec. [auto] Done 2026-10-17 (M1.1): [`docs/specs/rng.md`](docs/specs/rng.md), checked against `rng_oracle.py` in CI by `packages/core/src/rng.oracle.test.ts`.
- FPS per tier for the 3D spike, from your phone, is recorded in Readings. [you] The page is live (M1.10): open [`engine.rcjlabs.com/spikes/3d/`](https://engine.rcjlabs.com/spikes/3d/) on the phone, tap **Measure all tiers**, and send the reading it ends with.

## Phase 2: Editor foundation

**Goal:** make and keep a project on any device. Data editing works; logic and worlds come later.

- **M2.1 Project storage.** Done 2026-10-17.
  - **The domain** is engine.rcjlabs.com, your call (D28). The editor's base path is `/`.
  - **Projects live in OPFS.** The Project panel creates, lists, opens, exports and deletes them, and a reload keeps them. Every write goes through one worker's sync access handles: the one OPFS write in Chrome, Firefox and every Safari since 15.2.
  - **"Open folder"** works on desktop Chromium. M2.1 reads the folder and can copy it in or export it; writing to it comes with editing. Recent folders are remembered, and access is asked for again when the browser wants it.
  - **Zips** carry only a project's own files, never a repo's README or `node_modules`. The same files give the same bytes in any time zone. Import is limited to 10,000 files and 100 MB.
  - **A persistent-storage request** goes with the first stored project, and the panel says whether the browser will keep it.
  - [`docs/specs/editor-storage.md`](docs/specs/editor-storage.md) is the spec. Thirty-two planted bugs were each caught. The first run let three through, and each got a test:
    - ids longer than 64 characters;
    - sizes counted in 1,024s;
    - the writer's worker left out of the offline cache. Playwright's offline mode doesn't reach a worker's script, so that test now reads the cache itself.
- **M2.2 Layout.** Done 2026-10-17.
  - **Desktop docks its panels** with dockview, loaded only on desktop. Tabs move between groups and split them. The layout is saved in this browser 300 ms after a change and comes back on the next visit. Nothing is saved until the first change, and "Reset the layout" forgets it, so an untouched dock follows the editor's default (D29).
  - **On a phone, the inspector is a sheet** above the tab bar, so the panel it inspects stays in view.
  - **A command palette** on every layout, from the top bar or Ctrl/⌘+K. It can start, import, open, export and close projects, show any panel (focus goes with it), and reset the layout.
  - **The deploy check** now loads what the live page loads, not only `version.json` (`tools/site-check`). It was seen failing on a build for the old `/Engine-Builder/` base.
  - **Every axe impact counts now.** The shared e2e check let moderate issues through, and the dock's repeated landmarks were moderate.
  - [`docs/specs/editor-layout.md`](docs/specs/editor-layout.md) is the spec. Thirty-four planted bugs; the first run caught 29, and each survivor changed something:
    - the ranking test, whose sample commands were already in ranked order;
    - Ctrl+K, which the tests sent with a capital K, as Caps Lock does;
    - the shut sheet, which built the inspector out of sight with nothing to say so;
    - the palette closing before its command runs, which nothing needed until the Show commands moved focus;
    - a second clear after a failed restore, deleted, since dockview already clears.
- **M2.3 Editing safety.** Done 2026-10-17.
  - **Undo and redo through a command log** of file changes, each file's bytes before and after (D30). Steps in one field within 500 ms join; the newest 100 are kept.
    - The top bar's Undo and Redo name the step. The keys are Ctrl/⌘+Z and Ctrl/⌘+Shift+Z or Ctrl+Y, and the palette offers both.
  - **Edits save by themselves**: 1 s after the last one, at once when the page hides, on close and before a hand-over. While an edit is unsaved, or not yet even made, the update toast waits and leaving asks.
  - **A save a crash can't tear.** Stored projects save through a journal, which is finished on the next open or dropped when torn. Tested by cutting the power at every step of a save: the files come out all old or all new.
  - **One editing tab per project**, holding a Web Lock.
    - Other tabs open the project read only and follow its saves.
    - Edit here hands over, and Take over takes the lock from a tab that doesn't answer.
    - A project open for editing elsewhere can't be deleted.
  - **The first edits** are the project's name and version, written back in the file's own layout. Opened folders save in place after a tap on Allow changes.
  - **The deploy check needs HTTPS**: M2.2's first run on `main` passed against `http://engine.rcjlabs.com/`.
  - [`docs/specs/editor-editing.md`](docs/specs/editor-editing.md) is the spec. Forty-one planted bugs; the first run caught 37, three tests were sharpened, and one planted bug was redone.
  - The research added two behaviours, and a last review found a third: saves cut short are finished before the library is listed, so a torn `project.json` never looks broken. Each has a test seen failing.
- **M2.4 Forms from schemas.** Done 2026-10-17.
  - **Record types are data** (D31, your call). A project's `types/<type>.json` lists a type's fields in twelve kinds: text, int, number, bool, enum, ref, list, map, group, colour, asset and condition. The compiler builds each into the strict zod schema a code type has, so `eb validate` needs no `--types` module for them. New codes E015 to E018 and W105 ([type-files.md](docs/specs/type-files.md)).
  - **Conditions in files may be text or tree** (D31, your call). The pack always holds the tree, and a project gives the same hash either way.
  - **Forms in the inspector**, the sheet on a phone, from the Project panel's records list, with New and Delete as steps undo takes back ([editor-forms.md](docs/specs/editor-forms.md)).
    - Number boxes with a slider when bounded, pickers that search for refs and assets, and lists and maps changed by buttons.
    - A condition field that reads its condition back in words.
    - The compiler's own problems beside each field, shown once a field is left.
  - **A form writes what the field's JSON can hold**, valid or not, as typing it by hand would, and keeps back only what isn't a value yet.
  - **The forms load when a record is first chosen**, so the editor's start grew 8.2 kB instead of 20.
  - **Found while building it:**
    - a race that wiped a key pressed as an edit landed, in M2.3's fields too;
    - field names like `toString`, which zod reads from every object;
    - Ctrl+Z in a form's box was the browser's own undo, not the editor's: a planted bug that survived showed it;
    - an item added to a list lost its focus when the record took more than one render to read again (seen on CI, then reproduced by slowing the read).
  - Sixty-two planted bugs; the first runs caught 55. Each survivor changed something:
    - two tests added, for three-digit colours and record order;
    - a deterministic test for the race;
    - a later edit as a barrier before checking a save didn't happen;
    - the undo fix;
    - dead code removed.
- **M2.5 Records tables.** Sort, filter, search, bulk edit, duplicate, and a "used by" list.
- **M2.6 Custom record types.** Define your own data types (players, gladiators, cards) as fields, which become a schema.
- **M2.7 Asset browser.**
  - Import images, audio, models and fonts; thumbnails.
  - A provenance log per asset: source, licence, prompt, date, hand edits.
  - The licence check refuses NC, ND and SA. Stand-in art fills in until real art lands.
- **M2.8 Problems and console panels.**
  - The CLI validates exported projects in CI.
  - `eb schemas` writes each record type's JSON Schema, plus a `.vscode/settings.json` that maps `records/<type>/*.json` to it, so hand edits get autocomplete ([project-format.md](docs/specs/project-format.md#open-questions), question 1).

**Done when:**

- On a phone, you create a project with 20 records across 3 types (one of them custom), reload it and export a zip. [you]
- The CLI validates that zip in CI with the same content hash. [auto] M2.1's part: an e2e test imports a zip, exports it, and the CLI reads the export to the fixture's hash. M2.4's part: a project edited through its forms and exported, which the CLI reads with no `--types` module to the hash of the same edits made in Node (`e2e/formsPhone.spec.ts`). A project's types are in its `types/` since M2.4 (D31), so "one of them custom" now means a type designed on the phone, which needs M2.6's designer.
- A project opened from a git folder on desktop round-trips with zero diff. [auto] `apps/editor/src/projects/roundtrip.test.ts`:
  - M2.1: a git checkout taken into the browser and out as a zip leaves the checkout clean.
  - M2.3: edits saved into the opened folder leave no diff once undone, and a rename changes one line, keeping the file's byte order mark and line ends.

## Phase 3: Game logic

**Goal:** everything a game *does*, built in the editor without touching engine code.

- **M3.1 Trigger sheets.** "When / If / Do" rows over the event catalogue and the shared conditions and effects.
  - The flag lint from rule-or-drool: facts set but never read, or read but never set. It needs effects to declare which facts they change ([conditions.md](docs/specs/conditions.md#open-questions), question 2).
- **M3.2 Scripts.**
  - TypeScript components edited in CodeMirror 6 and transpiled by sucrase in a worker.
  - A typed `ctx` API with autocomplete.
  - Sim scripts linted for purity (the same rules as `tools/lint-boundaries`).
  - Hot reload.
- **M3.3 Kits I.** Stats, attributes, modifiers and effects (a light gameplay-ability system), inventory, equipment, loot tables, resources, economy and shops.
- **M3.4 Kits II.** Factions with standing bands; a roster with traits, wounds, ranks, bonds and recruits; time and calendar.
- **M3.5 Choice events.** Costs shown on every choice, weighted outcomes, and consequences that land N turns, days or nodes later.
- **M3.6 Dialogue.**
  - Visual dialogue trees.
  - ink scenes compiled in the browser, with an EXTERNAL whitelist, `# fx:` tags and a lint that walks every path.
- **M3.7 Missions.**
  - One quest model covering choice events, multi-step quests with done/cold branches, timed contracts and counter objectives.
  - Bethesda-style stages, objectives and aliases.
  - The mission designer (a step list plus a graph view), a journal, and validation for unreachable steps, dead ends and missing aliases.

**Done when:** a text/menu adventure built only in the editor passes bot reachability headless in CI, with every quest completable. It has one quest from each mission family, 2 dialogue trees, 1 ink scene, a shop and factions. [auto]

## Phase 4: UI, menus, play, export → Proof #1

**Goal:** a whole game from the editor to a phone, with title screen, menus, HUD and saves.

- **M4.1 Runtime UI.**
  - Widgets, layout with safe areas and breakpoints, themes checked for AA contrast.
  - Bindings to state, a screen stack, spatial focus navigation (keyboard and gamepad), touch gestures.
  - Toasts and a log; screen-reader announcements derived from events.
- **M4.2 Stock screens.**
  - Title (slots, Continue, New, Daily), settings (audio, display, controls, accessibility), save/load, pause, HUD.
  - Inventory, journal, map, dialogue, shop, codex built from live numbers.
  - Credits, ending, crash, update prompt.
- **M4.3 UI designer.** WYSIWYG, with device frames at 360×740, 390×844, tablet and desktop.
- **M4.4 World map.** A node-graph editor and a seeded route-map generator, with placement rules checked by validators.
- **M4.5 Encounters.** A framework with auto-resolve; the odds shown are the odds rolled.
- **M4.6 Audio.** A synth SFX designer (ZzFX-style parameters and presets), ambience beds, music stems and buses. Haptics read the same cues.
- **M4.7 Play-in-Editor.** A state inspector, event log, time controls, quest debugger, save states and replay.
- **M4.8 Export.**
  - A target matrix per project: Pages PWA, single-file HTML, itch, and a TWA (Bubblewrap, from dirtbag's pipeline).
  - Editions with a leak check.
  - A service worker whose cache is hashed and prefix-scoped, plus the update gate.
  - `version.json`, generated icons, and a Pages workflow template.
  - "Publish to GitHub".
- **M4.9 Templates.** "Expedition run" (hub → map → nodes → events and contracts → aftermath) and "Story/choice".
- **M4.10 Proof #1: Space-Wrecked acts 1–2.**
  - The hangar job board and shop → launch → the sector run (events, contracts, stations, factions, crew, heat) → the settle choice.
  - Fights auto-resolve, because the builder and boarding tactics wait for Phase 7.

**Done when:**

- An import script maps space-wrecked's events (29), quests (11), contracts (29), factions, traits, encounters, recruits and companions with zero validation errors. Anything that needs an engine change is logged as an engine issue: content needing engine edits means the engine is wrong. [auto]
- Bots finish 500 seeded runs, and every act 1–2 quest step is reachable. [auto]
- It is playable from Pages on your phone in landscape, and it installs. [you]
- A UI-only export stays within a size budget set from a measured reading. [auto]

## Phase 5: 3D world building

**Goal:** Creation Kit-style world building in the browser.

- **M5.1 Viewport.**
  - three.js, WebGPU first with WebGL2 fallback.
  - Editor camera: orbit and fly; on touch, one finger orbits and two pan or pinch.
  - Gizmos with touch handles, snapping, multi-select, outliner, prefabs.
- **M5.2 Scenes.** A scene and component format; a component registry with schemas and inspectors; placed references that override their base records.
- **M5.3 Terrain.** Heightmap sculpting and splat painting with touch brushes, chunked LOD, water, scatter and foliage (instanced).
- **M5.4 Environments.**
  - Sky, sun and time of day, fog, weather.
  - Presets: desert/wasteland, coast/fjord, forest, snow, cave/dungeon, sci-fi interior, town.
- **M5.5 Assets.**
  - glTF/GLB import with Draco and Meshopt, KTX2 textures, material presets, LOD, generated colliders.
  - A CC0 starter kit with provenance and licence checks.
- **M5.6 Performance.** Quality tiers (auto-detected, overridable), a perf HUD, and budgets enforced in CI.
- **M5.7 Movement.** Rapier physics; 1st- and 3rd-person controllers and camera rigs; a touch stick, keyboard and gamepad.
- **M5.8 Worldspaces.**
  - Chunked exteriors with streaming; interiors and load doors; loading screens.
  - Persistent references, saved as changes against the authored content.
  - Snapping for modular kits.

**Done when:**

- A walkable slice passes e2e: 1 exterior and 2 interiors, pickups going into the inventory, a quest step driven by a trigger, and save/load restoring positions. [auto]
- FPS per tier on your phone meets the target set from the M1.10 readings. [you]

## Phase 6: 3D life → Proof #2

**Goal:** the world is inhabited. NPCs keep schedules, fight and talk.

- **M6.1 NPCs.** Built from actor records: appearance, stats, inventory, faction, dialogue.
- **M6.2 Navigation.** Navmesh baking (recast-navigation-js) and crowds.
- **M6.3 AI.** Packages and schedules (sandbox, patrol, travel, follow, sleep, work), data-driven behaviour trees, and perception by sight and hearing.
- **M6.4 Combat.** Real-time melee and ranged; hits are detected by physics and damage is resolved in the sim; projectiles; death and loot.
- **M6.5 Animation.** State machines from clips, sharing one rig.
- **M6.6 Quest UX.** Markers, compass and map; radiant aliases ("find a matching reference"); barter and containers.
- **M6.7 Templates.** "Open-world RPG (3rd person)" and "First-person adventure".
- **M6.8 Proof #2: a Bethesda-style mini world.** 1 exterior, 3 interiors, 5 scheduled NPCs with dialogue, 3 quests (main, side and radiant), combat and barter. The theme is an open question.

**Done when:**

- Bots complete every quest headless; Rapier runs in Node. [auto]
- It holds ≥30 fps on your phone at Low and Med. [you]

## Phase 7: 2D worlds and genre kits → Proof #3

**Goal:** the rest of the portfolio's styles and genres.

- **M7.1 2D scenes.** Orthographic, on the same viewport: sprites and sprite-sheet animation, parallax, pixel-perfect integer scaling.
- **M7.2 Tilemaps.** Layers, autotiling, ASCII import, and walk/cover/sight per tile.
- **M7.3 Side-view rooms.** Floors with room slots, stairs and route-finding.
- **M7.4 Custom stages.** An API for renderers drawn in code (Canvas2D, SVG), so code-drawn styles keep working inside the engine.
- **M7.5 Kits.** Grid tactics (cover, overwatch, sight), ranked squad, tower defense (paths, waves, towers, fixed tick), base/colony builder.
- **M7.6 Templates.** Tactics, Squad roguelite, Tower defense, Side-view builder, Manager sim.
- **M7.7 Proof #3: Space-Wrecked's ship builder and a boarding fight,** rebuilt on the engine.

**Done when:** the proof passes its bots and goldens [auto] and plays on your phone [you].

## Phase 8: Advanced authoring

- Node-graph scripting, compiled to the same actions and effects as trigger sheets.
- A cutscene sequencer: a timeline for camera, animation, dialogue and audio.
- A behaviour-tree graph editor.
- Localization: ICU string tables, string extraction, pseudo-localization, a missing-key marker.
- Balance Lab dashboards: seed sweeps, A/B content overrides, confidence intervals.
- Achievements and platform services (Steam, Play).
- Electron/Steam export (from dirtbag's `desktop/`); store-asset capture; crash replay.

## Phase 9: Ecosystem

- Content packs with a load order, for DLC and mods (Bethesda-style overrides).
- A plugin API for third-party kits, with sandboxed scripts.
- A docs site, tutorials and a template gallery.
- Optional AI drafting of records, quests and dialogue with your own API key.
- Capacitor builds for iOS and Android, if a native build is needed.
- An Unreal hand-off: content as JSON for DataTables, plus RNG golden vectors.

**Out of scope unless you revisit it:** multiplayer, console exports, photoreal rendering (that stays an Unreal job).

---

## Readings

Each number names its instrument, date and N, and gets re-taken before anything is built on it.

| Reading | Value | Instrument | Date | N |
| --- | --- | --- | --- | --- |
| Editor shell JS, gzip | 12.7 kB app + 2.2 kB workbox-window | `vite build` output | 2026-10-17 | 1 build |
| Editor shell CSS, gzip | 1.7 kB | `vite build` output | 2026-10-17 | 1 build |
| Editor shell precache | 16 entries, 72 KiB. Re-measured at M1.10 with the 3D spike built into the same `dist`: still 16 entries, 72.10 KiB | vite-plugin-pwa build log | 2026-10-17 | 1 build each |
| Sim kernel reduce, salvage run (M1.5 content) | 18.2–22.7 µs per action (median 20.0) over 80,911 actions | `node packages/core/test/salvage-bench.ts`, Node 22.22, cloud container | 2026-10-17 | 5 runs |
| Sim kernel reduce, salvage run (M1.6: conditions and rolls) | 20.5–23.8 µs per action (median 21.6) over 74,658 actions. The M1.5 content on the M1.6 kernel gave 19.7–22.9 µs (median 21.4) over the same 80,911 actions | `node packages/core/test/salvage-bench.ts`, Node 22.22, cloud container | 2026-10-17 | 5 runs each |
| Sim kernel reduce, salvage run (M1.7: days and debts) | 23.4–26.7 µs per action (median 24.9) over 74,534 actions | `node packages/core/test/salvage-bench.ts`, Node 22.22, cloud container | 2026-10-17 | 5 runs |
| Offline settle, 8 hours at a tick a second, 100 hourly timers | 7–12 ms (median 9) for 800 firings; 101–120 ms (median 108) when 8 timers refuse every time, re-running the action 64 times | `node packages/core/test/time-bench.ts`, Node 22.22, cloud container | 2026-10-17 | 5 runs |
| Save and load, salvage run | 1,000 whole runs, 66.4 logged actions and 2,672 bytes a save (largest 2,931). Save 264–296 µs (median 276); load, with checksum, migration and replay, 2,015–2,226 µs (median 2,087), which is 30.4–33.5 µs per logged action (median 31.4) | `node packages/core/test/save-bench.ts`, Node 22.22, cloud container | 2026-10-17 | 5 runs |
| Save codes, salvage run | 679 characters a code (longest 717) for 2,694 bytes of JSON. Encode 359–391 µs (median 370), decode 897–959 µs (median 923) | `node packages/platform/test/code-bench.ts`, Node 22.22, cloud container | 2026-10-17 | 5 runs |
| Seed sweep, salvage run | 1,000 runs with the random policy and 4 metrics, 70,106 turns: 2,131–2,233 ms (median 2,176), which is 30.4–31.8 µs a turn (median 31.0), against about 25 µs for reduce alone | `node packages/core/test/sweep-bench.ts`, Node 22.22, cloud container | 2026-10-17 | 5 runs |
| Condition lint at its caps | 20–30 ms (median 25) to try all 100,000 combinations; 17–25 ms (median 20) for 20,000 samples | `node packages/core/test/sat-bench.ts`, Node 22.22, cloud container | 2026-10-17 | 5 runs |
| 3D spike FPS per tier, your phone | not taken yet | M1.10 overlay: **Measure all tiers** | | |
| 3D spike bundle, gzip | 223.5 kB for the page and three.js (810.0 kB raw); 1,669.3 kB for Rapier (4,332.8 kB raw), whose 3.08 MB of WebAssembly is inlined as base64. A separate `.wasm` would be 1,168.7 kB at gzip -9, against 1,652.9 kB for the compat module | `vite build` output; Python's gzip for the `.wasm` comparison | 2026-10-17 | 1 build |
| Editor JS, gzip (M2.1) | 51.3 kB, up from 12.7 kB at Phase 0: the compiler with zod and fflate is 33.8 kB of it, loaded at start so the library can read project names. Plus a 1.0 kB OPFS writer worker | `vite build` output; a split build for the compiler's share | 2026-10-17 | 1 build |
| Editor precache (M2.1) | 17 entries, 195.5 KiB | vite-plugin-pwa build log | 2026-10-17 | 1 build |
| Editor JS, gzip (M2.2) | 53.5 kB at start, up 2.2 kB from M2.1 for the palette, the sheet and the commands. The dock adds 80.6 kB of JS and 10.9 kB of CSS (339.8 kB and 136.0 kB raw), loaded only on desktop. Its CSS carries 17 themes the editor doesn't use | `vite build` output | 2026-10-17 | 1 build |
| Editor precache (M2.2) | 19 entries, 668.1 KiB, of which the dock's two files are 464.6 KiB | vite-plugin-pwa build log | 2026-10-17 | 1 build |
| Editor JS, gzip (M2.3) | 58.3 kB at start, up 4.8 kB for editing: the command log, journal client, lock and fields. The OPFS worker is 3.4 kB raw, up from 1.1 kB with the journal | `vite build` output | 2026-10-17 | 1 build |
| Editor precache (M2.3) | 19 entries, 685.7 KiB | vite-plugin-pwa build log | 2026-10-17 | 1 build |
| Editor JS, gzip (M2.4) | 66.5 kB at start, up 8.2 kB for type files, the records list and the catalog. The record form and the checks it runs, 13.3 kB, load when a record is first chosen; without that split the start was 78.4 kB. The OPFS worker is 3.2 kB raw | `vite build` output; a build without the split | 2026-10-17 | 1 build each |
| Editor precache (M2.4) | 20 entries, 750.3 KiB | vite-plugin-pwa build log | 2026-10-17 | 1 build |
| Form checks, 2,008 records (ludus types, 2,000 gladiators with text conditions) | The catalog, read after every change, 3.8–5.7 ms (median 4.3); one record checked, on every keystroke, 1.15–1.23 ms (median 1.22). In memory: OPFS listing in a browser adds its own time | `node apps/editor/test/form-bench.ts`, Node 22.22, cloud container, medians of 20 and 200 a run | 2026-10-17 | 5 runs |
| One save through the journal (`project.json`) | 14–20 ms (median 17) from "Saving…" to "All changes saved."; from keystroke to saved 1,027–1,044 ms (median 1,031), nearly all the 1 s wait | headless Chromium 1194 on `vite preview`, cloud container, a fresh context each, timed in the page | 2026-10-17 | 5 runs |
| Desktop dock start | The shell renders 46–66 ms after navigation starts (median 53). The dock is up at 134–159 ms (median 148), 87–100 ms after the shell (median 90). Served from localhost, so no network time | headless Chromium 1194 on `vite preview`, cloud container, a fresh context each, timed in the page | 2026-10-17 | 5 runs |
| OPFS reads, 1,001 small files | 3,033 ms one after another, 524 ms all at once | headless Chromium 1194, cloud container, timed in the page | 2026-10-17 | 1 run each |
| OPFS writes, 1,001 files of 190 bytes | 1,866–2,064 ms (median 1,950) through the writer worker, 16 at a time | headless Chromium 1194, cloud container, timed in the page, fresh context each | 2026-10-17 | 5 runs |
| A 1,000-record project (1,001 files, 188 kB) through the Project panel | Import 2,355–3,174 ms (median 2,372); export 799–956 ms (median 845), down from 3,248 ms before reads ran 32 at a time. Each includes up to about 0.5 s of Playwright's polling | headless Chromium 1194 on `vite preview`, cloud container, fresh context each | 2026-10-17 | 5 runs |
| Rapier load, no phone | Headless Chromium on a page drawing nothing: import 217–233 ms (median 226), start 75–90 ms (median 79). Node: import 27–38 ms (median 30), start 90–127 ms (median 123). On the spike's page, while drawing in software: about 0.9 s and 0.45 s | Chromium 1194 (Playwright 1.56.1) on `vite preview`, a fresh context each, and Node 22.22, both in the cloud container | 2026-10-17 | 5 each |

## Open questions

1. **Editor domain.** Settled 2026-10-17: `engine.rcjlabs.com` (D28).
2. **Engine licence.** chooser-of-the-dead is GPL code with its story and art reserved. Pick before any outside contributions; until then the repo has no licence, which means all rights reserved.
3. **Theme of proof #2.** Landnam's coast, Wasteland Protocol's desert, Dirtbag's valley, or something new?
4. **TWA package ids.** `io.github.rcjlabs.*` and `com.rcjlabs.*` are both in use today. Pick one scheme before the first engine-built TWA.
5. **Orientation on large screens.** A third-party report says SDK 36 apps can no longer lock orientation on screens ≥600dp. Verify before shipping a landscape-only game such as Space-Wrecked as a TWA.
6. **Reference phone for 3D.** D8 is judged on a mid-range phone, and the 3D frame-rate targets come from its reading. Which phone is it? Decide with the first spike reading.
