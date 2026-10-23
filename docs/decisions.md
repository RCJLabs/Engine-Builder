# Decisions

Each decision is numbered and dated, with a status:

- **LOCKED** is settled. Changing it takes a new dated entry that says why.
- **PROPOSED** is the working plan until the milestone named in it confirms it.
- **OPEN** is waiting on a call.

Product decisions are Evan's. The others record what was chosen and why.

---

### D1. A browser-first TypeScript engine. LOCKED, 2026-10-17 (the brief)

**Decision.** Build a TypeScript engine and editor that run in the browser. Don't build on Godot, Unity or Unreal.

**Why.**
- The whole portfolio is web-first: PWAs on GitHub Pages and TWAs on Play.
- The editor has to work on a phone, including iOS, which a browser covers.
- The existing games' sims are TypeScript and can move over.
- Download size matters: 2060td dropped Phaser because it was three quarters of the download. A WebAssembly engine runtime would add megabytes to every game.

**Cost.** Everything an off-the-shelf engine provides has to be built or assembled from libraries. That is why the roadmap grows the engine only through proof games.

### D2. The sim decides, the stage renders. LOCKED, 2026-10-17

**Decision.**
- Game state changes only through `reduce(state, action, ctx) → { state, events }`, in packages marked `"eb": { "pure": true }`.
- `tools/lint-boundaries` (ported from chooser-of-the-dead, with a tokenizer in place of its comment regex) and a tsconfig without DOM or Node types enforce purity.
- Stages (DOM, 2D, 3D) render state and turn input and physics facts into actions.

**Why.** Every recent game already works this way. It is what makes saves, replays, daily seeds, golden tests and headless balance bots possible.

**Cost.** In 3D, frame-level motion is not deterministic. Replays re-run actions, not frames (see architecture.md).

### D3. Toolchain. LOCKED, 2026-10-17

**Decision.**
- pnpm 10 workspaces, TypeScript 7.0 strict (`erasableSyntaxOnly`, `noUncheckedIndexedAccess`), Vite 8, Vitest 5, Biome 2.5.
- Playwright 1.56.1 with axe.
- Node ≥ 22.18, so tools run with native TS stripping.

**Why.**
- These are the newest pinned toolchains in the most recent repos (chooser-of-the-dead, who-am-i-).
- Playwright 1.56.1 matches the Chromium preinstalled in Claude Code's cloud containers, so e2e runs there with no browser download. CI installs its own.

### D4. Preact + signals for the editor and in-game UI. LOCKED for the editor, 2026-10-17; LOCKED for game UI, 2026-10-19 (Evan's call, D51)

**Decision.** Preact 11 with @preact/signals. Reach for React-only libraries through `preact/compat` only when unavoidable.

**Why.**
- Small, which matters for a game's download.
- React-compatible.
- Already the favoured stack in chooser-of-the-dead and climbing-world-traveler.

### D5. Project format: a folder of JSON, one record per file. LOCKED, 2026-10-17 (M1.4)

**Decision** ([specs/project-format.md](specs/project-format.md)).
- A project is a folder: `project.json` (format 1: `id`, `name`, `version`) and `records/<type>/<id>.json`. The folder names the type and the file name the id.
- The compiler reads only the parts it knows, so a project can sit at the root of a game's repo. Hidden entries are never read.
- `PROJECT_FORMAT` follows `SAVE_VERSION`'s rule: it goes up only when today's projects would no longer load unchanged, with a migration and a fixture of the old format that must still compile.

**Why JSON rather than YAML.**
- The editor writes these files. JSON round-trips without losing formatting or comments that the editor would never see.
- Diffs stay small with one record per file and stable key order.
- JSON Schema still gives autocomplete when editing by hand.

**Revisit if** hand-writing long prose in JSON proves painful. Long-form text belongs in ink anyway.

### D6. One condition language, one effect vocabulary, all data. LOCKED, 2026-10-17

**Decision.** Quests, dialogue, events, triggers, achievements and UI bindings share one condition tree (with a text form that round-trips) and one effect list. `preview()` gives the exact odds shown on screen.

**Why.**
- wasteland-protocol's content is closures, so it can't be saved, validated or edited in an editor.
- space-wrecked's and dirtbag's data-only conditions and effects can.
- One vocabulary means one set of editor pickers.

### D7. Logic: no-code triggers plus TypeScript; node graphs later. LOCKED, 2026-10-17 (Evan's call)

"When / If / Do" trigger sheets cover most mission and level logic. TypeScript script components cover the rest. Node graphs come in Phase 8 and compile to the same runtime.

### D8. 3D: three.js WebGPURenderer with WebGL2 fallback; Rapier; recast-navigation-js. PROPOSED until the M1.10 spike readings, 2026-10-17

**Why.**
- three.js has the largest ecosystem, and its `WebGPURenderer` falls back to WebGL2 automatically.
- WebGPU is on by default in Chrome (Android 12+ on Qualcomm and ARM GPUs, with a compatibility mode for older phones since Chrome 146) and in Safari 26, including iOS 26.
- Rapier runs in browsers and in Node, so 3D quests can be bot-tested headless.
- All of it is lazy-loaded, so games without 3D never download it.

**What would change it.** Spike readings on a mid-range phone that miss the Low-tier target.

**Status, 2026-10-17 (M1.10).** The spike is built and live at `/spikes/3d/` ([apps/spike-3d](../apps/spike-3d/README.md)). It works in headless Chromium on WebGL2, and Rapier's heightfield agrees with the drawn terrain. That proves only that the stack works. D8 stays PROPOSED until a phone's reading is in ROADMAP's Readings.

### D9. Dialogue: visual trees plus ink scenes. LOCKED, 2026-10-19, as D46 settles it

- Trees in dirtbag's `TalkDef` shape for most talk, edited with forms and a map, by touch on a phone (M3.8).
- ink for long-form writing, compiled into the same talks (M3.10, now M3.11 since D47), rather than played by chooser-of-the-dead's stateless scene player. D49 settles how: our own parser of chooser's subset, `scenes/<id>.ink`, facts named by EXTERNALs.
- Both use the shared conditions and effects, and one player in the sim.

### D10. Editor storage: projects in OPFS written by one worker, folders opened on desktop, zips that carry only the project; GitHub sync in Phase 4. LOCKED, 2026-10-17 (M2.1)

**Decision** ([specs/editor-storage.md](specs/editor-storage.md)).
- **Projects live in OPFS**, a folder each under `projects/`, named by id (`-2`, `-3` for a second copy). Each holds the project's own files as they sit on disk.
- **Every OPFS write goes through one worker** using sync access handles. A copy is marked `.unfinished` until its last file is written.
- **"Open folder"** works where `showDirectoryPicker` exists. M2.1 only reads the folder. Recent folders are kept in IndexedDB (`eb-editor`, `folders`).
- **Zips** carry only the project's own files, in one top folder, sorted and dated 1980, so the same files give the same bytes. Import is limited to 10,000 files and 100 MB.
- **Persistence** is requested with the first stored project, and the panel says whether the browser will keep it.
- **GitHub sync (Phase 4)** stays the backup and the route from a phone to a repo.
- **The domain** is engine.rcjlabs.com (D28).

**Why.**
- **OPFS** is the one file store every browser has, phones included. Keeping files as they are on disk lets a project move to a folder or a zip unchanged.
- **The worker:** sync access handles are the one OPFS write that Chrome 102, Firefox 111 and Safari 15.2 all have. `createWritable` reached Safari only in 26.
- **Only the project's files:** a project at the root of a game's repo exports without the repo's README or `node_modules`.
- **The same bytes:** exports can be diffed, and a round trip through the editor leaves a git checkout clean, which a test proves.

**Cost.**
- **Not atomic per file.** That's fine for copies, which the marker covers. Saving edits (M2.3) needs more (the spec's open question 1).
- **Speed:** about 2 ms per file written in headless Chromium, so 1,000 records take about 2 s, and more on a phone (Readings).
- **Weight:** the compiler, with zod, loads at start. It is 33.8 kB of the editor's 51.1 kB of gzipped JS.
- **Safari** may delete a site's data after 7 days without a visit, unless the site is a Home Screen app. Zips are the backup until Phase 4.

### D11. Export targets as a per-project matrix. PROPOSED until M4.9 (M4.10 since D53), 2026-10-17

The targets are Pages PWA, single-file HTML, itch.io, Play TWA, and later Electron/Steam. Each has an edition (demo, full, playtest), packs, a storage namespace and a leak check. The pattern comes from chooser-of-the-dead's `targets.ts`, and the TWA pipeline from dirtbag's `build-twa.yml`.

### D12. Build order: core + UI, then 3D, then 2D. LOCKED, 2026-10-17 (Evan's call)

The core and UI phases already ship menu- and map-driven games. 3D is the headline feature. 2D comes last, reusing the 3D viewport in orthographic mode.

### D13. Phone editing: every panel works on touch, tuned for PC and tablet. LOCKED, 2026-10-17 (Evan's call)

Data, missions, dialogue, UI and scripts must be comfortable on a phone. 3D layout works there, but it is best on a tablet or PC.

### D14. Proof #1 is Space-Wrecked, acts 1–2. LOCKED, 2026-10-17 (Evan's call)

Its JSON events, quests and contracts are the cleanest existing content data, so importing them tests the record, condition and effect model against real data. The ship builder and boarding tactics follow in Phase 7 as proof #3.

### D15. Work lands by pull request into `main`. LOCKED, 2026-10-17 (Evan's call)

`main` started as a one-file README commit, so the first real change could be reviewed as a draft PR.

### D16. Editor updates: prompt only, never forced. LOCKED, 2026-10-17

**Decision.**
- vite-plugin-pwa runs in `prompt` mode.
- The editor checks for a new version when it becomes visible, and every 6 hours while it stays visible.
- "Later" holds the prompt for 24 hours.
- "Reload" works even on the first launch after an install (`src/pwa/applyUpdate.ts`).

**Why.** These are project-ascent's measured rules (M19, M154, M302). An installed app is resumed rather than navigated, so the browser rarely checks on its own, and a forced reload loses work.

### D17. RNG: sfc32 seeded by splitmix32, with fork-by-label streams; FNV-1a over UTF-8. LOCKED, 2026-10-17 (M1.1)

**Why.**
- sfc32 is chooser-of-the-dead's choice. It is statistically stronger than the mulberry32 copied through the other repos.
- Forking by label keeps a stream independent of how many numbers other systems drew.
- FNV-1a over UTF-8 bytes, rather than UTF-16 code units (landnam), matches the published test vectors, so C++ or C# ports agree.
- `@eb/core`'s `fnv1a32` already follows this.

**As built (M1.1).**
- The algorithm and golden vectors are in [specs/rng.md](specs/rng.md).
- A stream's state is plain data, so it lives in game state and a reload never rerolls.
- Changing a golden vector changes every seeded game, so it needs a new decision.

### D18. One CI workflow verifies and deploys. LOCKED, 2026-10-17

**Decision.** `.github/workflows/ci.yml` verifies every push and PR. On `main` it deploys the same `dist` that passed, then waits until the live `version.json` names the commit.

**Why.** who-am-i- deploys the exact artifact it verified, and dirtbag confirms the live version. The plan's separate Pages workflow would have rebuilt what CI had already checked.

### D19. State fingerprints: RFC 8785 canonical JSON, FNV-1a 64, facets as top-level keys. LOCKED, 2026-10-17 (M1.2)

**Decision.**
- Game state is fingerprinted as FNV-1a 64 of its RFC 8785 canonical JSON ([specs/state-hash.md](specs/state-hash.md)).
- Facets are the state's top-level keys, each with a hash and a size, and an `exclude` list for presentation-only parts.
- Anything a JSON save can't hold throws when hashed, naming the path to it.

**Why.**
- RFC 8785 is a published standard with implementations in many languages, which makes a port's job easier than matching landnam's custom form.
- FNV-1a 64 is standard, has published vectors, and needs only integer math.
- Facets and the size reading come from landnam's `src/run/parity.ts`, where a whole-state hash proved all-or-nothing.
- Throwing rather than encoding NaN or `undefined` means a state that hashes is a state that survives a save.

**Cost.** Floats print in ECMAScript's shortest round-trip form, which a port must reproduce. So keep sim state in integers wherever a port matters.

**Changing a golden** changes every golden built on this format, so it needs a new decision.

### D20. Records: kebab-case ids unique per type, bare or qualified references, strict zod schemas, stable diagnostic codes. LOCKED, 2026-10-17 (M1.3)

**Decision.**
- Record ids and type names are kebab-case and 1 to 64 characters long. An id is unique within its type, and a record's JSON doesn't repeat its own id or type ([specs/records.md](specs/records.md)).
- A field that points at one type holds the bare id (`"drops": "dead-hauler"`). A field that allows several types holds `"type:id"`.
- Record types are TypeScript types in pure code. Their schemas are zod in `@eb/schema`, annotated `z.ZodType<T>`, and the sim never imports zod.
- Every object in a record schema is strict. Defaults, transforms, `any` and `unknown` are refused when a type is defined.
- Diagnostic codes are never renumbered or reused.

**Why.**
- Kebab-case ids are safe file names on every OS and in URLs, and they read cleanly in hand-written JSON and in text forms such as `inventory.count(medkit)`.
- Bare ids keep the common case short. The qualified form is needed only where a field allows several types.
- Mirroring pure types as `z.ZodType<T>` comes from chooser-of-the-dead: drift between the two is a type error. Strict objects, JSON Schema export and coded diagnostics come from who-am-i-.
- A strict object turns a misspelled field into an error instead of dropping it silently.
- The editor, CLI output and people's notes refer to the codes, so the codes behave like save keys.

**Cost.**
- Renaming an id means rewriting every reference to it. The editor's rename (M2) can do that from `usedBy`.
- Adding a field to content needs a schema change first. That is the point, but it is friction.
- The schema walker reads zod 4.6.7's internals (`_zod.def`). zod stays pinned, and an upgrade must pass the walker's tests and the planted bugs again.

### D21. Content packs: canonical JSON with an FNV-1a 64 content hash, the only thing the runtime reads. LOCKED, 2026-10-17 (M1.4)

