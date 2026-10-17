# ROADMAP.md: Engine-Builder

**One-liner:** a browser engine and editor for the games RCJ Labs makes. You put in records, missions, scripts, worlds and screens, and the engine does the rest. It runs on a PC, tablet or phone and ships as a PWA or a Play TWA.

**CURRENT MILESTONE: M1.8.** Saves (Phase 1). M1.1 to M1.7 (RNG streams, state fingerprints, records, project format, the sim kernel, conditions and effects, time) are done. Phase 0 waits only on your phone check: install the editor from Pages and reopen it offline.

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
- **M1.8 Saves** (`packages/platform` for storage).
  - Snapshot plus action log; `SAVE_VERSION` and a migration registry.
  - Slots with summaries; bad saves quarantined, never overwritten.
  - File and text-code export with a checksum.
  - IndexedDB, localStorage and memory adapters.
  - Storage keys namespaced by game and edition.
- **M1.9 Headless runner.**
  - Bot policies and seed sweeps with confidence intervals.
  - Golden hashes, run by the CLI's `eb sim`.
- **M1.10 3D spike** (throwaway, served at `/spikes/3d/`).
  - three.js with WebGPU, falling back to WebGL2.
  - A 256² heightmap terrain, 5,000 instanced props, one skinned character, shadows.
  - Three quality tiers, an FPS overlay, and Rapier's load time.

**Done when:**

- A test-only text game runs 1,000 seeds deterministically. [auto] Done 2026-10-17 (M1.5): salvage run in `packages/core/src/sim/salvage.test.ts`.
- Save → load → continue matches an uninterrupted run by hash. [auto] The kernel's half passes (M1.5: a JSON round trip of the state mid-run). M1.8 must pass it again through real saves.
- A v1 save fixture loads after a planted v2 migration. [auto]
- RNG golden vectors are frozen in the spec. [auto]
- FPS per tier for the 3D spike, from your phone, is recorded in Readings. [you]

## Phase 2: Editor foundation

**Goal:** make and keep a project on any device. Data editing works; logic and worlds come later.

- **M2.1 Project storage.**
  - Projects live in OPFS.
  - "Open folder" (File System Access) on desktop Chromium, so the editor and Claude Code edit the same git checkout.
  - Zip import and export; a persistent-storage request.
  - Settle the editor's domain first (Open questions).
- **M2.2 Layout.** dockview panels on desktop, with save and restore. On a phone: one panel, the inspector as a bottom sheet, and a command palette.
- **M2.3 Editing safety.** Undo/redo through a command log, autosave, and a lock so two tabs can't edit one project.
- **M2.4 Forms from schemas.** Text, number/slider, enum, a reference picker with search, list, map, colour and asset fields, with inline validation.
  - A condition field: the text form with live errors and `describeCondition` wording (M1.6). Decide here whether record files may hold the text form too ([conditions.md](docs/specs/conditions.md#open-questions), question 1).
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
- The CLI validates that zip in CI with the same content hash. [auto]
- A project opened from a git folder on desktop round-trips with zero diff. [auto]

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
| Editor shell precache | 16 entries, 72 KiB | vite-plugin-pwa build log | 2026-10-17 | 1 build |
| Sim kernel reduce, salvage run (M1.5 content) | 18.2–22.7 µs per action (median 20.0) over 80,911 actions | `node packages/core/test/salvage-bench.ts`, Node 22.22, cloud container | 2026-10-17 | 5 runs |
| Sim kernel reduce, salvage run (M1.6: conditions and rolls) | 20.5–23.8 µs per action (median 21.6) over 74,658 actions. The M1.5 content on the M1.6 kernel gave 19.7–22.9 µs (median 21.4) over the same 80,911 actions | `node packages/core/test/salvage-bench.ts`, Node 22.22, cloud container | 2026-10-17 | 5 runs each |
| Sim kernel reduce, salvage run (M1.7: days and debts) | 23.4–26.7 µs per action (median 24.9) over 74,534 actions | `node packages/core/test/salvage-bench.ts`, Node 22.22, cloud container | 2026-10-17 | 5 runs |
| Offline settle, 8 hours at a tick a second, 100 hourly timers | 7–12 ms (median 9) for 800 firings; 101–120 ms (median 108) when 8 timers refuse every time, re-running the action 64 times | `node packages/core/test/time-bench.ts`, Node 22.22, cloud container | 2026-10-17 | 5 runs |
| Condition lint at its caps | 20–30 ms (median 25) to try all 100,000 combinations; 17–25 ms (median 20) for 20,000 samples | `node packages/core/test/sat-bench.ts`, Node 22.22, cloud container | 2026-10-17 | 5 runs |
| 3D spike FPS per tier, your phone | not taken yet | M1.10 overlay | | |

## Open questions

1. **Editor domain.** `rcjlabs.github.io/Engine-Builder` or a custom subdomain such as `engine.rcjlabs.com`?
   - Browser storage is per origin. On github.io, projects share quota with every Pages game, and they don't follow a later move.
   - A TWA needs `assetlinks.json` at the origin root, which a github.io project path can't serve.
   - Decide before M2.1 stores projects.
2. **Engine licence.** chooser-of-the-dead is GPL code with its story and art reserved. Pick before any outside contributions; until then the repo has no licence, which means all rights reserved.
3. **Theme of proof #2.** Landnam's coast, Wasteland Protocol's desert, Dirtbag's valley, or something new?
4. **TWA package ids.** `io.github.rcjlabs.*` and `com.rcjlabs.*` are both in use today. Pick one scheme before the first engine-built TWA.
5. **Orientation on large screens.** A third-party report says SDK 36 apps can no longer lock orientation on screens ≥600dp. Verify before shipping a landscape-only game such as Space-Wrecked as a TWA.
