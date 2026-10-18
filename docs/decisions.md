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

### D4. Preact + signals for the editor and in-game UI. LOCKED for the editor, PROPOSED for game UI until M4.1, 2026-10-17

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

### D9. Dialogue: visual trees plus ink scenes. PROPOSED until M3.8, 2026-10-17

- Trees in dirtbag's `TalkDef` shape for most talk; they are editable as a graph on a phone.
- ink for long-form writing, with chooser-of-the-dead's stateless scene player.
- Both use the shared conditions and effects.

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

### D11. Export targets as a per-project matrix. PROPOSED until M4.8, 2026-10-17

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
  - store builds (the Play package, Steam's) in a GitHub workflow the editor writes (M4.8), since Bubblewrap, the Android SDK and Electron can't run in a browser.
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
- a calendar no time module reads (the kit off, or a game with its own) is a warning, W116, not an error;
- real time (`time/elapse`) for a project made of data waits for Phase 4's stage.

The specs are [specs/factions.md](specs/factions.md) and [specs/time.md](specs/time.md#the-time-kit), and the survey behind them [research/kits-ii.md](research/kits-ii.md).

**Why.**
- **Two milestones.** Phase 3's gate needs a shop and factions, not a roster. Recruits made in play are actors that content doesn't list, which the stats kit reads only from records, so they need a design of their own.
- **Bands of its own.** The games' ranges and bands differ (−3 to 3, −10 to 10, −100 to 100, 0 to 100); every one moves standing from content, often in opposed pairs, and none spreads a change by itself.
- **Prices and drift.** Band prices are what Space-Wrecked's stations and Landnam's trade do. Drift is Landnam's, Ludus's, 2060td's and rule-or-drool's; written as rows, it would take one row a faction.
- **Events as each day starts.** Landnam's `passDay` and Ludus's week's end run fixed steps in a fixed order, which a sheet's rows are. Ludus's festivals and Dirtbag's holidays and bills are a table of dates, which conditions on the date are.

**Cost.**
- **Drift is in whole points:** Landnam's 0.12 a day becomes a point every 8 days.
- **No relations:** a game where standing with one faction moves its allies writes the second effect each time.
- **Every game with a time module raises the new events,** so its beats change. Its state doesn't, so neither do its golden runs.
- **The roster waits a milestone,** and recruits with it.

---

## Open

- **Engine licence** (ROADMAP open question 2).
- **Theme of proof #2** (ROADMAP open question 3).
- **TWA package id scheme** (ROADMAP open question 4).
- **Theme and genre of proof #4** (ROADMAP open question 7).