**Decision** ([specs/project-format.md](specs/project-format.md#content-packs-format-1)).
- The compiler turns a project into a pack: `{ format: 1, project, records, hash }`, written as RFC 8785 canonical JSON.
- The hash is `stateHash` of everything else in the pack. The runtime checks it with `readPack` before the sim reads a record.
- Packs have their own format number, separate from the project format.

**Why.**
- The Phase 2 gate needs the editor and the CLI to agree on a project by hash. Canonical JSON and FNV-1a 64 already give the same result in every engine (D19), and the Python oracle checks the golden.
- The hash ignores formatting, key order and file order, so reformatting a project or moving it between OPFS, a folder and a zip doesn't change it.
- Checking the hash at load turns a hand-edited or truncated pack into one clear error at startup, instead of a missing record mid-game.

**Cost.**
- FNV-1a is a fingerprint, not a signature: it catches accidents, not tampering.
- Hashing a pack at load costs one canonical serialisation of its content, which is not yet measured for a large pack.

**Changing the golden** (`489cedf323bd33d9` for the v1 fixture) changes every pack built so far, so it needs a new decision.

### D22. The sim kernel: modules with slices, refusals as beats, per-module streams, a mode stack. LOCKED, 2026-10-17 (M1.5)

**Decision** ([specs/sim.md](specs/sim.md)).
- **Reduce.** `reduce(state, action, sim)` returns `{ state, beats, accepted }`. A refused action returns the same state with one `rejected` beat, and keeps none of its changes or draws.
- **Modules.** A game is a list of modules. Each owns one slice of state and registers actions, facts, effects and modes. A module changes only its own slice, and crosses to others through their facts and effects.
- **Copying.** A slice is copied on its first write in an action. New state is checked as JSON and frozen, and unchanged slices are shared.
- **RNG streams** are named `module/name`, start as `Rng.create(seed).fork(label)`, and are saved in `kernel.streams`.
- **Modes.** A stack that is never empty. Each mode lists the action patterns it allows.
- **Beats** are data without prose, and are not saved.

**Why.**
- **Explicit refusals.** chooser-of-the-dead's explicit `rejected` event held up. landnam's "same state means refused" rule miscounted 1,973 accepted actions.
- **All-or-nothing actions.** A refused or failed action can't half-apply, because it only ever changed copies.
- **Streams owned by the kernel.** A stream made inside a verb forks the replay (landnam's `swing.ts`). Naming streams per module means one module's extra draw never moves another's outcomes.
- **Mode checks inside `reduce`,** where bots and replays can't skip them: landnam's bot made 18,733 moves the UI would have refused.
- **Copy-on-write per slice.** It keeps the per-action copy small. landnam's whole-state copy grew from 0.045 ms to 2.2 ms when terrain lived in state.
- **No prose in beats.** Words belong to the stage and its translations.

**Cost.**
- **Handler code** must call `write()` before changing a slice, and `return ctx.refuse(…)` for TypeScript to narrow after a refusal.
- **Speed.** An action costs a copy plus a check-and-freeze of every slice it writes: about 20 µs per action on salvage run (Readings). A game that writes big slices every tick will feel it.
- **Indirection.** Crossing modules only through facts and effects adds a step for code that just wants another module's number.

### D23. Conditions: one JSON tree with a text form, three-valued evaluation, enforced fact domains, a sound lint, and rolls that preview their own table. LOCKED, 2026-10-17 (M1.6)

**Decision** ([specs/conditions.md](specs/conditions.md)).
- **One tree.** A condition is `all`, `any`, `not` or a fact test. Values are text, booleans, or numbers without exponents. The text form prints one way and reads back as the same tree.
- **Three-valued evaluation** (Kleene). A fact with no value, or with a value of another type, is unknown, and a gate opens only on true. Menus (`game.check`) and the sim (`ctx.check`) share one evaluation.
- **Facts declare domains**, and the kernel throws when a fact answers outside its domain.
- **The lint** reports conditions in content that are never true (W102), never false (W103), or undecided after sampling (W104). It reasons over the facts' domains, leaves unknown values out, tries everything up to 100,000 combinations, and past that takes 20,000 samples from a fixed seed.
- **Conditions in records** are reported with `checkCondition`'s codes (E011 to E014), not zod's.
- **Rolls.** Whole-percent outcomes add up to 100 and are picked in the order written. Each roll is exactly one draw from the stream `logic/roll` and adds a `logic/rolled` beat. The preview reads the same table as the roll.

**Why.**
- **Unknown is not false.** Under two-valued logic, `not` of a fact with no value is true, so a missing fact could open a gate. who-am-i-'s condition engine is three-valued for this reason.
- **A text form that round-trips** lets the editor show conditions as text and save trees without reshaping them. who-am-i- parsed text but never printed it.
- **Enforced domains.** The lint is only as good as the domains it trusts. Checking every read means every bot run tests them.
- **Unknowns left out of the lint.** Kleene's operators are monotone, so this loses nothing for "never true". It is also what makes "never false" possible, since any condition over a fact can be unknown.
- **One draw per roll,** so changing a roll's outcomes never shifts the rolls after it.
- **One table for the roll and its preview,** because odds on screen must be the odds rolled. Space-Wrecked's preview drifted from its outcomes when caps applied.

**Cost.**
- **Strictness.**
  - Numbers with exponents can't be written in a condition.
  - Module ids that register facts must start with a letter.
  - A fact answering outside its domain throws in a shipped game too.
- **Lint speed.** A condition at the cap costs 20 to 30 ms (Readings); most cost far less.
- **What the lint can't see.** It treats facts as independent, so conditions that are impossible only because facts depend on each other go unreported.
- **An empty slice.** The logic module's `{}` slice shows up in every state and hash.

### D24. Time: one tick count read through the game's own calendar, absolute timers that fire as attempts, and wall-clock time passed in with a carry and a cap. LOCKED, 2026-10-17 (M1.7)

**Decision** ([specs/time.md](specs/time.md)).
- **One count.** Time is a whole number of ticks since the game started. The game's calendar reads it: ticks per day, parts of the day, weekdays, months or a year length, seasons, and a start. There is no `Date`, no time zones and no leap years.
- **Time moves only by action:** a game action's `wait`, `time/advance`, or `time/elapse` with wall-clock milliseconds.
- **Timers** hold absolute due ticks. They fire by due tick, then in the order they were scheduled, with the clock at their due tick. Each fires as one attempt: a consequence that refuses is undone and reported, and time still passes.
- **`ctx.attempt`** undoes refused work by running the action again with that attempt skipped.
- **Wall-clock time** comes in whole milliseconds. A negative delta is refused, a delta over the cap is cut to the cap, and the part of a tick left over carries to the next elapse.

**Why.**
- **Replays and saves.** Time arriving as actions keeps them exact; the stage owns the clock, as architecture.md already said.
- **Absolute due ticks** need no work per tick, and save as they are.
- **Attempts.** Without them, one refusing consequence would refuse every action that moves time, for good. Undoing in place would leave handlers holding copies the undo replaced. Running the action again costs time, but can't leave stale state behind.
- **The carry.** Rounding each elapse to whole ticks would drift.
- **The cap.** Time that passed while the game was closed has to be bounded.

**Cost.**
- **Re-running.** Each refused attempt runs the action again. 64 refusals in 8 hours of hourly timers cost about 100 ms (Readings).
- **No months or years as durations,** since they differ in length.
- **A firing cap.** More than 10,000 firings in one advance throws.
- **One more slice,** the time module's, in every state and hash.

### D25. Saves: a checksummed snapshot plus log, migrated per module without content, replayed strictly only on the same build; slots that back up, quarantine and report every failure. LOCKED, 2026-10-17 (M1.8)

**Decision** ([specs/saves.md](specs/saves.md)).
- **The file.** A save is JSON: the snapshot, the actions since it, the hash of the state they reach, the stage's info (game, edition, build, `savedAt`, a summary), and an FNV-1a 64 checksum of the rest. `SAVE_VERSION` (1) covers the file and the kernel's state.
- **Versions.** Each module versions its slice in `kernel.versions` and migrates it one version at a time. A migration sees only its slice, never content, tuning or the clock.
- **Loading.**
  - A missing module starts from its init, a slice no module owns is kept, and a slice from a newer game is refused as `newer`.
  - The log replays strictly only on the same build with nothing migrated. Otherwise refused actions are skipped and the difference is reported.
- **Slots** (`@eb/platform`).
  - Keys are `eb/<game>/<edition>/…`, with a summary and a backup per slot.
  - A save that won't load, that a write would replace while in doubt (damaged, newer, written by another tab), or that an update changed is copied to quarantine first.
  - Loading falls back to the backup, except from a `newer` save.
  - Writes report failure in their result and to `onFailure`; nothing is thrown.
- **Stores.** IndexedDB, then localStorage, then memory, chosen by `openStore`. Persistence is asked for on the first save.
- **Logs** compact after a write that saved 200 actions.
- **Codes** are `EB1.<game>.<payload>.<check>`: deflated canonical JSON in base64url, with an FNV-1a 32 check and a 4 MiB cap on unpacking.

**Why.**
- **Lost saves.** Six of the surveyed games could replace a save they failed to read. Two migrated old saves differently after each update, because their migrations read live content.
- **Strict replay only on the same build.** There a mismatch means damage or a non-deterministic game. After an update it means a fixed bug, and refusing the save would punish the player for it.
- **IndexedDB first.** A shared github.io origin lets any game's `localStorage.clear()` wipe the others.
- **Compaction.** Bounded logs keep saves from growing for good, as afterglass's and spliceworld's did.

**Cost.**
- **Replay on load.** About 31 µs a logged action on salvage run, so about 2 ms per save today (Readings).
- **Storage.** A backup doubles each slot, and quarantine is never pruned (saves.md, open question 4).
- **History.** A compacted log loses the actions before the compaction, so a bug report holds at most the actions since then.
- **Conflicts** between tabs are caught by checksum, not by a lock, so two tabs writing at the same moment can still race.

### D26. The headless runner: actions list their options, bots see only what a player sees, sweeps report 95% intervals, and golden files keep a hash per seed and per slice. LOCKED, 2026-10-17 (M1.9)

**Decision** ([specs/runner.md](specs/runner.md)).
- **Options.** An action may list the payloads a player could send now. `game.options` gives every concrete action the current mode allows. What is offered must be accepted, and a refused offer is a bug that the runner counts and `eb sim` fails on.
- **Policies.** A bot gets the options, the screen, facts, conditions and previews, and never the state. It draws from `Rng.create(seed).fork('bot')`. There are three policies: random, weighted by type, and rules as data.
- **Runs** end when nothing is offered, when the policy stops, or at a turn cap. A capped run is its own kind of end, never a loss.
- **Sweeps** read metrics from facts, typed by their domains.
  - Shares get Wilson's 95% interval, and means Student's t, from a table to 30 degrees of freedom and the Cornish–Fisher expansion past it.
  - Quantiles are by nearest rank.
  - Distinct endings are counted by every slice but the kernel.
- **Golden files** keep each seed's state hash and a hash per top-level key, plus the content hash, policy and cap. `eb sim --golden` plays the file's own settings, and only `--update` writes a file.

**Why.**
- **Legal moves only.** A bot that makes moves the interface refuses measures a game no one plays, as landnam's 18,733 refused moves showed.
- **No hidden state.** A bot that sees hidden state or spends the game's dice measures a player who can't exist, as sandbagged's and ludus's did.
- **Intervals, not points.** Every surveyed game with sweeps read noise as signal at least once. Point estimates invite it, and intervals don't.
- **Per-slice goldens.** A hash per slice says where a run moved, so a failing golden starts a search instead of ending in "something changed".

**Cost.**
- **Option lists.** Every action with a payload needs an `options` function, and it must agree with `run`. The runner checks that only on the states its bots reach.
- **Speed.** A sweep turn costs about 31 µs against about 25 µs for `reduce` alone, for listing options and counting beats (Readings).
- **Golden files** churn on purpose: any change that moves a run means an update and a review of the diff.
- **No lookahead.** A policy can't reduce, so a bot can't plan by trying moves. A planning bot would need a lookahead that doesn't reveal outcomes, which isn't built.

### D27. Spikes are separate apps deployed beside the editor, outside its bundle and its offline cache. LOCKED, 2026-10-17 (M1.10)

**Decision.**
- A spike lives in `apps/spike-<name>` with its own Vite config. It builds into `apps/editor/dist/spikes/<name>/` after the editor has built, so Pages deploys it with the editor at `/spikes/<name>/`.
- The editor's service worker lists `/spikes/` in its navigation denylist, and an e2e test proves that an installed editor leaves the spike's page alone.
- Nothing in `packages/` imports a spike. A spike is deleted once the phase it informs has its own version of the thing measured.

**Why.**
- **The editor stays small and offline.** The precache is listed when the editor builds, before the spike's files exist. three.js and Rapier (1.9 MB gzipped) never enter the editor's download or its cache: the precache measured 16 entries and 72.10 KiB with and without the spike.
- **One deploy.** The spike's URL is live wherever the editor is, so a phone check needs no second site.
- **The worker would otherwise swallow it.** A navigation fallback answers any URL in its scope with the app shell. Without the denylist entry, the e2e test sees the editor where the spike should be.

**Cost.**
- **Builds and CI take longer.** `pnpm build` builds two apps, and CI draws the spike in software for its e2e tests, about a minute more.
- **The pages are public.** They are deployed for anyone who finds the URL. They are labelled as throwaway, collect nothing and make no network calls of their own.
- **No offline.** No cache holds a spike, so its page needs the network. That suits a measuring page; the editor and exported games still work offline.

### D28. The editor lives at engine.rcjlabs.com. LOCKED, 2026-10-17 (Evan's call, M2.1)

**Decision.**
- The editor is served at the root of `engine.rcjlabs.com`, a GitHub Pages custom domain on this repo, like `ascent.`, `spacewrecked.` and `dirtbag.rcjlabs.com`. Its base path is `/`.
- The move happens before M2.1 stores any project, so nothing is stranded.

**Why.**
- **Its own origin.** Browser storage, quota and permissions belong to an origin. On `rcjlabs.github.io` the editor would share them with every Pages project that has no custom domain, and any of those pages could read its projects.
- **A TWA can follow.** `assetlinks.json` must sit at the origin root, which a github.io project path can't serve.
- **The address outlives the host.** Projects stay put if hosting ever moves off Pages, as long as the domain does.

**Cost.**
- **One-time setup:** a DNS CNAME record (`engine` to `rcjlabs.github.io`) and the custom domain in the repo's Pages settings.
- **A short outage at the switch:** the site is broken between setting the domain and the deploy of the `/` base path.
- **An installed copy at the old address** keeps serving its cached version, because its service worker can't update through the redirect. Reinstall from the new address.

### D29. Editor layout: dockview on desktop only, a saved layout that follows the default until changed, the phone's inspector in a sheet, and one command palette. LOCKED, 2026-10-17 (M2.2)

**Decision.**
- **Desktop (1,024 px and up) docks its panels with dockview 8.5.1**, the framework-free package. `dockview-core` is pinned to the same release by an override. It loads when the desktop layout first renders, and if it can't load, the fixed desktop zones stand in.
- **The layout is saved per browser** in `localStorage` under `eb-editor:dock-layout`, as `{format: 1, layout}`, 300 ms after a change.
  - Nothing is saved until the first change, and Reset forgets the saved layout, so an untouched dock follows the editor's default.
  - A layout that can't be given back whole is passed over for the default, never repaired.
- **On a phone, the inspector is a sheet** between the panel and the tab bar, not a tab. Shut, it is a 44 px handle; open, it takes 60% of the zone.
- **One command palette** on every layout: a native modal `<dialog>` with the WAI-ARIA combobox pattern, opened by a 44 px top-bar button or Ctrl/⌘+K.
- **The deploy check loads the live page's files**, not only `version.json` (`tools/site-check`).

The spec is [specs/editor-layout.md](specs/editor-layout.md).

**Why.**
- **dockview has no dependencies** and brings its own keyboard and ARIA support: labelled regions, tablists and live announcements. With label-only tabs and plain panel bodies, axe finds nothing on the dock at any impact.
- **Desktop only, loaded late.** A phone never runs the dock's 80.6 kB of gzipped JS and 10.9 kB of CSS, which is more than the rest of the editor (53.5 kB).
- **Following the default** lets a better default reach everyone who never moved a panel. Saving the first layout would freeze it.
- **A sheet keeps the thing being inspected in view.** A tab would replace it.
- **A palette** reaches every command from the keyboard and from a thumb. Later milestones add commands to it instead of adding buttons.
- **The deploy check** catches what `version.json` can't: a page whose scripts don't load, such as a build for the wrong base path (D28).

**Cost.**
- **Size.** Every install caches the dock, phones included (about 92 kB gzipped), because a tablet can turn into a desktop while offline. The precache grew from 195.5 KiB to 668.1 KiB, raw.
- **A dependency** at the centre of the editor's desktop. The override keeps its upgrades deliberate.
- **Two kinds of tab.** dockview's tabs show a panel on Enter, while the zones' tabs show it as the arrow keys reach it.
- **A red `main` until the domain is set.** While Pages serves the site under `rcjlabs.github.io/Engine-Builder/`, the `/` build's scripts don't load there, and the deploy check fails. That is the live site's real state.

### D30. Editing safety: a command log of file changes, saves through a journal, and one editing tab per project held by a Web Lock. LOCKED, 2026-10-17 (M2.3)

**Decision.**
- **Edits are steps of file changes**, each file's bytes before and after, kept in a command log.
  - Undo puts the befores back, redo the afters.
  - Steps in one field within 500 ms join. The newest 100 are kept, in the editing tab's memory.
- **An edited JSON file keeps its own layout**: byte order mark, line ends, indentation, last newline.
- **Autosave.** It saves 1 s after the last edit, at once when the page hides, when the project closes, and before handing over. While an edit is unsaved, or not yet even made, the update toast waits and leaving asks.
- **Stored projects save through a journal** in the OPFS worker. A journal left by a crash is finished when the project opens; a torn one is dropped.
- **Opened folders** save through writable streams, once a tap on Allow changes has let the editor change them.
- **One editing tab per project**, holding a Web Lock.
  - Other tabs open the project read only and follow its saves.
  - Edit here asks the editing tab to save and hand over. Take over takes the lock from a tab that hasn't answered in 5 s.
  - Deleting a project needs its lock.
- **The deploy check needs HTTPS.**
- **The first edits are the project's name and version.** M2.4's forms make steps the same way.

The spec is [specs/editor-editing.md](specs/editor-editing.md). It also answers [editor-storage.md](specs/editor-storage.md#open-questions)'s question 1: a journal.

**Why.**
- **File changes as steps.** Every edit to come (forms, tables, renames) is a change to files, so the log never needs to know what a field is. Before and after bytes make undo exact: the git round trip shows no diff after an edit and its undo.
- **A journal**, for three reasons:
  - It makes a save of many files all or nothing.
  - It doesn't lean on `move()`, which isn't atomic in Firefox.
  - It needs only the sync access handles M2.1 already writes with in every engine.
- **Web Locks.**
  - The browser lets go of them when a tab closes, crashes or is discarded, so a crash never leaves a project locked.
  - `BroadcastChannel` lets the tabs hand over politely, and stealing covers a tab frozen in the background.
  - D25 expected this: "a Web Lock around the write", planned for the editor.
- **HTTPS.** The first run of M2.2's check passed against `http://engine.rcjlabs.com/`, where browsers withhold the service worker and OPFS.

**Cost.**
- **Every save writes twice**, the journal and then the files: 14–20 ms for `project.json`.
- **The history is lost** on a reload, a hand-over or a crash.
- **Take over drops the other tab's unsaved edits**, and that tab's save already in flight can still land.
- **A save of several files into an opened folder isn't all or nothing.**
- **An edited file's numbers and key order** come out as `JSON.stringify` writes them.

### D31. Record types can be data: a project's `types/` folder. Condition fields take the text form or the tree. LOCKED, 2026-10-17 (Evan's calls, M2.4)

**Decision.**
- **Types as data, from M2.4.**
  - A project keeps its own record types in `types/`, one JSON file per type listing its fields.
  - The compiler builds each into the same strict zod schema a code type has, so a project made only of data needs no `--types` module.
  - M2.4's forms draw from these types. M2.6 adds the screens that design them. Phase 3's kits will draw with the same forms.
- **Conditions in record files may be text or a tree.**
  - A condition field takes either `"hold.count(medkit) >= 2"` or the JSON tree.
  - The compiler turns text into the tree when it builds the pack, so the runtime still sees only trees.
  - The editor keeps whichever form a field already holds, and writes text for a new one.

Evan chose both on 2026-10-17, from these options:
- record types: types as data from M2.4, a starter kit built into the editor, or M2.6 before M2.4;
- conditions: text or tree, or trees only.

The specs are [specs/type-files.md](specs/type-files.md) and [specs/editor-forms.md](specs/editor-forms.md). Conditions.md's open question 1 is settled.

**Why.**
- **Types as data.**
  - The editor needs types to draw forms. Until now, types existed only as TypeScript modules that the CLI loads.
  - A starter kit would guess at Phase 3's kit design. It would also make projects depend on types bundled into the editor.
  - Putting M2.6 first would leave its type designer, itself a form, as a plain JSON editor until M2.4.
- **Text in files.** Hand-written content is far shorter as text, whether you write it or an agent does. Packs still hold trees, so evaluation and saves don't change.

**Cost.**
- **M2.4 grows** by the type file format and its compiler. The format is a contract from now on, like the project format.
- **The text grammar becomes part of the project format.** It can never change in a way that reads old text differently. Its print-then-parse round trip is already property-tested (M1.6).
- **A text condition reads its arguments through the game's facts**: `hold.count(medkit)` names the fact's one argument without writing its name. A kit that renames that argument changes what the text means.

### D32. Records tables: a Records panel over an index of every record kept up to date by file, filters as rows, bulk edits as one step, and records named by their type's `nameField`. LOCKED, 2026-10-17 (M2.5)

**Decision.**
- **A Records panel** shows one type's records as a table. It leads the desktop dock's centre group and the tablet's main zone, and sits after Project on a phone. On a phone the table scrolls sideways inside its own region, with its select and record columns pinned.
- **An index of every record** backs it: each record's value, problems and references, and what refers to each, from the compiler's own `validateRecords`.
  - It loads with the first project opened, outside the editor's start.
  - It is kept up to date by file. An edit checks again the records it changed, plus those that refer to a record created or deleted. A change to the types or assets checks every record.
  - A tab's announcement of a save names the files written, so read-only tabs re-read only those.
- **Sort, search and filters.** Every column sorts, with `aria-sort` on the sorted header only. Search matches every word, ignoring case and accents. Filters are rows of a column, a test and a value, with the tests following the field's kind.
- **Bulk edits** set or clear one field on the records selected, with the form's own control, as one step. Duplicate copies one record's file under a new name. Delete takes several as one step and warns when other records refer to them.
- **"Used by"** in the inspector lists what refers to the record, and ref fields open what they name.
- **A type may name the field that holds its records' names**: `nameField`, a text field. Tables, pickers and "used by" show names beside ids, and New and Duplicate fill the name from what was typed.
- **Not in M2.5:** renaming a record and what refers to it. It waits for the record rewriting that M2.6's type and field renames need.

The spec is [specs/editor-tables.md](specs/editor-tables.md). Type-files.md's open question 1 and editor-forms.md's open question 2 are settled.

**Why.**
- **A panel of its own.** A table needs width, and the World panel's zone has it until Phase 4. The architecture already named a Records panel.
- **An index, not a compile per change.**
  - Checking all 2,008 records of the bench project takes 45–123 ms in Node, and reading 1,001 files from OPFS took 524 ms in Chromium (Readings). That is too slow for every keystroke on a phone.
  - A record's problems depend only on its own value, on which records exist, and on the types and assets. So rechecking what changed, plus the users of records created or deleted, gives the same answer as rechecking everything. A property test holds the index to that after any run of edits, and to the compiler.
- **Filters as rows.** A row of controls says what it can test. A filter syntax ("might:>70") is shorter, but has to be learned and is slow to type on a phone.
- **Bulk edits through the form's controls.** Each kind already has a control that checks what is typed, so bulk edits need no second set of editors.
- **`nameField`.** Ids are made from names at creation, but names change and ids can't yet. A named field is explicit and optional; guessing from a field called "name" would be magic. Contentful's `displayField` and Airtable's primary field do the same job.

**Cost.**
- **The default desktop and tablet layouts change.** An untouched dock now opens on Records in the middle. Saved layouts get the new panel in their active group.
- **The editor holds every record in memory**, with its problems. That is fine at thousands of records. A phone may want the checks in a worker; the open question is in the spec.
- **`nameField` is part of the type file format.** An engine from before M2.5 reports E015 for a type file that uses it.

### D33. Renames carry the records: a field, choice, type or record renamed rewrites every record and reference to match, as one step undo takes back. Record renames join M2.6. LOCKED, 2026-10-17 (Evan's calls, M2.6)

**Decision.**
- **Renames rewrite the records** (Evan's call).
  - A field renamed is renamed in every record, nested groups included, and the name field follows it.
  - A type renamed moves its file and its records' folder, every `to` that names it follows, and every qualified ref `"old:id"` becomes `"new:id"`.
  - A choice renamed changes the records that hold it, map keys included.
  - Each is one step: undo takes back the type file and every record together.
- **Renaming a record joins M2.6** (Evan's call). Its file moves and every ref to it follows: bare ids, `type:id` and map keys.
- **The designer adds, from the same rewriting:**
  - a field removed takes its values out of the records;
  - a required field added, or one some records leave out, is filled in on them with a value chosen;
  - a ref changed between one type and several qualifies or unqualifies its records' ids, so they keep naming the same records.
- **Nothing is lost quietly.** A rename onto a name some records hold already is refused, and so is deleting a type that other types refer to.
- **Not rewritten:** conditions, whose words the editor can't tell apart from ids until it knows the game's facts (Phase 3). A record's rename lists the conditions that mention its id. A change of kind converts nothing: the designer says how many records don't fit.
- **The designer lives in the inspector**, the sheet on a phone, beside the record form.

Evan chose on 2026-10-17, from these options:
- renames: rewrite the records, or leave them and offer to remove what no longer fits (the M2.4 behaviour);
- renaming a record with its references: in M2.6, or later.

The spec is [specs/editor-types.md](specs/editor-types.md). Type-files.md's open questions 3 and 4, editor-tables.md's question 1 and editor-forms.md's question 3 are settled.

**Why.**
- **Rewriting.** A rename that leaves the data behind loses it: every record would hold a key the type no longer lists. Contentful's field-id change keeps the content it holds. Airtable warns before a change that may clear values, and its undo takes the change back. The editor already holds the records and an undo that takes back many files as one step (D30, D32).
- **Record renames now.** A record's id is its file name, and refs hold ids. The rewriting a type rename needs is the same, so the two cost little more than one.

**Cost.**
- **A rename touches every file that holds the name.** In an opened folder those are written one by one, so a crash mid-save can leave some renamed and some not (D30's cost). Stored projects save through the journal, all or nothing.
- **Big steps.** A type of 1,000 records renamed is 2,000 file changes in one step of the command log: its bytes before and after stay in memory until the step leaves the history.
- **Conditions can be left naming an old id** until the editor knows the game's facts. The rename lists them; it doesn't fix them.

### D34. Assets carry their provenance in `assets/assets.json`; a fixed list of licences passes, OFL for fonts included; an asset with none is an error; the editor makes stand-ins. LOCKED, 2026-10-18 (Evan's calls, M2.7)

**Decision.**
- **A provenance log, `assets/assets.json`,** with an entry for every file under `assets/`: its licence, where it came from, when, who made it, the tool and prompt for generated art, the hand edits since, and whether it is a stand-in. The architecture named the file at the start.
- **A fixed list of licences passes** (Evan's call):
  - CC0 1.0, CC BY 3.0 and 4.0, MIT, Apache-2.0;
  - public domain, the project's own work, and generated art with its tool and prompt logged;
  - the SIL Open Font License, for fonts (Evan's call), and the notice file it asks to travel with them (`OFL.txt`).

  Anything else is refused until it is added to the list. NonCommercial, NoDerivatives and ShareAlike licences are refused by name. A licence that asks for credit needs its author.
- **An asset with no provenance is an error** (Evan's call): the project doesn't build, so `eb validate` and CI refuse it.
- **Stand-in art** (Evan's call): the editor makes a placeholder image with a name on a colour, logged as a stand-in. A warning lists stand-ins until they are replaced, and replacing one keeps every record that names it.

Evan chose on 2026-10-18, from these options:
- OFL fonts: allow, or refuse as share-alike;
- licences: a fixed list, or refuse only NC, ND and SA;
- an asset with no provenance: an error, or a warning;
- stand-ins: placeholders the editor makes, or nothing until Phase 4.

The spec is [specs/editor-assets.md](specs/editor-assets.md).

**Why.**
- **A fixed list.** A licence the engine doesn't know may limit a game in ways NC, ND and SA don't name, such as personal use only. A known licence can be added when it is needed.
- **OFL.** Its share-alike condition binds the font file alone, not the game that bundles it, and its FAQ names games among the bundling it allows. Nearly every free font, Google Fonts included, is OFL; refusing it would leave few fonts to use.
- **An error.** CLAUDE.md's rule is that assets carry their provenance. The editor's import always writes it, so only files added by hand, by zip or by a tool meet the error, and they are the ones whose licence is unknown.
- **One file.** Licences, credits and checks read one place. A file per asset would double the files, and could be left behind when an asset moves.

**Cost.**
- **Every project with assets needs the log.** The ludus fixture gains one; its content hash is unchanged, since packs hold records only.
- **Generated art passes on its tool's terms.** The log records the tool and prompt; it can't say whether a tool's terms allow a use.
- **The list will need additions** as real assets arrive: each is a change to the engine, not a choice in a project.
- **Big files are capped, for the save journal's sake** (not one of the calls above; a reading). A stored project's save carries its files whole in the journal (D30), about five times their size in memory while it is built, and an import is one save: 25 MB a file and 50 MB an import, not yet tried on a phone (ROADMAP.md, Readings).

### D35. Problems and Console replace the phone's placeholder tabs; `eb schemas` writes into `.vscode/`; CI's checks of exported projects are the gate tests. LOCKED, 2026-10-18 (Evan's calls, M2.8)

**Decision.**
- **The phone's tab bar is Project, Records, Assets, Problems, Console** (Evan's call), opening on Project. World, Logic and Play, still placeholders, come back to it when their phases build them; desktop and tablet keep them. (D37 changed the phone's bar: More ends it, holding Console, World and Play.) The tablet's side zone gains Problems, and its console stays the strip along the bottom. The desktop dock's bottom group holds Console and Problems.
- **The Problems panel lists what `eb validate` would say** of the open project. The compiler's reading of a project's files is one function, `readProjectFiles`, shared by `compileProject` and the editor's catalog, and the record index adds the records' checks. A property test holds the panel's list equal to the compiler's. Each problem opens where it is fixed: a record's form at the field, the type designer, an asset, or the Project or Assets panel.
- **`eb schemas <folder>`** writes each record type's JSON Schema to `.vscode/eb-schemas/<type>.json` and maps `records/<type>/*.json` to them in `.vscode/settings.json` (Evan's call), with the type file format's own for `types/*.json`. The folder is hidden, so the compiler and zips leave it out. Rerun it after changing a type.
- **"The CLI validates exported projects in CI" counts as met** (Evan's call). The gate tests of M2.1, M2.4, M2.6 and M2.7 already export zips from the editor, on phone-sized pages, and read them with the CLI in CI to the hash of the same files made in Node. Nothing more is built for it.

Evan chose on 2026-10-18, from these options:
- the phone: swap the placeholder tabs, a top-bar Problems button over the six tabs, or a seventh tab of about 50 px at 360 px;
- CI: count the gate tests, a CI step running `eb validate` on every zip e2e exports, or a workflow template for game repos (which needs the CLI published, Phase 4);
- the schemas: inside `.vscode/`, or a `schemas/` folder beside `records/`, carried in zips.

The spec is [specs/editor-problems.md](specs/editor-problems.md). Project-format.md's open question 1 is settled.

**Why.**
- **The tabs.** Six tabs fill a 360 px phone, and three of them had nothing in them. A seventh would cut every label short. A top-bar button would put a second way to change panels beside the tab bar.
- **One reading of a project's files.** A panel that agrees with `eb validate` only by having its own copy of the checks drifts the first time a check is added. Sharing the function makes them the same code, and the property test keeps the record index honest too: it found the index skipping records of a type with no type file, which the compiler reports (E002).
- **`.vscode/`.** The schemas are made from the types, so they are a cache, not content: carried in zips they would go stale in someone else's copy. VS Code reads `.vscode/settings.json` without being told.
- **The gate tests.** They already prove what the line asks, on the zips a person would export, in the CI that runs on every push.

**Cost.**
- **World, Logic and Play are out of a phone's reach** until their phases build them. There is nothing in them yet.
- **The catalog now checks project.json and the provenance log as a project opens**, so the Problems tab's count is right from the start: 2.1 kB more at the editor's start (ROADMAP.md, Readings).
- **The schemas check a record's shape only.** References, conditions written as text and asset files need `eb validate` or the editor. VS Code's support for draft 2020-12 is partial by its own docs; the schemas pass through its JSON language service in a test, but not yet through VS Code itself.
- **`.vscode/settings.json` must be plain JSON** for `eb schemas` to change it, since a rewrite would lose comments. With comments, it changes nothing and prints the entries to add by hand.

### D36. Trigger sheets are records of rows; flags are declared records; Logic is the phone's fourth tab; the editor offers the engine's own events and effects. LOCKED, 2026-10-18 (Evan's calls, M3.1)

**Decision.**
- **A sheet is a record** (Evan's call): `records/sheet/<id>.json`, an ordered list of rows. Each row has an `id`, an optional `note`, `when` (an event and, optionally, values its arguments must have), an optional `if` (a condition), `do` (a list of effects) and an optional `once`. Rows run in the order written, sheets in id order. A row fires every time its event happens and its condition holds; a `once` row fires the first time only.
- **Flags are declared** (Evan's call): `records/flag/<id>.json`, on or off, or with `number`, a whole number with a start and bounds. An on/off flag starts off. The effects `set-flag` and `add-to-flag` change them; the facts `flag.on(flag)` and `flag.number(flag)` read them. A misspelled flag is a reference to a record that doesn't exist (E005 in an effect, E013 in a condition). The lint warns of a flag set but never read (W108), read but never set (W109), or never named at all (W110).
- **The phone's tab bar is Project, Records, Assets, Logic, Problems, Console** (Evan's call). Desktop and tablet keep Logic where it was. (D37 changed the phone's bar: More ends it, holding Console, World and Play.)
- **The editor offers the engine's own events and effects** (Evan's call): `flag/changed`, `sheet/fired`, `set-flag`, `add-to-flag` and `roll`, and each kit's as kits land. A row naming a game's own event or effect is kept as written and edited as JSON. Without `--types`, `eb validate` and the editor accept such names as written; with `--types`, an event or effect the game doesn't have is an error.

Evan chose on 2026-10-18, from these options:
- sheets: a record per sheet, a record per row, or a `logic/` folder of their own;
- flags: declared records, flags by name with nothing declared (as rule-or-drool has them), or no flags until the kits;
- the phone: a sixth tab, Logic in place of Console, or no Logic tab, with sheets opened from the Records panel;
- the catalogue: the engine's own for now, or an `eb catalog --game` command writing a game's events, facts and effects into the project.

The spec is [specs/triggers.md](specs/triggers.md).

**How it works** (not among the calls above):
- **Events are declared beats.** A module lists the beats content may react to, with typed arguments, and the kernel checks each one raised. Listeners hear an event when the work that raised it finishes: the action, an attempt, or another listener. So a row reacting to a timer runs at the timer's tick, and a row's consequences run before the next row. Chains more than 64 deep throw, as a row raising its own event would.
- **A row's effects run as one attempt,** like a timer's: a row that refuses is undone, with a `sheet/refused` beat, and the player's action stands. A refused `once` row is not used up.
- **Engine types.** `flag` is a type file built into the engine, so its forms and table work as a project's own types do. `sheet` is a zod type, with its own editor. Neither name can be used by a project's `types/` (E017) or a game's code.
- **Effect fields.** `effect()` marks a field that holds an effect, as `condition()` marks a condition. Validation checks it against the effects known: the engine's own without `--types`, or the game's `effects` export with it.

**Why.**
- **A record per sheet.** Sheets get used-by, the Records table, zips and packs as any record does, and one file holds the rows whose order matters. A file per row would put that order in numbers spread across files.
- **Declared flags.** A flag named in content is checked like any reference, so a typo is an error where it is written, not a lint warning found later.
- **Events after the work.** Handing an event over in the middle of an effect would run content while that effect's module is half-way through its change. Waiting for the whole action would run a timer's consequences at the end of a long wait, not when it was due (time.md).

**Cost.**
- **Nothing in a data-only project runs before Play (Phase 4).** Sheets run in tests and `eb sim`, through salvage run.
- **Previews don't follow events.** A preview shows what an effect does, not what rows do in answer to it, so a row that rolls in answer to a choice is not in that choice's preview.
- **A renamed once row fires again** in a save made before the rename, since the save keeps which rows have fired by id.
- **A flag read only by a game's code** warns as set but never read (W108): the lint sees content, not code.

### D37. A phone's tab bar ends in More, which holds Console, World and Play. LOCKED, 2026-10-18 (Evan's calls, between M3.1 and M3.2)

**Decision.**
- **Every panel is in reach on a phone held upright** (Evan's call). D35 had left World and Play off a phone's bar until their phases build them, so a phone could not open them at all, not even from the command palette.
- **The bar is Project, Records, Assets, Logic, Problems, More** (Evan's call). More shows a list of the panels past the bar, Console, World and Play, each a row with what it holds, and a placeholder's row says which phase builds it. A panel opened from the list has a Back to More button above it; the More tab stays the one chosen, and tapping it shows the list again. Panels later phases add join the list.
- **Everything that shows a panel reaches More's too.** The command palette's Show commands cover every panel on a phone, and the error toast's Console button opens the console behind More.
- **The fix shipped in its own PR** (Evan's call), merged once CI was green, before M3.2.

Evan chose on 2026-10-18, from these options:
- the bar: a More tab in place of Console; More keeping Console as a seventh tab; eight tabs; or one bar of eight that scrolls sideways;
- shipping: its own PR merged on green, its own PR waiting for Evan's merge, or folded into M3.2's PR.

The spec is [specs/editor-layout.md](specs/editor-layout.md).

**Why.**
- **More.** Six tabs fill a 360 px phone with every label whole, as D35 found; seven cut Problems short, and eight are 44 px each, the least a target may be, with Records, Problems and Console cut short. A bar that scrolls hides tabs past its edge, which is how World and Play went unnoticed.
- **Console behind More.** It is read least of the six on a phone, and the error toast still opens it in one tap.

**Cost.**
- **Console, World and Play are a tap further away** than a tab, and the row's name is the whole row read aloud ("Console What the editor did…"), since a name of the label alone would hide visible words from speech input (WCAG 2.5.3).
- **World and Play are still placeholders.** On a phone they now show what is coming and when, as they do on desktop and tablet.

### D38. A project's game is its scripts/game.ts; completion comes from the engine's API list; a project from elsewhere asks once before its scripts run; scripts are re-checked as you type, and Run plays them. LOCKED, 2026-10-18 (Evan's calls, M3.2)

**Decision.**
- **`scripts/game.ts` is the game** (Evan's call). It exports what `eb sim --game` reads: modules, the start mode, bots and metrics, importing the project's other scripts. With it, `eb validate`, `eb build` and `eb sim` need no `--types` or `--game`, content is checked against the game's own facts, events and effects, and the editor's pickers offer them. Scripts are `scripts/<id>.ts`, TypeScript that imports `"eb"` and each other; the purity rules the sim keeps read them as `tools/lint-boundaries` reads the engine (now from `packages/purity`, shared). A pack carries the scripts game.ts reaches, as format 2; a pack without scripts stays format 1, its hash unchanged.
- **Completion from a list of the engine's API** (Evan's call): what `"eb"` gives, a handler's `ctx`, an rng stream, defineModule's parts, and the project's own names in strings, each with its signature and a line on what it is for. Type errors come from `eb validate`'s parse and VS Code, not as you type.
- **A project you didn't make asks once before its scripts run** (Evan's call). One imported from a zip or opened from a folder shows its scripts and their problems, and runs none until you say you trust it, as VS Code does; a project made here runs its scripts at once. The answer is kept per project. Since the purity rules are a check, not a wall, the worker that runs scripts also takes the network and storage off its global first: best effort, not a sandbox.
- **Re-check and Run** (Evan's call). As you type, the scripts compile in a worker and the project is checked again against the game; a Run button plays 20 seeds with a bot in a worker and shows `eb sim`'s report, word for word.

Evan chose on 2026-10-18, from these options:
- completion: the engine's API list (about 20 to 30 kB), TypeScript's language service in a worker (1.64 MB gzipped, 9.1 MB raw, slow to start on a phone; TypeScript 7 has no browser API yet), or highlighting only;
- trust: ask once per project, run every script (as the architecture said, with a sandbox only for Phase 9's mods), or a sandbox now (a separate origin with no storage, and M3.2 growing by the messaging);
- the game: scripts/game.ts, or every script's modules joining the game in file-name order with the start mode in project.json;
- hot reload: re-check and Run, or re-check only, with playing waiting for Play-in-Editor (Phase 4).

The specs are [specs/scripts.md](specs/scripts.md) and [specs/editor-scripts.md](specs/editor-scripts.md).

**Why.**
- **game.ts.** One file says what the game is, as `--game` already did, so the CLI, the editor and a game's CI read the same thing, and content can be checked against what the game declares rather than taken as written (D36). File-name order would make renaming a script reorder the game.
- **The list.** TypeScript's service would cost a phone 1.64 MB and seconds to start for every install, most of whose users write content, not code. The API is small and the engine's own, so a list covers what a script calls; tests hold it to `"eb"`, `ctx` and the module's parts.
- **Asking.** A script runs with the editor's origin, so it could read every project in the browser. A project made here holds only its author's code; one from a zip may hold anyone's.
- **Run.** A broken game shows in the editor, in the same words `eb sim` prints, without the CLI.

**Cost.**
- **No type errors as you type.** A wrong argument shows when the game loads or plays, or in VS Code.
- **A tap before an imported project's game runs**, and until then its content is checked as if it had no game.
- **The install grows:** CodeMirror and the script worker, 263.5 kB gzipped (871.6 kB raw), precached so the editor works offline from the first visit, whether or not scripts are ever opened (ROADMAP.md's Readings).
- **Trust is not a sandbox.** A trusted script that sets out to escape the worker may; mods will need a separate origin.

### D39. A session takes as many milestones as it has time for, one at a time, and merges each on green. LOCKED, 2026-10-18 (Evan's calls)

**Decision.**
- **No limit of one milestone a session** (Evan's call, 2026-10-18: "we'll do as many as we can per session"). CLAUDE.md's rule is gone.
- **Still one at a time, in ROADMAP order.** A milestone is done, its gates passing and its marker, Readings and decisions updated, before the next one starts, as CLAUDE.md's other session rules already say.
- **Merge on green and go on** (Evan's call). When a milestone's PR is green, Claude merges it with a merge commit, confirms the deploy, and starts the next milestone. Product calls still go to Evan, each with a recommendation, and a session stops at a milestone whose gate needs his phone.

Evan chose on 2026-10-18 between merging on green and going on, and waiting for his word on each PR.

**Why.** The gates, not the session, say when a milestone is done. The rule had also stopped a session with time left after a milestone merged, and waiting for a word on each green PR would stop the next one the same way.

**Cost.**
- **More lands between Evan's looks**, and on the live editor before he has seen it. Each milestone's product calls still wait on him, so a session can queue questions while it builds what doesn't depend on them.
- **A long session's context is summarized** along the way, and a summary can drop detail. What carries a milestone is in the repo (ROADMAP's marker, its specs and decisions), not in the session's memory.

### D40. The roadmap ends with art tools and a new small game made only in the editor, by following a tutorial. LOCKED, 2026-10-18 (Evan's calls)

**Decision.**
- **A demo of the editor: a new small game made only in it** (Evan's call). An original short game, designed around a tutorial, is built from an empty project by following that tutorial: Proof #4, the roadmap's last milestone (Phase 10). Dirtbag and Space-Wrecked stay proven as far as the existing proofs go: Space-Wrecked's acts 1–2 (Proof #1) and its ship builder and boarding fight (Proof #3).
- **What "made here" allows** (Evan's call):
  - art and sound from the editor's own tools, or drawn by code written in its script editor;
  - a few OFL fonts that ship with the engine and count as its own;
  - store builds (the Play package, Steam's) in a GitHub workflow the editor writes (M4.9, M4.10 since D53), since Bubblewrap, the Android SDK and Electron can't run in a browser.
- **The art tools come in one phase, before the demo** (Evan's call): Phase 10's painter, icons and type, figures and portraits, music and mesh kit. The proofs before it may draw their art in code written in the script editor, as Dirtbag and Space-Wrecked draw theirs now.
- **Importing stays.** M2.7's asset import and M5.5's glTF import and CC0 kit are there for games that want outside art; Proof #4 uses none of them.

Evan chose on 2026-10-18, from these options:
- the demo: a Dirtbag slice rebuilt by following a tutorial, with Space-Wrecked's proofs made in the editor too; a new small game with a tutorial; or Space-Wrecked's proofs alone, made in the editor;
- outside assets: editor-made plus bundled fonts; strictly nothing, fonts included; or editor-made plus a CC0 starter kit that ships with the engine;
- the art tools: with the phase that first needs each (a painter, icons and a figure rig in Phase 4, a mesh kit in Phase 5), or in one phase before the demo.

**Why.**
- **The gap is drawing, not importing.** Dirtbag and Space-Wrecked already ship with no outside art or sound, but their art is code: 10.4k lines of Canvas2D painters in Dirtbag, 6.6k lines in Space-Wrecked for 3D, portraits and icons. Dirtbag synthesizes its 50 sounds and its music in six moods. Their only outside assets are Dirtbag's three OFL fonts; Space-Wrecked uses the system's. So making such a game without writing code needs tools that draw. The roadmap had none: no painter, rig, music or mesh tool, and M5.5 planned 3D from glTF files and a CC0 kit.
- **A tutorial** turns "very easy instructions" into something to follow and check, rather than a hope.

**Cost.**
- **Proofs #1 to #3 come before the tools.** Their art is drawn in code, as the games do now, so they prove the engine, not yet the route to art without code.
- **The roadmap grows by a phase** of six milestones.
- **Store builds keep one outside step:** GitHub Actions runs Bubblewrap, the Android SDK and Electron, with the signing keys in its secrets.

### D41. Kits are listed in project.json; Kits I is two milestones, economy then stats; actors hold stats and worn gear, a party bag holds items and money; a pool keeps the damage taken. LOCKED, 2026-10-18 (Evan's calls, M3.3)

**Decision.**
- **A project lists its kits in project.json** (Evan's call): `"kits": ["inventory", "economy"]`, switched on and off in the Project panel. A listed kit's record types are the engine's own for that project, its facts, events and effects are known to the checks and the pickers, and its module joins the game after the engine's own, as they do, unless the game places it. A project that leaves a kit off keeps any type of the kit's names as its own.
- **Kits I is two milestones** (Evan's call): M3.3 the economy (items and the bag, loot tables, resources, shops), then M3.4 the stats (actors, stats, pools, statuses, equipment). The later Phase 3 milestones move down one.
- **Actors hold stats and worn gear; one party bag holds items and money** (Evan's call), as Space-Wrecked's hold and crew, Ludus's gear room and gladiators, and Dirtbag's van and climber have it. Bags for other actors and containers come with Phase 6's NPCs, by a migration of the inventory kit's slice.
- **A pool keeps the damage taken** when its maximum moves (Evan's call), as Bethesda's actor values do: max HP up by 2 raises the current HP by 2. For M3.4; untested for feel.
- **A project can add fields to a kit's types** (Evan's call). `types/item.json` holds the project's own fields, which join after the kit's: the type designer shows the kit's fields locked and edits the project's like any type's. The kit reads only its own fields; conditions, scripts and the stage can read the rest.

Evan chose on 2026-10-18, from these options:
- switching kits on: a list in project.json, imports in scripts/game.ts, or every kit always on;
- scope: two milestones (economy, then stats), one milestone, or one with status durations and stacking moved to M4.5;
- holders: actors and a party bag, a bag for every actor, or one party with no actors;
- a pool whose maximum rises: it keeps the damage taken, keeps its amount, or keeps its share of the maximum;
- kit types: fields a project adds after the kit's, or fixed, with a game's extra data in types of its own that point at them.

The spec is [specs/kits.md](specs/kits.md).

**Why.**
- **project.json.** A project made only of data can use kits, and the editor knows their types before any script is trusted (D38). Every kit always on would make `item`, `actor` and `loot-table` the engine's names in every project, which the format-1 fixture's own types already use, and would change every game's state hash and golden file.
- **Two milestones.** Phase 3's gate needs a shop; each half gets its own fixture, gate and PR.
- **The party bag.** The games the kits come from keep one store of items and money for the party and put gear on people, and an effect then needs no "whose".
- **Fields of a project's own.** Space-Wrecked's parts each carry a maker, a size, a layout of cells and stats (`data/modules.json`); without them, every part would be two records, an item and a part, kept in step by hand.

**Cost.**
- **project.json grows a field** that an editor from before M3.3 rejects, so a project with kits needs today's editor.
- **Bags of their own** for NPCs and containers wait for Phase 6, and will need a migration then.
- **A kit's own fields are fixed** while it is on: a project adds fields, but can't rename, remove or change the kit's.
- **M3.3 grows** by the type designer's locked fields and the compiler's joining of the two field lists.

### D42. Stats and gear are two kits; a modifier adds, then takes a percent; a status lasts days, ticks or until removed; worn gear leaves the bag. LOCKED, 2026-10-18 (Evan's calls, M3.4)

**Decision.**
- **Two kits** (Evan's call): `stats` (actors, stats, statuses), which needs no other kit, and `gear` (slots, and items worn in them), which needs stats and inventory. A sports sim gets ratings without turning on items.
- **A modifier adds, then takes a percent** (Evan's call). A stat's value is (base + the adds) × (100 + the percents) ÷ 100, rounded once to the nearest whole number, halves up, then kept within the stat's bounds. The adds are summed and so are the percents, so their order never changes a value. The parts (the base, each status, each worn item) are what a screen shows, from the same function the sim reads.
- **A status lasts days, ticks or until removed** (Evan's call). Applied again, it takes the longer of the time it has left and its own, and one more stack up to its cap (1 when left out); each stack applies its modifiers once more. A timed status needs the time module, and is a warning in a game without one.
- **Worn gear leaves the bag** (Evan's call). Equipping moves one item from the party's bag to the actor's slot, and the slot's old item back into the bag; unequipping puts it back, and is refused when the bag can't hold it. A worn item can't be sold.

Evan chose on 2026-10-18, from these options:
- modifiers: add then percent; flat points only; add, then multiply by each percent in turn;
- durations: days, ticks or until removed; those and a number of actions; until removed only;
- worn gear: off the bag and onto the actor; in the bag, marked worn; only ever on actors;
- kits: stats and gear apart; one stats kit that needs inventory.

Also settled, as the session's calls: every stat can take damage, its current amount being its value less the damage taken (Bethesda's actor values have it), so a pool is any stat a game hurts and heals; and a stat's base is a number, with no stat worked out from another (a script's fact does that).

The spec is [specs/stats.md](specs/stats.md), and the survey behind it [research/stats.md](research/stats.md).

**Why.**
- **Add then percent** covers both families in Evan's games: flat points (Space-Wrecked's traits, Landnam's injuries, Sandbagged's gear) and percentages (Ludus's gear, 2060td's ranks). Summed percents, rounded once, are exact and order-free, as the economy's quote is.
- **The longer time and a stack to a cap** is the rule the repos use most: Wasteland Protocol's `Math.max` of the old and new, Spliceworld's venom to 5 stacks.
- **The bag.** One store of items for the party (D41) means a worn item is somewhere else, and selling what an actor wears would surprise a player.
- **Two kits.** A game of ratings and meters (a football manager, Rule or Drool) needs no items.

**Cost.**
- **Two more boxes** in the Project panel's Kits.
- **No compounding:** two +10% make +20%, not +21%. A game that compounds writes it in a script.
- **Turns aren't a duration.** A fight that counts turns removes its statuses with rows or scripts until Phase 6's combat.
- **No derived stats** (Landnam's health of 8 plus 2 a point of might): a game that needs one writes a fact in a script.
- **The stats module is built knowing whether gear is on,** since a module can't ask whether another's fact exists.

### D43. Kits II is two milestones, factions and time, then the roster; a faction's standing is a whole number in bands of its own; a band sets a shop's prices, and a faction may drift; a time kit keeps the calendar and says as each day starts. LOCKED, 2026-10-18 (Evan's calls, M3.5)

**Decision.**
- **Two milestones** (Evan's call): M3.5 factions and the time kit, then M3.6 the roster (recruits made in play, ranks, bonds). Choice events, dialogue and missions move down one, to M3.7, M3.8 and M3.9.
- **Standing** (Evan's call): a whole number for each faction, within its own min and max, from its own start, in bands it lists lowest first by where each begins (Space-Wrecked's −10 to 10 in five, Landnam's −100 to 100). A gain with one faction and a loss with another are two effects; nothing spreads to allies or rivals by itself.
- **What standing does by itself** (Evan's call):
  - with the economy kit on, a shop may name a faction, and the faction's band sets a share of what the shop charges (Space-Wrecked's 150, 125, 100, 90 and 75 percent), through the same quote. What the shop pays stays as it was, and never more than it charges;
  - a faction may drift one point every few days toward a resting value (Landnam, Ludus, 2060td), counted in the time module's days.
- **The time kit** (Evan's call): `time` in project.json's kits, with the calendar in project.json, edited in the Project panel. The time module says as each day, week, month, season and year starts, with events heard at that tick, so a sheet's rows on them are a day's pass in row order, and a dated event is a row with a condition on the date.

Evan chose on 2026-10-18, from these options:
- scope: two milestones (factions and time, then the roster), one, or three;
- standing: each faction's own range and bands; one set of bands for every faction; or bands per faction plus allies and rivals that a change spreads to;
- what standing does: prices and drift; prices only; or nothing by itself;
- time: a kit with the calendar as data and events as each day starts; the same plus a record type for dated events; or no kit, the time module only in scripts.

Also settled, as the session's calls:
- the start-of events are the time module's own, so a game.ts's time module raises them too. At a tick, the boundaries come before the timers due there, the largest first (year, season, month, week, day);
- the kits' own upkeep at a day's start (statuses ending, drift) comes after the rows on `time/day-started`, since listeners hear in module order and the engine's sheets come first;
- the stats kit's timed statuses end as the day that ends them starts, not only once the action that passed the time is done. Before, a status that ran out during a wait still stacked with the same status applied after the wait in that action;
- a calendar given while the time kit is off is a warning, W116, not an error: nothing reads it. With the kit on, a game.ts naming a module `time` of its own is E031, as for any kit;
- real time (`time/elapse`) for a project made of data waits for Phase 4's stage;
- project.json's calendar is checked apart from the rest of the file: a shape it lacks is E038 at the field, so a calendar half filled in, as the Project panel's form leaves it between boxes, never stops the project being read or turns its kits off. Its `ticksPerDay` is 1 when left out, as a calendar left out is;
- the calendar's form takes out a list left empty, and the calendar once nothing is left in it, since the engine reads an empty list of weekdays or months as a calendar that doesn't hold together;
- `schedule`, whose timer holds a list of effects, is added in the editor as Other, as JSON, until the sheet editor's own list can hold them ([editor-kits.md](specs/editor-kits.md#open-questions), question 4).

The specs are [specs/factions.md](specs/factions.md) and [specs/time.md](specs/time.md#the-time-kit), and the survey behind them [research/kits-ii.md](research/kits-ii.md).

**Why.**
- **Two milestones.** Phase 3's gate needs a shop and factions, not a roster. Recruits made in play are actors that content doesn't list, which the stats kit reads only from records, so they need a design of their own.
- **Bands of its own.** The games' ranges and bands differ (−3 to 3, −10 to 10, −100 to 100, 0 to 100); every one moves standing from content, often in opposed pairs, and none spreads a change by itself.
- **Prices and drift.** Band prices are what Space-Wrecked's stations and Landnam's trade do. Drift is Landnam's, Ludus's, 2060td's and rule-or-drool's; written as rows, it would take one row a faction.
- **Events as each day starts.** Landnam's `passDay` and Ludus's week's end run fixed steps in a fixed order, which a sheet's rows are. Ludus's festivals and Dirtbag's holidays and bills are a table of dates, which conditions on the date are.

**Cost.**
- **Drift is in whole points:** Landnam's 0.12 a day becomes a point every 8 days.
- **No relations:** a game where standing with one faction moves its allies writes the second effect each time.
- **Every game with a time module raises the new events,** so its beats change. The events alone change no state, so salvage run's and the hangar's golden runs hold. The arena's were taken again, since its statuses now end as the day starts.
- **The roster waits a milestone,** and recruits with it.

---

### D44. The roster kit: recruits rolled from templates and worked out from the seed; bonds a number per pair in bands; ranks a ladder on a stat; members who leave kept as gone. LOCKED, 2026-10-19 (Evan's calls, M3.6)

**Decision.**
- **Recruits** (Evan's call): a recruit template names a written actor to copy and rolls the rest: a name from its lists, stats within ranges, traits by chance, and a fee. A hall offers a few recruits a round, worked out from the game's seed, the hall, its round and the slot, so it offers the same people every visit and only those hired are saved (Space-Wrecked). A row can make a recruit straight from a template, for people who just arrive (Landnam, Afterglass).
- **Bonds** (Evan's call): a whole number for each pair of actors, within the roster's range, in bands it names (Wasteland's 4, 10 and 18 fights, Ludus's strength), changed by effects that rows apply. Nothing grows by itself, as with factions.
- **Ranks** (Evan's call): a ladder on a stat, such as fights or xp: each rank begins at a value, and a member at a rank has its status (Space-Wrecked's 3 and 8 fights, 2060td's 40, 110 and 220). Conditions read the rank by name.
- **Leaving** (Evan's call): a member who leaves (dead, dismissed, sold) leaves the roster but stays in the save with the reason, so bonds and annals can still name them (Ludus's fallen, Landnam, Afterglass). Ids are never reused.

Evan chose on 2026-10-19, from these options:
- recruits: rolled from templates and worked out from the seed; a market rolled once and saved (Ludus); or written members only;
- bonds: a number per pair in bands; the same, growing with days together without a row; or no bonds yet;
- ranks: a ladder on a stat with a status a rank; levels with points to spend (Wasteland's perks); or no ranks yet;
- leaving: kept as gone with the reason; or removed outright with everything naming them.

Also settled, as the session's calls:
- traits and wounds are the stats kit's statuses: a trait has no end, a wound lasts days. Every game surveyed fits one or the other;
- **a member made in play is a record like any other.** The kernel's content, as every module reads it, holds the records a module makes from its slice beside the records content lists. So every kit reads, checks and names a recruit as it does a written actor, and events and facts that name an actor take a recruit's id;
- a recruit's id is its template's and a number, `deckhand-4`, from one counter the game never winds back. A written actor named that way is refused (E035), so the two can't meet;
- one roster a game, its settings a roster record: its cap (a number, or a number flag that rows raise), who starts on it, the rank ladder, and the range and bands of bonds;
- a hall works like a shop: opening it shows its offers in a mode, where hiring is an action. A fee is paid as pay-cost pays, so with no economy kit nothing can charge one;
- found while building it: the stage needs a recruit's name outside an action ("Ketil Ash joined"), so `game.content(state, sim)` gives the content every module reads; and a module's `start`, run once after every init, gives those who start on the roster their ranks' statuses, which init can't, since it applies no effects;
- also found: `constructor` is a valid record id, and a plain object answers it with Object.prototype's. The roster reads its slice's maps by own keys only (`own.ts`); the kits before it don't yet (ROADMAP's ideas);
- a hall offers at most 20 a round, since every offer is worked out again whenever the hall's options are read; a leave's why is any text; a condition naming an actor's bond with itself is E040, as a change-bond naming one is E035.

The spec is [specs/roster.md](specs/roster.md), and the survey behind it [research/kits-ii.md](research/kits-ii.md#rosters).

**Why.**
- **Templates worked out from the seed.** Space-Wrecked's stations do this, and saves hold only who was hired. A market saved whole (Ludus) is a hall whose offers a row refreshes, so it costs nothing extra.
- **A number per pair, in bands.** Ludus, Wasteland and Landnam's grudges all keep one number per pair and act on thresholds, which bands are; the factions kit has the same shape.
- **A ladder on a stat.** Space-Wrecked, 2060td and Landnam all count something (fights, xp) and act at thresholds. Levels with points to spend need a screen to spend them on, which is Phase 4's.
- **Kept as gone.** Every game but Space-Wrecked keeps its dead, and Ludus's kin, Landnam's grudges and Afterglass's shades name them after.
- **Made records in the kernel.** A recruit read some other way would need every kit that reads actors (stats, gear, and later missions) to learn a second place to look, and every event that names an actor to stop checking that the actor exists.

**Cost.**
- **Rows can't yet name the member an event is about:** a row on `roster/joined` can't give that member a status. The kit's own work (traits at hire, a rank's status) and a game's scripts can. Aliases come with missions (M3.9).
- **A recruit's rolled stats and traits are kept, not worked out again,** so a content change to a template's ranges reaches only recruits made after it. What the recruit copies from its actor (its slots, the statuses it starts with) is read from content each time.
- **The kernel's content is no longer only the pack:** a made record isn't checked by `eb validate`, only by the template it was rolled from.

### D45. Choice events: a choice the party can't pay for is locked with what it needs; odds hidden unless an event shows them; consequences count days, choices or a number flag; decks draw by weight and rules. LOCKED, 2026-10-19 (Evan's calls, M3.7)

**Decision.**
- **A choice that costs more than the party has** (Evan's call) is shown locked, with what it needs: "Needs 30 scrap, and you have 12" (Space-Wrecked, Afterglass, Wasteland). A choice can also be locked by a condition it needs, shown in words, or hidden by one.
- **Odds** (Evan's call) are hidden by default: before choosing, the player sees a choice's label, its cost and what locks it. An event can show its odds, and then each choice shows its outcomes, their chances and what they do (Space-Wrecked's "70%: +10 credits"). Either way the outcome is rolled on choosing, on a saved stream, so a reload can't roll again.
- **A consequence that lands later** (Evan's call) counts days, choices made, or a number flag's rise, so a game counts what it moves on by: Dirtbag's days, Rule-or-Drool's cards, Wasteland's nodes kept in a flag. It is checked again as it comes due and dropped if it no longer holds.
- **Which event comes up** (Evan's call) is drawn from a deck: events by weight, each with a condition, once or again, with the last few drawn passed over and those never seen likelier (Ludus, Dirtbag, Wasteland, Landnam).

Evan chose on 2026-10-19, from these options:
- a choice the party can't pay for: locked with what it needs; hidden; or offered and refused when chosen;
- odds: always shown exactly; shown in words ("a third of the time"); hidden by default, an event able to show them;
- what a consequence counts: days, choices or a number flag; days only; or choices only;
- picking: decks with weights and rules; a game's own code only; or events in order only.

Also settled, as the session's calls:
- **an events kit,** switched on in `project.json` as the others are, with two record types: `event` (its text and choices) and `deck` (which events can come up). With the kit off, both names are free for a project's own types (the salvage-run fixture has its own `event`);
- **a choice's cost is paid as it is chosen,** with the economy kit's pay-cost, and is what locks it. Space-Wrecked wrote each price again into every outcome, which its validator had to keep in step;
- **one effect list a choice is sure of, and outcomes it rolls:** a choice's effects apply first, then one outcome by whole-percent chances that add up to 100, as the `roll` effect's do;
- **an event opened while another is open waits its turn,** in the order opened. A consequence or a chain landing mid-event is never refused or lost;
- **an `effects` kind in type files,** so a field can hold a list of effects. The event's choices and outcomes, the `later` effect and a project's own types use it, and the editor draws its forms as it draws every other kind's. Before it, only the sheet held effects, through an editor of its own;
- a consequence lands in an attempt of its own, as a timer does, so one that refuses is dropped with a beat, while an effect of the player's choice that refuses refuses the choice: the runner then counts an offer refused, which is how `eb sim` finds a choice missing what it needs;
- a deck draws from a stream worked out from the game's seed, the deck and its count of draws, so one deck's draws never shift another's (Afterglass's visitors), and never draws an event that is open or waiting;
- an event with no choice free of conditions and costs is W118, as Space-Wrecked's validator asks, "so the ship is never stuck".

The spec is [specs/events.md](specs/events.md), and the survey behind it [research/choice-events.md](research/choice-events.md).

**Why.**
- **Locked with what it needs.** Three of the games do this, and it teaches the player what to save for. A hidden choice is still there, by a condition, for what the player shouldn't know of yet (Dirtbag's favours).
- **Odds hidden by default.** Most events are written to be read, not worked out; an author who wants the numbers shown (a gamble, a check) turns them on for that event.
- **Days, choices or a number flag.** Wasteland's consequences counted sectors, and "six in seven debts were never collected" as runs ended first; counting what the game moves on by, and a test that none outlives its run, is its fix. One kind would leave out the games that count the others.
- **Decks.** Every game surveyed keeps events from repeating some way: weights, cooldowns, a memory of recent ones, a boost for those unseen. A deck is those rules as data.

**Cost.**
- **Odds can't yet move with stats** (Landnam's checks, Spliceworld's reasons). A chance is a whole percent written in content.
- **A consequence keeps the effects it was booked with,** as a timer does: content changed after booking reaches only those booked after.
- **A cost is resources only.** An item a choice takes is a condition it needs and an effect it applies.

---

### D46. Dialogue: trees now, ink after Missions, compiled into talks; talks edited with forms and a map; a speaker is a record. LOCKED, 2026-10-19 (Evan's calls, M3.8)

**Decision.**
- **Trees first** (Evan's call). M3.8 is dialogue trees: talks as records, with forms, a map of each talk and checks for lines nothing reaches. ink scenes become M3.10, after Missions and still in Phase 3, so Phase 3's gate keeps its ink scene. No milestone is renumbered. (M3.11 since D47 split Missions.)
- **ink is compiled into talks** (Evan's call). When M3.10 comes, a scene's knots, choices, conditions on the game's facts and `# fx:` tags become the same talk records the sim plays, so bots, saves and previews cover ink scenes as they cover trees. ink's variables, functions, `RANDOM` and tunnels are errors, each with its line. chooser-of-the-dead's 61 scenes use only that subset.
- **A talk is edited with forms and a map** (Evan's call). Each line and its options are a form, as an event's choices are. The map shows every line of the talk and where its options lead; tapping a box opens its line's form. It works the same by touch on a phone.
- **A speaker is a record** (Evan's call), of the dialogue kit's type `speaker`: a name and a portrait from Assets. A talk names its speaker, and a line can name another. It works without the stats kit.

Evan chose on 2026-10-19, from these options:
- scope: trees now and ink after Missions; both in M3.8; or trees only, ink leaving Phase 3;
- ink: compiled into talks; inkjs's player ported into a pure package; or played outside the sim, chooser's way, its effects landing when a scene ends;
- editing: forms plus a map; or a graph drawn by dragging boxes and wires, as Twine and articy do, on desktop;
- speakers: a speaker record; the stats kit's actors; or a name typed into each line.

Also settled, as the session's calls:
- **a dialogue kit,** switched on in `project.json`, with two record types, `speaker` and `talk`. With the kit off, both names are free for a project's own types;
- **a talk is one record,** in dirtbag's `TalkDef` shape: starts chosen by condition, and lines, each with a speaker, text, effects and options. One record holds the whole tree, so its map and its checks see all of it;
- **an option is an event's choice** (D45): shown under an If, locked by its Needs or by a Cost the party can't pay, with effects and outcomes, plus the line it leads to and `once`. Outcomes can lead to lines of their own, so a check in talk branches (Landnam's success or failure). The verdict and the view are the events kit's, so locks and odds read the same in both;
- **effects land as they are picked,** as in dirtbag, sandbagged, rule-or-drool and ludus, not at the talk's end as in chooser: a talk saved half way keeps what was said;
- **the open talk and its line are saved,** as Landnam, Space-Wrecked and Wasteland saved their open cards. Dirtbag and Sandbagged lost the open talk on reload, and chooser played its scene again from the start;
- **a talk opened while another is open waits its turn,** as an event does; a mode an option's effects open, such as a shop or an event, comes before the talk goes on;
- **once options** are hidden once said: dirtbag's "said once and for good";
- **checks for content nothing reaches,** the survey's commonest failure: a line no start reaches (W121), a line that can show only locked options (W122) and a talk nothing opens (W123), beside E035 for a talk that doesn't hold together and E042 for a condition naming a line or option a talk doesn't have;
- **lines are plain text** in M3.8. Text filled in from the game's state is an idea, for events too.

The spec is [specs/dialogue.md](specs/dialogue.md), and the survey behind it [research/dialogue.md](research/dialogue.md).

**Why.**
- **Trees first.** The games the demo stands for, Dirtbag and Space-Wrecked, talk in trees and cards. Only chooser wrote ink, and only a subset of it.
- **ink compiled into talks.** One player in the sim, so a scene saves half way, the bots play it headless as Phase 3's gate asks, and what a player sees of a locked option is what the sim decides. inkjs can't run in the sim: it isn't a pure package, and pure packages import only each other. A port would be the largest job in the roadmap, for features chooser never used.
- **Forms and a map.** Every other record is edited with forms, by touch as by mouse. A graph you drag and wire is a desktop tool; a map you tap keeps the phone a first-class editor.
- **A speaker record.** A portrait and a name in one place, renamed once, and talk that needs no stats.

**Cost.**
- **ink's subset only.** Scenes that keep ink variables, call functions or roll ink's `RANDOM` must be rewritten as facts, effects and outcomes.
- **The map is for seeing and getting around.** A line is moved in its list, not by dragging its box.
- **A whole talk is one file,** so two people editing one talk at once merge it by hand, as with any record.

### D47. Quests: stages whose objectives check themselves, failure by condition or deadline, a journal of log lines and live objectives; aliases and timed jobs next. LOCKED, 2026-10-19 (Evan's calls, M3.9)

**Decision.**
- **Quests now, aliases next** (Evan's call). M3.9 is quests: stages, objectives, deadlines, a journal, the quest's map in the editor, checks, and bots that show each quest can finish. A new M3.10 brings aliases (slots filled as a quest starts, for quests that repeat with new targets) and timed jobs sealed at launch, as Spliceworld's operations are. ink scenes move from M3.10 to M3.11, still in Phase 3, so Phase 3's gate keeps every mission family.
- **Objectives check themselves** (Evan's call). An objective is a condition ("has 3 rope") or a count of events ("deliver 3 crates"), checked as the game runs, as Dirtbag's goals are. Once a stage's objectives are done, the quest moves on. A `set-stage` effect also moves it, from a row, a talk or an event.
- **A quest can fail** (Evan's call): when its stage's condition for failing holds, or when a number of days start while the stage is current. The journal says why. A quest still open when the bots' runs end is reported: started too late to finish, or stuck.
- **The journal is a log plus live objectives** (Evan's call). Each stage reached adds its line, the current stage's objectives show with their counts ("2 of 3"), and finished and failed quests stay readable. It is the sim's preview, so the journal says what the sim holds.

Evan chose on 2026-10-19, from these options:
- scope: quests now and aliases with timed jobs next; all of it in M3.9; or aliases after Phase 3;
- advancing: objectives that check themselves, plus set-stage; or only effects setting stages, Bethesda's way;
- failing: by condition or deadline; or never;
- journal: a log plus live objectives; or only what to do next.

Also settled, as the session's calls:
- **a quests kit,** switched on in `project.json`, with one record type, `quest`. With the kit off, the name is free for a project's own type;
- **a quest is one record:** its stages in a list, the first where it starts, so its map and its checks see all of it;
- **an objective is done once,** and stays done while its stage is current: a condition met and then lost doesn't take it back, so the journal never unticks a line;
- **an objective can lead somewhere:** once done, the quest goes to its stage at once. The others must all be done, and then the quest goes to its stage's Then, or is done when there is none. A branch is in the quest, so its map shows it;
- **a stage can fail the quest** as it is reached (Space-Wrecked's "gone cold");
- **checked as each event is heard,** in the order of the quests' ids, as the events kit hears every event; a condition no event follows is read at the next one;
- **a quest starts once:** by `start-quest`, by `set-stage`, with the game, or when its start condition holds. Starting it again does nothing; repeating quests come with aliases (M3.10);
- **deadlines count the days started,** `time/day-started` as the events kit's consequences do, so a quest needs a time module only if a stage has days (W120);
- **what a quest shows is `start-quest`'s preview,** as what a talk shows is `open-talk`'s;
- **the bots' sweep reports each quest's state at its runs' end,** so a quest no run finishes, or one left open, shows in `eb sim` and in the editor's Run.

The spec is [specs/quests.md](specs/quests.md), and the survey behind it [research/missions.md](research/missions.md).

**Why.**
- **Quests now, aliases next.** Aliases need records the game picks at a quest's start (actors made in play, places), with their own checks. Quests are what the demo game and Phase 3's gate need first. Splitting keeps each merge reviewable.
- **Objectives that check themselves.** The commonest quests in the games before (goals, bounties, counters) check themselves. Wiring every move by hand is how Bethesda's quests come to have stages nothing sets, and the checks can't follow a move made from anywhere.
- **Failure and deadlines.** Dirtbag's audit found "No quest has a deadline or a failure state"; Space-Wrecked's cold steps and Landnam's oaths are failure states players understood.
- **The journal.** A log is what a text adventure has instead of a map marker, and counts tell the player how far they are, which Dirtbag's Next pill showed works.

**Cost.**
- **A condition is read only as events are heard.** A fact a module changes without an event is caught at the next event, not at once.
- **An objective met and then lost stays done.** A quest that must hold a condition at its end needs a condition to fail on, or a last stage that reads it.
- **One run per quest.** A quest done or failed stays so until M3.10's repeatable quests.

**Settled while building it** (the session's calls, 2026-10-19):
- **The log keeps each stage once,** in the order last reached, so a quest that loops can't grow its save, and the journal reads as its latest pass.
- **A stage's effects are one attempt,** as a consequence the events kit lands: one that refuses, such as a cost the party can't meet, undoes them with `quests/refused`, and never the action that moved the quest. Playing the yard found it: a stage charging 20 credits refused the choice that reached it, so a party with less couldn't refuse the miner at all.
- **A stage that fails fails on any check.** Its effects' events are heard before reaching it is done, and the yard's day lost to bruises, heard first, read the stage as done.
- **The kit hears its own events,** so a quest can wait on another. A check moves a quest at most as many stages as it has, so no check runs for ever; a quest whose objectives are always met round a loop is checked again as it hears its own moves, until the kernel stops the action 64 events deep. E035 catches the loops that show in a quest's own fields.
- **A count's arguments are text,** the ids an event names. A number is read by a Done when instead.
- **The bots' quest metrics come after a game's own,** each named by its quest's name and id, in `eb sim` and the editor's Run alike.

### D48. Aliases filled by rule, a quest that fails or moves on when one is gone, repeats counted, timed jobs sealed in game time. LOCKED, 2026-10-19 (Evan's calls, M3.10)

**Decision.**
- **Aliases are filled by rule** (Evan's call). A quest's slot holds a named record, or one of the records of its type that match its conditions: the one with the most or least of a fact, or one at random from the quest's own stream. They are filled as the quest starts; when one can't be, the quest doesn't start. The player picking who fills a slot comes later, with odds moved by stats.
- **A slot whose record is gone** (Evan's call), because the record no longer exists or the slot's Keeps while stops holding, fails the quest with the journal saying who is gone, unless the slot names a stage to go to instead.
- **A repeat is a fresh run, its past counted** (Evan's call). A quest that repeats starts again after it ends, by the same ways a quest starts, with its slots filled again. Its entry is replaced; the journal and the facts count the runs done and failed. The save holds one run per quest.
- **Timed jobs run in game time, sealed, and those sent are away** (Evan's call). A job is a stage with a duration in the calendar's units and outcomes with chances, each leading to a stage. Its outcome is rolled as it is reached and kept in the save; the odds shown come from the same table. A record in a slot marked Goes is away until its quest ends, and is never sent on a second. A job is called off by moving the quest off its stage, as content's own choice.

Evan chose on 2026-10-19, from these options:
- filling: by rule only; rule plus the player's pick; or named and random only;
- gone: fail, or go to the slot's stage; refill, else fail; or a fourth end state, gone;
- repeats: a fresh run with past runs counted; each run kept in the journal; or no repeats in M3.10;
- jobs: game time, sealed, those sent away; game time, sealed, with no away; or real hours.

Also settled, as the session's calls:
- **a slot is named `@slot`** wherever a record's id goes in its quest, in conditions and effects, and `{slot}` in a log line, an objective's text or a why is its record's name, read as the journal is. No other record can name a quest's slot (E044);
- **slots fill in the order written,** from every record of the slot's type, those made in play among them, each record in one slot of a quest at most; at random from the kit's own stream, so a fill shifts no other roll;
- **a quest whose slots can't be filled doesn't start:** `start-quest` refuses the action (`unfilled`), so a choice that would start it says why; one that starts with the game or by Starts when waits and is tried again;
- **gone is checked after success** and before Fails when and days: an objective done by the event that took the record wins, and the journal then says who is gone rather than that time ran out;
- **a repeat starts by Starts when only once it has stopped holding,** so a condition that always holds can't restart a quest that is done at once in a loop; a run a week is `time.weekday == mon`;
- **a job's outcome is a timer of the time module's,** named `quests-<quest>`, which moves the quest to the outcome's stage when it fires and is cancelled when the quest leaves the stage, so time passed while a game is closed, and the cap on it, are the time module's alone. A job needs a time module (E045);
- **away lasts the whole quest,** not only its job, so "who is away" has one answer: `quests.away`;
- **the kit's slice is version 2,** with a migration and a save made by version 1 that must still load.

The spec is [specs/quests.md](specs/quests.md#aliases), and the survey behind it [research/aliases.md](research/aliases.md).

**Why.**
- **By rule.** Ludus, Landnam, Dirtbag and Space-Wrecked pick their targets by rule; only Spliceworld lets the player pick, and there the pick matters because each creature's odds differ, which odds moved by stats would bring.
- **Gone.** The games before broke where a target left by a way nobody handled: Ludus's poach pointing at a dead man, Space-Wrecked's loyalty quest that a death would not end. One condition per slot covers every way out, and the journal says it.
- **Repeats counted.** A save that grows with each run is what M3.9's log already refuses.
- **Sealed, in game time.** A reload, or doing things in another order, can't roll a job again. The time module already settles time passed while a game is closed for a game whose clock follows real time. One fact saying who is away keeps Spliceworld's four answers to one.

**Cost.**
- **No player's pick** until odds move by stats.
- **One run kept:** a repeat's past log lines are gone; only the counts remain.
- **Away lasts the whole quest,** not only its job.

**Settled while building it** (the session's calls, 2026-10-19):
- **A Keeps while that can't be answered counts as gone,** as a condition's unknown never counts as true: a slot whose fact has no value has lost its record.
- **A why is written as the quest fails,** its `{slot}`s named as they were then; log lines and objectives' texts are named as the journal is read.
- **`@slot` binds as a map's key too,** since Pay a cost's resources are a map's keys.
- **E045 reads the game's events, as W120 does:** a project whose game isn't known isn't warned, since a game's own time module may be there.
- **W127 sees what the kits make,** not a game's own modules: a slot of a type only a game's module makes is warned of anyway.
- **A record field's picker offers the slots first,** by the scope the checks use, so a slot a field can't name is never offered.

### D49. ink scenes read by our own parser of chooser's subset, as scenes/<id>.ink, their conditions naming facts through EXTERNALs. LOCKED, 2026-10-19 (Evan's calls, M3.11)

**Decision.**
- **Our own parser of the subset** (Evan's call). `@eb/ink`, a small pure package, reads the ink chooser-of-the-dead wrote and compiles it into a talk, in the browser and in `eb` alike, every problem at its line, anything outside the subset refused by name. inkjs is not in the editor or in games.
- **Scenes are `scenes/<id>.ink` files** (Evan's call), each compiled into the talk of that id. The editor edits them as text, with problems at their lines and the talk's map beside; Inky opens them on a PC.
- **Conditions name facts through EXTERNALs** (Evan's call): `EXTERNAL flag_on(flag)` stands for `flag.on`, a fact's name with its dot and hyphens as underscores. A scene stays valid ink; an EXTERNAL naming no fact is an error.
- **chooser's subset** (Evan's call): knots, once-only choices, gathers with labels, one-line and block conditionals, diverts to knots, labels and `END`, and the speaker, fx and needs tags: enough for chooser's scenes. Sticky choices and stitches are not in it.

Evan chose on 2026-10-19, from these options:
- reading: our own parser of the subset; or inkjs's compiler, its JSON translated into talks;
- where: `scenes/<id>.ink` files; or ink text in a talk's field;
- conditions: EXTERNAL per fact, valid ink; or the engine's condition text, which Inky would refuse;
- subset: chooser's; chooser's plus sticky choices and stitches; or smaller, without gathers or labels.

Also settled, as the session's calls:
- **effects are tags,** `# fx: change-standing(faction: hel, by: 3)`, an effect's name and its fields as a condition gives a fact's arguments, so any effect the game has can be written, and is checked by its schema;
- **a choice's cost and needs go inside its brackets,** `# cost: rings 5` and `# needs: <ink condition>`, where ink gives the tag to the choice; chooser's `#needs: rings N` and the `# fx: rings -N` that paid it are one `# cost:`;
- **a line of the talk is one speaker's run of lines,** a new speaker, a gather, a block, a choice, a divert or `# beat` starting the next, so a talk taps on between speakers, as dirtbag's talks do, where chooser showed a passage at once;
- **talks gain lines that pass and branch:** a line may leave out its text, and goes on by `branches`, the first whose If holds, before its Then; ink's blocks compile into them, and forms can write them too;
- **a choice point that shows no choice ends the talk,** as ink's story ends there, which the comparison with inkjs found;
- **a choice is once-only within a play:** an option is `once` only on a line its talk can come back to, so a scene opened again offers its choices again, as chooser played its scenes afresh, and W122 doesn't warn of every ink line with a cost;
- **the talk's checks follow the scene,** each at the scene's line, and gain E035 for lines that pass in a loop, W129 for what the conditions on every way to it rule out (the lint that walks every path) and W130 for a line the talk can never end from;
- **inkjs is a dev dependency only,** for a test that plays every way through each scene by inkjs and by the talk and holds them to the same lines, effects and choices; never in the editor or a game;
- **chooser's scenes stay in chooser:** their text is RCJLabs's, all rights reserved, so the fixture's scenes are written fresh, and the reading over chooser's 61 runs locally, uncommitted.

The spec is [specs/ink.md](specs/ink.md), and the survey behind it [research/ink.md](research/ink.md).

**Why.**
- **Our own parser.** One reading of a scene in the sim and the editor, pure, so it compiles the same in a worker as in `eb`; exact lines for every problem, which a translation from inkjs's JSON would lose; no compiler of inkle's in the editor's download. The risk, that our reading of ink isn't inkle's, is measured: every way through chooser's scenes and the fixture's plays as inkjs plays it.
- **Files.** Long prose belongs in a text file, not a JSON string; Inky and diff read it.
- **EXTERNALs.** Scenes stay ink, so Inky previews them, and the one list of facts a scene reads is at its top.
- **chooser's subset.** It is what the only ink the portfolio has uses, and every part of it has a place in a talk.

**Cost.**
- **Our reading of ink,** held to inkle's by a test rather than shared code: ink outside the subset, or a corner the tests don't play, could read differently.
- **Two facts can't be compared:** one of chooser's 61 scenes needs rewriting.
- **A line at a time:** a passage of several speakers taps on between them.
- **Generated ids move:** a line named by neither a knot nor a label is numbered within its knot, so adding a line before it renames it.

**Settled while building it** (the session's calls, 2026-10-19):
- **An EXTERNAL that names no fact is still declared:** its problem is said once, at its line, not again at each use.
- **A scene with the dialogue kit off is one problem and no record,** so nothing cascades from a talk type that isn't there; **a scene beside a talk record of its id** is E004 at both and isn't checked, in `eb` and the editor alike.
- **The walk keeps each condition once,** so a loop that passes the same branch again settles rather than running to its limit of 20,000 steps.
- **A condition is bracketed only where it joins others,** in a choice's two `{…}` or a line's `{condition: this|that}`s; alone, as a branch's If, it is written bare.
- **The fourth `{condition: this|that}` on a line is reported at its own line,** since a paragraph runs over lines.
- **In the editor, a scene's talk opens the scene,** never a form, from Records, the Problems panel or a map; Records lists it among the talks by its name, but it can't be ticked for a bulk edit, a duplicate or a delete, which are for records written as JSON; the map shows once the scene has no errors.

### D50. Phase 3's gate: an original adventure at an alpine hut, built by one e2e from an empty project, no bigger than the gate's list. LOCKED, 2026-10-19 (Evan's calls, Phase 3's gate)

**Decision.**
- **An original adventure** (Evan's call), **at an alpine hut** (Evan's call): a hut kept for a short season above a valley village. The guides' guild and the village are its factions; the hut's store is its shop. Its quests cover the mission families:
  - guiding a party up is its timed job;
  - loads carried up are its counted objective;
  - a storm is its choice event;
  - stocking the hut is its quest of steps.

  Two talks are made with forms, and one scene is written in ink.
- **One e2e builds it all** (Evan's call), on every push:
  - it starts from an empty project and works through the editor's panels and forms;
  - its game's script is typed in the script editor, and its scene in the scene editor;
  - it is exported, checked clean by `eb validate`, and played by its bot, every quest done in some run.
- **The gate's list and no more** (Evan's call): what the gate names, with enough for a bot to finish every quest, about 20 to 30 records.

Evan chose on 2026-10-19, from these options:
- the adventure:
  - a Dirtbag slice;
  - Space-Wrecked's first act;
  - an original adventure;
- the setting, once original was chosen:
  - a river trading post;
  - an alpine hut;
  - a lighthouse coast;
- the proof:
  - one e2e that builds it all;
  - built once and kept as a fixture;
  - built in parts by several specs;
- the size:
  - the gate's list;
  - a short playable act.

**Why.**
- **Original.** It shows the editor making a game that didn't exist first, as Proof #4 will, while Space-Wrecked keeps Proof #1.
- **One e2e.** Every push shows again that the whole game can be made in the editor, not that it once was.
- **Small.** It holds the gate's proof without making every CI run much longer.

**Cost.**
- **CI grows** by the time the e2e takes to build the game, a few minutes.
- **The e2e breaks as the editor's forms change,** and has to change with them. That is the price of the proof.
- **The adventure's text is written fresh,** and is the session's to write. Its tone is yours to correct.

### D51. A game's screens are data, rendered by Preact with signals; the runtime UI is two milestones, proved by the hut played through its screens. LOCKED, 2026-10-19 (Evan's calls, M4.1)

**Decision.**
- **Preact with signals renders a game's screens** (Evan's call), as it does the editor, so D4 holds for games too.
- **Screens are data** (Evan's call): widget trees in `ui/<screen>.json`.
  - They are checked as records are, and their bindings name the game's facts.
  - Their actions run effects or open screens.
  - M4.4's UI designer will edit them (M4.5 since D53).
  - Anything the data can't say waits for an escape hatch of its own, later.
- **Two milestones** (Evan's call):
  - M4.1 is screens: widgets, layout with safe areas and breakpoints, themes with an AA check, bindings, actions and the screen stack;
  - M4.2 is input and feedback: spatial focus for keyboard and gamepad, gestures, toasts, a log, and screen-reader announcements.

  Phase 4's later milestones move up one number.
- **M4.1's gate is the hut played through its screens** (Evan's call). The hut gets screens written as data:
  - a HUD with the day, the coins and the standings;
  - the hut's actions;
  - the store, the talks, the storm and the journal.

  It plays to its end in the editor's Play panel and in an exported page, by touch at 360 and 390 px and in landscape, with every theme AA-checked.

Also settled, as the session's calls ([specs/screens.md](specs/screens.md)):
- **a button takes only an action the game offers,** or opens or closes a screen: a screen never runs an effect, so what the player can do is still the sim's to say;
- **a game plays in the script worker,** where `lockDown` has run, and the page gets each step's view as JSON: the facts and conditions its screens name, the actions on offer, and the kits' views of the open talk, event, shop and journal;
- **the game's modes drive the stack:** each mode's screen is the first that names it, a mode no screen names gets a plain fallback (W133), and screens a button opens sit on top until a step changes the modes;
- **the exported page is the player at `/play/`,** opening the game file the Project panel exports, a pack of format 4 that carries the screens and the theme; a page that is a single file comes with M4.9's export (M4.10 since D53);
- **screens are written as JSON in the editor** until M4.4's designer (M4.5 since D53), opened from the Play panel with their problems at their lines.

As built (M4.1):
- **the Play panel's game runs in a copy of the script worker of its own,** so the compiler and kits ship once, and a check that runs too long in the script worker never ends a game in play;
- **the player page is a page of the editor's own build** (`play/index.html`), so the editor's service worker holds it and a game opened once plays offline; its worker takes the host's ways out away before a game's scripts run, as the script worker does;
- **a screen's problems are given at their lines** in its file, by `eb validate` as in the editor, from their JSON paths;
- **a list's entries come from the kits' own previews and facts,** and the `bag` is the inventory kit's, not the economy kit's, as first written; a fact or condition the game can't read shows as no value rather than stopping the game.

Evan chose on 2026-10-19, from these options:
- the framework: Preact with signals; or plain DOM, as Space-Wrecked;
- screens: data, as JSON widget trees; code, as Preact components in the project's scripts; or data with script widgets;
- the split: two milestones; or one, as written;
- the gate: the hut played through its screens; or a small fixture made for the UI.

The survey behind it is [research/runtime-ui.md](research/runtime-ui.md).

**Why.**
- **Preact.** It is small, and the editor already uses it. Chooser, the most complete of the existing UIs, is built on it.
- **Data.** Screens that are data can be checked, edited by a designer, and shared as templates. A screen written as code would be rewritten by every game.
- **Two milestones.** Each one gets its own PR and gate, as the kits' did.
- **The hut.** It shows a real game played through its screens, and its quests and talks already exist to drive them.

**Cost.**
- **Anything a widget tree can't say waits** for an escape hatch.
- **Exported games carry Preact,** about 5 kB.

### D52. A game words its beats in `ui/feedback.json`; the log is a widget kept for the play; Back and tab swipes are the gestures; the hut played by keys, pad and touch proves it. LOCKED, 2026-10-19 (Evan's calls, M4.2)

**Decision.**
- **Feedback is data** (Evan's call). `ui/feedback.json` lists lines, each naming an event the game declares, an optional match on its arguments, words whose holes are those arguments (`{.item}`, a record's id shown as its name), and whether it toasts, logs or both. Each beat is said by the first line that matches it. Without the file nothing is said; the editor's New feedback starts one with the kits' common events worded.
- **The log is a widget** (Evan's call), `log`, placed on any screen, showing the last lines said. The page keeps them for the play; they are not saved.
- **The gestures are Back and tab swipes** (Evan's call). Escape, a pad's B, a swipe right on a screen a button opened, and the player page's own browser back (Android's back gesture) close that screen; a swipe left or right on tabs changes tab. Each has a button or a key.
- **The gate is the hut played by keys, by pad and by touch** (Evan's call), with a feedback file of its own: to its end by keyboard alone and by gamepad alone, and by touch with its gestures at 360 and 390 px and in landscape; every line checked as the live region holds it; axe and the 44 px checks on each screen. All automated.

Also settled, as the session's calls ([specs/input.md](specs/input.md)):
- **focus moves by Chooser's spatial rule** (a 45° cone, ahead plus twice across), within the top screen, never wrapping; each screen remembers its last control and gets it back when it returns to the top;
- **the gamepad is read each frame while one is connected**, in the standard mapping: the d-pad and left stick move, A presses, B is Back, LB and RB change tab;
- **the worker words the beats**, so the page still never reads the sim's state, and one polite live region speaks each step's lines once; toasts are hidden from screen readers and the log doesn't announce, so nothing is heard twice;
- **toasts come one at a time**, timed by their length as Dirtbag's are, and taps go through them;
- **pack format 5** adds the feedback; a pack without it keeps its format;
- **W134** warns of a screen only a button opens that has no close button, since on touch a swipe would be the only way back.

Evan chose on 2026-10-19, from these options:
- words: `ui/feedback.json`; the engine's own words for every kit event, overridable; or each event's label with its arguments;
- the log: a widget kept for the play; saved with the game; or a drawer the engine draws on every game;
- gestures: Back and tab swipes; Back only; or those and a long press for an entry's details;
- the gate: the hut by keys, pad and touch, all automated; or that and a TalkBack run on his phone.

**Why.**
- **Feedback as data.** The engine picks no tone for a game, the lines are checked against the events they name, and a game's words stay in one file a translation can replace.
- **A widget for the log.** The author decides where it sits and how much it shows; saving it waits for M4.3's slots, where the page's own state belongs.
- **Back and tab swipes.** Back matters most on Android, where a TWA would otherwise leave the game; the tab swipe is the one other gesture the stock widgets invite. The recognizer is the one M4.5's map (M4.6 since D53) will need for drag and pinch.
- **An automated gate.** It plays the whole hut each way on every CI run, and the session can go on to M4.3.

**Cost.**
- **No words by default:** a game says nothing until its feedback file says it.
- **No real screen reader** is run: the checks read what the live region holds, not what TalkBack or VoiceOver speak. A run by hand stays on the phone checks.

### D53. M4.3 is the play shell, engine-drawn in the game's theme; the slot in play saves every step; Daily is opt-in by the local date; stock screens are M4.4. LOCKED, 2026-10-20 (Evan's calls, M4.3)

**Decision.**
- **M4.3 is split** (Evan's call). M4.3 is the play shell: a title with slots (Continue, New, Daily), save and load (a file or a code out and in, delete, slots that can't be read kept and shown), pause, settings, a crash screen and an update prompt, on the player page and in the editor's Play panel. M4.4 is the stock screens: HUD, inventory, journal, dialogue, shop, codex, credits and ending as templates New screen offers. The map goes with the world map, now M4.6. Phase 4's later milestones move up one number again.
- **The shell is engine-drawn in the game's theme** (Evan's call). The engine draws the shell's screens with the game's theme tokens. A small `ui/shell.json` gives them their words, the number of slots and whether Daily is on. The crash screen is plain DOM, drawn without Preact, so it still shows when the game's screens are what broke (Dirtbag's rule).
- **The slot in play saves after every step** (Evan's call), so a reload can't roll a step again (Chooser's rule). Continue resumes the numbered slot played last (Afterglass's and 2060td's rule). Three slots unless `shell.json` asks for one to five.
- **Daily is opt-in, by the device's local date** (Evan's call). A game turns it on in `shell.json`. Its seed is `daily:<n>`, `n` counted in days from a fixed date by the local calendar (Chooser's rule); the page reads the clock and the sim never does. A Daily has a slot of its own, apart from the numbered ones, and saves each step as they do.
- **The gate is automated:** the hut, with a `shell.json` of its own, started in a slot, reloaded and continued to the same state, exported as a code and imported in a fresh browser, a crash showing its raw save, on desktop and on phones at 360 and 390 px and in landscape.

Evan chose on 2026-10-20, from these options:
- scope: split with the play shell first; one milestone for all of it; or the stock screens first;
- the shell: engine-drawn in the game's theme; JSON screens with slots and settings as new sources; or the title as JSON and the rest drawn;
- saving: every step with three slots and Continue as the slot played last; on pause and quit only; or one slot;
- Daily: opt-in by the local date; opt-in by UTC; or later.

**Why.**
- **The shell first.** The player page keeps nothing yet: a reload loses the game. Every stock screen after it plays inside a shell that saves.
- **Engine-drawn.** Saves, files and errors are where a broken screen costs a player their game; the engine keeps them working whatever a game's own screens do. The theme still makes them the game's.
- **Every step.** Nothing to lose to a closed tab, and no reroll by reload. The writes are small: the save holds its snapshot and at most 200 actions.
- **Local date.** A Daily that turns over at the player's midnight, as a newspaper's does.

**Cost.**
- **Authors can't restyle the shell's layout,** only its theme and words. A game that needs its own title screen waits for the escape hatch D51 left for later.
- **A write each step** is a cost on slow storage; it is measured, not assumed.
- **Players east and west of each other** play the same Daily hours apart.

### D54. Stock screens are templates New screen writes from the project; the codex lists records shown once known; credits are packed from the provenance log; a button can take the player back to the shell; the hut played on stock screens alone proves it. LOCKED, 2026-10-20 (Evan's calls, M4.4)

**Decision.**
- **A stock screen is a template.** New screen offers each one and writes it into `ui/` as JSON the author owns and restyles, filled from the project as it is: its kits, resources, actors, factions and the game's modes, every number a binding to a live fact. Nothing is drawn by the engine that the JSON doesn't say.
- **The codex lists records, each shown once known** (Evan's call). A list's new source, `records`, gives every record of a type. An entry's facts can name it as `@entry`, as a quest's name its slots `@slot` (M3.10). `known`, a condition on `@entry`, holds back what isn't yet found: such an entry is drawn by the list's `unknown` widget, with nothing of its record shown (Sandbagged's rule), or not at all without one.
- **Credits are packed live from the provenance log** (Evan's call). The compiler packs each asset's author, licence and source into the game file, as pack format 7. A `credits` list shows them, so an asset added later is credited without the screen being touched. A pack whose project has no assets, or no screens to show them, keeps its format.
- **A button can take the player back to the shell** (Evan's call): `{"shell": "title"}` and `{"shell": "new"}`. The ending template places them. Where no shell plays the game, they are disabled.
- **The gate is the hut on stock screens** (Evan's call). In the editor e2e, the hut's own screens are set aside and every stock screen is made by New screen. With a CC-BY asset imported, the hut is played to its end through them alone at `/play/`, its codex and credits checked, on desktop and on phones at 360 and 390 px and in landscape.
- **Two more templates than the list named,** which follow from the gate and the kits rather than being asked: Event, for the events kit's `choosing`, since the hut has a storm; and Hall, for the roster kit's `hiring`. With them, every kit's mode has a stock screen, so a game made of kits never falls back to the plain list.

Evan chose on 2026-10-20, from these options:
- the codex: records shown once known; records all shown always; or lore pages as a new record type;
- credits: packed live from the log; or written once into the screen when it is made;
- the way out: a button for the shell; the shell's bar once nothing is offered; or both;
- the gate: the hut on stock screens; each template on a fresh project; or both.

**Why.**
- **Templates, not engine-drawn.** Architecture's line since Phase 0: stock screens ship as templates you restyle. A template is a screen like any other, so what the checks, the renderer and M4.5's designer know already covers it.
- **Known.** A codex that shows everything at once is a spoiler list. A condition the author writes says what "found" means in their game, from the facts it already has.
- **Packed.** A CC-BY credit written once goes stale when an asset changes, and a missing credit breaks the licence. The log is already the record of where each asset came from.
- **A button.** The author decides where the way out sits, as with every other button. The shell's pause still quits for a game whose ending has none.
- **The hut.** Playing a whole game through the templates proves they are enough to ship one, not just that each compiles.

**Cost.**
- **What's known can be forgotten.** Only facts the kits keep can say it. A carried item is known only while it is carried, as no fact remembers an item once had; an `ever` fact would need the bag to keep it, a save change.
- **Pack format 7** for any project with assets and screens: an older player page refuses such a file, as it did formats 5 and 6.
- **A screen's list is keyed by more than its source:** two codex lists of one type with different `known` are two lists in the view.

### D55. The UI designer edits a screen as an outline, a form and a device frame; the frame draws the Play panel's moment, with samples where it has none; screens and the theme are designed, with their JSON kept; the hut and its journal rebuilt in it prove it. LOCKED, 2026-10-20 (Evan's calls, M4.5)

**Decision.**
- **An outline, a form and a frame** (Evan's call). A screen opens in the inspector as three parts:
  - the outline, the screen's widgets as a tree;
  - the frame, the screen drawn as a device shows it;
  - the form, for the widget selected.

  A tap on a widget in the frame or a row of the outline selects it. The outline adds, duplicates and deletes. It moves a widget by dragging its handle, or by Up, Down, In and Out, which a keyboard and a single tap reach. Nothing is dragged on the frame itself.
- **The frame draws the Play panel's moment, with samples where it has none** (Evan's call).
  - Facts read the game as the Play panel last left it in this session, or as it starts when nothing has been played.
  - A list whose source doesn't apply then, such as a shop that isn't open, gets three sample entries named for their fields. A talk's or a shop's own text that the moment lacks gets the same treatment.
  - Without a game to read (scripts not yet run, or errors outside `ui/`), everything is a sample, and the frame says why.
- **Screens and the theme are designed, their JSON kept** (Evan's call).
  - A screen and the theme each have a Design tab and a JSON tab, over the same file with the same undo. The JSON tab is how in when the file is one the designer can't read.
  - The theme is designed as colour pickers, each text pair's contrast shown as it is picked, against 4.5:1.
  - `shell.json` and `feedback.json` stay JSON: they are words, not layout.
- **The gate is the hut and its journal, rebuilt** (Evan's call). An e2e makes `ui/hut.json` and `ui/journal.json` from blank screens in the designer alone, typing no JSON. They need:
  - for the hut: its grid's columns at landscape, tablet and desktop, a button's arguments, a shows-when, the progress bar and the log;
  - for the journal: its tabs, and lists with their items.

  Each file must come out as the fixture's JSON, and the hut must play on them. Every device frame draws them with nothing past its edges. On phones at 360 and 390 px, the same edits are made by touch in the inspector sheet.
- **Not asked, and following from the calls:**
  - **The frames:** 360×740, 390×844, a tablet at 820×1180 and a desktop at 1280×800, each turned to landscape by a button. The tablet's is 2060td's and the desktop's chooser's.
  - **A layout field changes every size,** unless the form is set to the frame's size, which writes the widget's `at` for it alone. Each override is marked.
  - **The frame draws the one screen,** inert. The outline is the way in for keys and screen readers.
  - **The moment is read by a game of the designer's own,** in a copy of the Play worker. The Play panel's game is never disturbed. The project is compiled without `ui/`, so a half-made screen never stops the frame. That game is loaded from the Play panel's last save, which it keeps.

Evan chose on 2026-10-20, from these options:
- editing: an outline, a form and a frame; the same, plus dragging on the frame; or the frame and the form alone;
- the frame's data: the Play panel's moment with samples in the gaps; the game's start with samples; or samples alone;
- scope: screens and the theme with the JSON kept; screens alone with the JSON kept; or screens, the theme, the shell and the feedback;
- the gate: the hut and the journal rebuilt; all six of the hut's screens rebuilt; or a new screen, then played.

**Why.**
- **The outline mirrors the file.** A screen is a tree, so the designer reaches everything the JSON can say, including a widget hidden by its shows-when or a list with no entries. Dragging on a frame at 360 px is fiddly by touch. 2060td found that a row dragged by touch can't be told apart from a scroll, so its rows drag only by a handle.
- **Real numbers show real wrapping.** Play to the store, then design the store screen with its prices. Samples alone never show how long text runs.
- **The JSON stays** for what the designer can't read, such as a typo, and for the author who wants it.
- **The hut and the journal** use nine of the ten widgets between them, along with breakpoint overrides, arguments, shows-when, tabs and list items. Rebuilding them proves the designer can say what a real game's screens say.

**Cost.**
- **A third copy of the script worker** while a screen is open in the designer.
- **The moment's state moves by save, not live.** A moment from before the Play panel's last step shows until that step's save lands.
- **Overrides only for layout:** `at` changes a widget's layout at a size, never its content, as M4.1 set.

---

### D56. Maps are a kit; its generator makes layered route maps by rules written as data, and drawn maps share its editor; a map widget follows the screen's shape; a slice of Space-Wrecked's sector run and a drawn valley prove it. LOCKED, 2026-10-20 (Evan's calls, M4.6)

**Decision.**
- **A map kit** (Evan's call). Maps are records, the kit ticked in the Project panel like the others.
  - Travel is an action. What it costs (supplies, days, heat) and any odds come from the same preview the sim rolls.
  - Arriving at a node runs its kind's effects: open an event, a shop, a talk.
  - Space-Wrecked's jumps, Dirtbag's drives and Wasteland's next node are each a way to move on a map.
- **Layered route maps, made by rules** (Evan's call).
  - A map runs from a start, through layers of nodes, to an end (an exit, or a boss).
  - Links join neighbouring layers and never cross, with a chance of an extra link. They are directed (Wasteland, Slay the Spire) or go both ways with longer moves (Space-Wrecked), set per map.
  - Node kinds are placed by counts and weights, inside depth windows: "a camp within 2 of the boss", "no elite before layer 5".
  - Maps drawn by hand, with roads, are made in the same editor.
- **A map widget that follows the screen** (Evan's call). On a portrait phone it runs bottom to top and scrolls to where the party is. In landscape and on desktop it runs left to right, fitted, with no scroll. Each node is a real button at least 44 px, the ones in reach ringed, each showing its cost.
- **The gate: a sector run and a valley** (Evan's call). In the editor alone, a slice of Space-Wrecked's sector run:
  - its generator's rules made in the World panel, and checked over 300 seeds with every rule held;
  - stations, a nebula and events placed;
  - jumps that cost supplies and heat by preview;
  - bots that play it to the exit, and a player who plays it to the exit through the map widget by touch on phones.

  Also a valley drawn by hand in Dirtbag's style, with drive times, each drive taking the quickest road.
- **Not asked, and following from the calls:**
  - **Valid by construction.** The generator places by rule and never retries, as none of the games does. Rules it can't meet in some seed are found by checking many seeds, in the editor and by `eb validate`, as the games' tests do. A seed that breaks a rule can be opened.
  - **Saved whole once made.** A generated map is kept in the state as it is made, as Space-Wrecked keeps its sector, so a change to the rules never moves a node under a save.
  - **Words:** a map has layers of nodes, joined by links; a node has a kind; a way to travel is a move.

Evan chose on 2026-10-20, from these options:
- how maps enter play: a map kit; a format and editor only, with travel left to each game's scripts; or generated maps now, with travel left to M4.7;
- the generator: layered route maps; free-form scattered graphs; or maps drawn by hand, with seeded swaps;
- the widget on a phone: following the screen; always left to right; or always bottom to top;
- the gate: the sector run and a valley; the sector run alone; or a map added to the hut.

**Why.**
- **A kit** keeps travel's costs and odds in the sim, where the odds-on-screen rule holds them, rather than in each game's scripts.
- **Layered maps are what the games make.** Space-Wrecked's and Wasteland's generators are both layered, both keep links from crossing the same way, and both check the same kinds of rules. A free-form graph is harder to keep readable and tappable at 360 px, and none of the games uses one.
- **A phone held upright** has the height, not the width, for layers; a landscape screen has the width. Wasteland and Sandbagged scroll upwards on phones; Space-Wrecked fits its chart in landscape.
- **The gate is Phase 4's own proof.** M4.12 imports Space-Wrecked's sector run, so its map is the one to prove first. The valley proves the drawn map and routing that Dirtbag, Ludus and climbing-world-traveler use.

**Cost.**
- **A sector's map lives in the save:** up to 40 nodes and 120 links in Space-Wrecked's, a few kilobytes.
- **Checking 300 seeds costs time** each time a map's rules change; the reading is in ROADMAP.md.
- **Encounters wait for M4.7.** A hostile node opens an event until then.

---

### D57. Encounters are a kit whose fights are worked out round by round, exactly, and rolled once; a fight is a choice of an event or a talk; the roster fights, or named actors; the drift's ships and a Ludus pit prove it. LOCKED, 2026-10-23 (Evan's calls, M4.7)

**Decision.**
- **Rounds worked out exactly** (Evan's call, against the recommendation of strength against strength). Fighters have health, a chance to hit and damage, read from stats the author names. The kit works out the exact chance of every way a fight can end, round by round up to a cap, and rolls once against that table. What a fight leaves (health lost, who falls) comes out of the fight itself, shown as ranges.
- **Fights live inside events** (Evan's call). An event's choice, or a talk's option, fights an encounter: its outcomes are worked out, not written. Flee, pay and parley stay ordinary choices beside it. A stance (Charge, Hold the line) is a choice too, fighting with its own modifiers. Encounters are records: the foes, who fights for the player, and what a win, a draw and a loss do.
- **The roster fights, or named actors** (Evan's call). By default the roster's members fight, front first in the order they joined. A fight or its encounter can name actors instead: the ship in the drift, one gladiator in Ludus. Named actors work without the Roster kit.
- **The gate: the drift's ships and a Ludus pit** (Evan's call). The drift's hostile ship becomes a real fight, its hull and guns against the raiders'. In a new pit, a slice of Ludus, a gladiator from the roster fights. Both are made in the editor with forms, and the bots check over 300 seeds that every fight's table shown is the table rolled. The drift is flown with fights by touch on phones.
- **Not asked, and following from the calls:**
  - **A fight is an effect,** `fight`, which a choice's effects hold. So a fight can also sit in a node's arrival, a quest's stage or a sheet's row, where nothing offers a way out.
  - **One roll out of 10,000.** Each result's chance is a whole percent, exactly what is shown; the wounds within it are shared out in hundredths of a percent. One draw picks the row.
  - **A fight's odds show where an event shows odds** (D45's `show-odds`). With them hidden, the player sees only the choice.
  - **A button gets an optional second line,** `detail`, which the stock event and talk screens use for a choice's odds. Until now no stock screen showed odds at all.

Evan chose on 2026-10-23, from these options:
- how a fight is worked out: strength against strength, with one roll; rounds worked out exactly; or odds bands written by hand;
- where fights live: inside events; an encounter screen of their own; or a fight effect only;
- who fights for the player: the roster or named actors; always the roster; or always one actor;
- the gate: the drift's ships and an arena; the drift alone; or a fight added to the hut.

**Why.**
- **No game we have does this honestly.** Ludus's auto-resolve quotes a separate model, measured 2.5 points off at the extremes. Spliceworld's forecast is 32 fights sampled on another stream. Working out the exact table and rolling it once makes the odds shown the odds rolled by construction, not on average.
- **Rounds give fights texture:** a near thing costs more than a rout, and the wounds a player sees beforehand are the wounds the fight can leave.
- **Inside events** reuses what the event already does: costs, locks, odds, decks, consequences, map nodes, and every way out a game already writes as a choice.
- **Named actors** cover a ship-to-ship fight and a single gladiator without a roster of one.

**Cost.**
- **The work grows with health.** A fight's table is worked out over every pair of health lost by each side, every round. Small numbers keep it quick; the reading is in ROADMAP.md.
- **A fight is fought by lines, not by targets.** Each side strikes the other's front fighter, and what is left over falls on the next. Who targets whom, and tactics within a fight, wait for Phase 6's combat.
- **Floats.** The chances are worked out with `+ − × ÷` on numbers, which every engine rounds alike; the table is then made whole numbers before it is shown or rolled.

---

## Open

- **Engine licence** (ROADMAP open question 2).
- **Theme of proof #2** (ROADMAP open question 3).
- **TWA package id scheme** (ROADMAP open question 4).
- **Theme and genre of proof #4** (ROADMAP open question 7).
