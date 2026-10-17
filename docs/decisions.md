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

### D9. Dialogue: visual trees plus ink scenes. PROPOSED until M3.6, 2026-10-17

- Trees in dirtbag's `TalkDef` shape for most talk; they are editable as a graph on a phone.
- ink for long-form writing, with chooser-of-the-dead's stateless scene player.
- Both use the shared conditions and effects.

### D10. Editor storage: OPFS, "open folder", zip; GitHub sync in Phase 4. PROPOSED until M2.1, 2026-10-17

The domain it lives on is OPEN (ROADMAP open question 1). Browser storage is per origin, so moving domains later strands projects stored in the browser.

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

---

## Open

- **Editor domain** (ROADMAP open question 1).
- **Engine licence** (ROADMAP open question 2).
- **Theme of proof #2** (ROADMAP open question 3).
- **TWA package id scheme** (ROADMAP open question 4).
