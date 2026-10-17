# Architecture

How Engine-Builder fits together. This is design intent: each section is settled in the phase that builds it, and changes are recorded in [decisions.md](decisions.md). The evidence behind most choices is in [research/existing-games.md](research/existing-games.md).

## Goals and non-goals

**Goals**

- Build the games RCJ Labs makes from data, kits and small scripts, without rewriting an engine each time:
  - squad and party RPGs, route-map roguelites, management sims;
  - card and choice games, tower defense, builders;
  - and, new here, Bethesda-style 3D worlds.
- Edit on a PC, tablet or phone. Every panel works on touch; the layout is tuned for PC and tablet.
- Ship as a PWA on GitHub Pages, a single HTML file, an itch.io build, and a Play TWA, plus Electron/Steam later.
- Keep what the existing games already prove works:
  - a deterministic sim;
  - content as validated data;
  - saves that never break;
  - headless bots;
  - offline first.

**Non-goals**

- Photoreal rendering (Nanite/Lumen class). Browser 3D on phones means stylized, low-poly or moderate PBR; photoreal stays an Unreal job.
- Multiplayer, console exports, a hosted backend.
- Replacing code entirely. The no-code layer covers the common cases, and TypeScript covers the rest.

## Products

| Product | Where | What it is |
| --- | --- | --- |
| Runtime | `packages/*` | Ships inside every exported game. Modular: a UI-only game stays small, and 3D, physics and navigation load only when a game uses them. |
| Editor | `apps/editor` | An installable PWA. Play-in-Editor runs the same runtime the export ships. |
| CLI | `tools/cli` (Phase 1) | `eb validate`, `eb build`, `eb export`, `eb sim`, for CI and for agents working in the repo. |
| Templates | `templates/*` (Phase 4+) | Starter projects with stock screens, kits, sample content and bot tests. |

## The sim decides; the stage renders

Every game splits into two halves, as dirtbag, landnam, space-wrecked, spliceworld and chooser-of-the-dead already do.

```
              actions (player intents, ticks, stage facts)
   ┌─────────────────────────────────────────────────────────┐
   │                                                         ▼
┌──┴───────────────────────────┐            ┌────────────────────────────────┐
│ STAGE (impure)               │            │ SIM (pure, eb.pure packages)   │
│ DOM UI · 2D/3D scene ·       │  beats     │ reduce(state, action, sim)     │
│ physics · audio · haptics ·  │◀───────────│   → { state, beats, accepted } │
│ input · screen reader        │            │ rng streams · content · clock  │
└──────────────────────────────┘            └────────────────────────────────┘
```

- **The kernel** (M1.5, [specs/sim.md](specs/sim.md)):
  - a game is a list of modules, each owning one slice of state and registering actions, facts, effects and modes;
  - a refused action returns the same state and one `rejected` beat;
  - a mode stack says which actions are allowed;
  - a session queues beats for the stage to drain.
- **The sim** is a pure function over serializable state.
  - It owns everything a save or a replay must reproduce: quests, inventories, stats, factions, time, world facts, and the RNG state.
  - Its RNG comes from named streams in `ctx`, and time arrives as actions: fixed ticks for real-time play, days or turns for turn-based play, wall-clock deltas for offline timers ([specs/time.md](specs/time.md)). The sim never reads a clock.
- **The stage** draws the state and plays the beats: animation, sound, haptics, and screen-reader text, which is a pure function of the beats (as in landnam's `announce.ts`). It turns input into actions.
- **3D.** Physics, movement and animation run in the stage at frame rate.
  - The stage reports discrete facts to the sim as actions: *entered trigger*, *hit X with Y*, *picked up Z*.
  - The sim resolves what they mean, for example damage from stats, effects and an RNG roll.
  - Positions are written into sim state at checkpoints: saves, cell changes, quest events.
- **What is guaranteed.** Determinism and replay hold for the sim. They do not hold for frame-level stage motion. A 3D replay re-runs the actions, not the frames.

**Purity rules.** Packages marked `"eb": { "pure": true }` may not use the following. `tools/lint-boundaries` enforces it, and the pure tsconfig removes DOM and Node types.

- The DOM or host globals.
- `Math.random`, `Date`, timers, `Intl` or `localeCompare`.
- Transcendental `Math` (`sin`, `pow`, `exp`, `log`…) or `**`. Their results differ between JavaScript engines, and a daily seed must give the same day in every browser.
- Imports other than their own files and other pure packages.

## Project format

A project is a folder of git-friendly JSON, so the editor, a text editor and Claude Code can all work on the same files.

```
my-game/
  project.json            id, name, version, modules, targets, settings
  records/<type>/<id>.json one record per file (items, actors, quests, events…)
  types/<type>.json        the project's own record types, as fields (M2.4)
  scenes/<id>.json         3D/2D scenes: entity trees with placed references
  ui/<screen>.json         screens: widget trees, bindings, actions
  scripts/*.ts             script components (sim or stage)
  dialogue/*.ink           ink scenes
  assets/…                 images, audio, models, fonts, plus assets.json (provenance)
  locales/<lang>.json      string tables (Phase 8)
```

- **Format 1** (M1.4) has `project.json` with `id`, `name` and `version`, plus `records/`. M2.4 added `types/`, and asset fields that name files in `assets/`, without a format bump, since a project without them loads as before. The other folders, and project.json's `modules`, `targets` and `settings`, arrive with the milestones that use them ([specs/project-format.md](specs/project-format.md)).
- **One record per file** keeps diffs small and merges clean. Big tables (cards, players) may later opt into one collection file per type.
- **Compiling.**
  - `packages/compiler` validates a project and builds **content packs**: canonical JSON with a content hash, plus coded diagnostics.
  - It reads the project from memory, OPFS, an opened folder or a zip, in the editor (in a worker) and in Node (the CLI and CI).
  - The runtime loads packs through `readPack`, which checks the hash. It never reads the project folder.
- **Formatting.** Stable key order and formatting, so a save in the editor and a hand edit produce the same bytes.

## Records

Records are Bethesda's "forms": typed data with stable ids.

- **Base records** come from modules and kits: item, actor, faction, loot table, event, quest, dialogue tree, location, encounter, shop, and dial (a tunable number plus the reason for it).
- **Custom record types** are data: a project's `types/<type>.json` lists a type's fields by kind, and the compiler builds the same strict zod schema a code type has (M2.4, D31, [specs/type-files.md](specs/type-files.md)). This covers the data unique to a game: football players, gladiators, cards. A project made only of data needs no code at all; M2.6 adds the screens that design types in the editor.
- **References.**
  - A record field can point at another record. It holds the bare id when the field names one type (`"drops": "dead-hauler"`), and `type:id` when it allows several (`"target": "item:medkit"`). Validation checks every reference and builds the index behind the editor's "used by" ([specs/records.md](specs/records.md)).
  - In scenes, a placed reference is an instance of a base record with overrides: position, a different inventory, a quest alias.
- **Text fields** hold the default-language string. Phase 8 extracts them into string tables keyed by record path, so nobody manages string keys by hand.
- **Schemas and diagnostics.**
  - Schemas are strict zod in `packages/schema`, mirroring types declared in pure code, and are exported as JSON Schema for autocomplete.
  - Diagnostics carry a code (`E001`, later `W101`), the file and a JSON Pointer to the field.
  - At runtime the sim reads compiled records through `@eb/core`'s record store and never imports zod.

## Conditions and effects

One condition language and one effect vocabulary serve quests, dialogue, events, triggers, achievements and UI bindings, so the editor needs one set of pickers.

```jsonc
// condition: a tree, with a text form that round-trips
{ "all": [
  { "fact": "hold.count", "args": { "item": "medkit" }, "op": ">=", "value": 2 },
  { "fact": "time.phase", "op": "!=", "value": "night" }
] }
// text: hold.count(medkit) >= 2 and time.phase != night

// effects: a list; a roll picks weighted outcomes and preview() shows the exact odds
[
  { "effect": "resource", "id": "credits", "delta": -20 },
  { "effect": "roll", "outcomes": [
    { "chance": 70, "text": "The crate comes back.", "effects": [{ "effect": "loot", "table": "salvage" }] },
    { "chance": 30, "text": "A door gives way.",     "effects": [{ "effect": "wound", "hp": 3 }] }
  ] },
  { "effect": "schedule", "after": { "days": 3 }, "effects": [{ "effect": "event", "id": "debt-collector" }] }
]
```

The exact rules are in [specs/conditions.md](specs/conditions.md) (M1.6).

- **Facts** are registered by modules and kits (`hold.count`, `quest.stage`, `faction.standing`, `time.phase`…) and later by project scripts. Each declares its arguments and its domain: bool, int, number, enum, a record reference, or text. A domain is a promise the kernel checks on every read.
- **Evaluation** is three-valued. An unknown fact yields *unknown*, not *false*, following who-am-i's condition engine, and a gate opens only on *true*. Menus and the sim use the same check.
- **`describeCondition()`** turns a condition into readable text: "Needs 2 medkits and not night".
- **`game.preview()`** returns what effects would do from the current state, and the exact odds a `roll` will use, from the same table the roll reads.
- **A lint** asks whether each condition in content can be true, and can be false, over the facts' domains (who-am-i's search). It reports W102 to W104 when a project is built.
- **Later:** flags that are set but never read, or read but never set (rule-or-drool's graph rules). This needs effects to declare what they change, so it waits for kits.

## Logic layers

1. **Trigger sheets.** Rows of *When* (an event) / *If* (conditions) / *Do* (effects), attached to a project, a scene, an entity or a quest. They cover most mission and level logic with no code.
2. **TypeScript script components**, with a typed `ctx` API.
   - *Sim scripts* register facts, effects, reducers and bot policies, and are linted with the same purity rules as `eb.pure` packages.
   - *Stage scripts* drive visuals and movement and are unrestricted.
   - Scripts are edited in CodeMirror 6, transpiled by sucrase in a worker, and hot-reloaded in Play-in-Editor.
3. **Node graphs** (Phase 8) compile to the same actions and effects, so nothing in the runtime depends on them.

Scripts in your own projects are trusted. Scripts from other people (mods, Phase 9) run sandboxed.

## Missions

The existing games use four families of mission. One quest model covers all four, plus Bethesda-style structure.

| Family | Seen in | In the engine |
| --- | --- | --- |
| Choice events | space-wrecked events, dirtbag knocks, afterglass visitors, wasteland events | An `event` record: choices with `needs` (shown as costs) and weighted `outcomes` with effects |
| Multi-step quests | space-wrecked quests (`done` / `cold` steps, `payoff`), dirtbag goal ladders, afterglass chapters | A `quest` record: steps that advance or go cold on outcomes, and a payoff |
| Timed or contract jobs | spliceworld operations, space-wrecked contracts | A step of type `job`: duration, odds formula, outcome sealed at launch, cooldown, pitch template |
| Counter objectives | wasteland bounties, achievements, live-ops style hunts | An objective of type `count`: a metric, a filter and a target |

A quest has the following parts:

- **Stages:** numbered, each with journal text and effects on entry.
- **Objectives:** shown while their stage is current, each with a marker bound to an alias.
- **Aliases:** named slots filled when the quest starts. One can be a specific reference, a unique actor, or "find a matching reference" by conditions, which is how radiant quests work.
- **Variables, start conditions, fail conditions and rewards.**

The mission designer shows a step list and a graph built from the transitions. Validation finds unreachable stages, dead ends and objectives with no way to complete them. Bots prove every quest can be completed.

## Dialogue

- **Dialogue trees** for most talk.
  - Data in dirtbag's `TalkDef` shape: start nodes chosen by condition, and nodes with text and options, each option with conditions, effects and a next node.
  - Edited as a graph, and comfortable on a phone.
- **ink scenes** for long-form writing, using chooser-of-the-dead's stateless player:
  - each scene is its own compiled story;
  - it reads game state only through whitelisted EXTERNALs;
  - it changes game state only through `# fx:` tags applied when the scene ends;
  - a lint walks every path.
- Both use the shared conditions and effects, and the same dialogue screen.

## Worlds

| World model | Phase | For |
| --- | --- | --- |
| Node-graph maps | 4 | Sector, valley, coast and county maps. A seeded generator plus validators for placement rules (e.g. "a camp within 2 nodes of the boss"). |
| 3D worldspaces | 5–6 | Exterior worldspaces in chunks, streamed by distance; interiors as separate scenes joined by load doors; persistent references. |
| 2D scenes | 7 | Tilemaps (autotile, ASCII import, walk/cover/sight per tile), side-view floors and rooms, sprites, parallax. |
| Custom stages | 7 | Renderers drawn in code (Canvas2D, SVG) behind a small API, so code-drawn art keeps working. |

**3D stack**

- three.js `WebGPURenderer`, falling back to WebGL2 automatically.
- Rapier for physics and the character controller; recast-navigation-js for navmeshes.
- glTF/GLB with Draco or Meshopt, and KTX2 textures.
- All of it is lazy-loaded: a game without a 3D scene never downloads it.
- What the M1.10 spike found (Rapier's heightfield layout, rays on triangle edges, what Rapier weighs) is in [apps/spike-3d](../apps/spike-3d/README.md#findings-for-phase-5).
- **Quality tiers:**
  - *Low (phones):* one shadow cascade or none, short draw distance, no post-processing.
  - *High:* cascaded shadows, SSAO, bloom.

## UI

Screens are data: a widget tree with layout, a theme, bindings and actions. A small runtime renders them with Preact.

- **Widgets:** panel, stack, grid, text, image, button, toggle, slider, select, progress bar, list (bound to a collection), tabs, modal, tooltip, toast, touch stick, touch button.
- **Layout:** flex and anchors, safe-area insets, and breakpoints at phone portrait, phone landscape, tablet and desktop.
- **Themes:** colour, type and spacing tokens, plus UI sounds. Every theme is checked for AA contrast in CI.
- **Bindings** read state through the shared fact registry, for example `resource(credits)`, and **actions** run effects or open screens.
- **Navigation and input:**
  - A screen stack with transitions.
  - Spatial focus navigation for keyboard and gamepad, following chooser-of-the-dead's `spatial.ts` and dirtbag's `ui/spatial.ts`.
  - A gesture recognizer for tap, long-press, drag and pinch (from space-wrecked's `ui/gestures.js`).
- **Stock screens** ship as templates you restyle:
  - title with slots (Continue, New, Daily), settings, save/load, pause, HUD;
  - inventory, journal, map, dialogue, shop, codex (built from live numbers);
  - credits, ending, crash, update prompt.

## Saves

The design combines chooser-of-the-dead, climbing-world-traveler, spliceworld, dirtbag, rule-or-drool, 2060td and space-wrecked. [docs/specs/saves.md](specs/saves.md) is the spec.

- **Contents.** A snapshot of the sim state plus the actions since it, with a checksum.
  - The state holds ids into content, not copies of it, so a content update reaches existing saves.
  - Worlds will save placed references as changes against the authored content (M5.8), as Bethesda's change forms do.
- **Loading.** On the same build the log must replay to exactly the saved state. After an update it replays under the new rules, and what changed is reported rather than refused.
- **Versioning.**
  - `SAVE_VERSION` covers the file and the kernel's state.
  - Each module versions its own slice and migrates it without reading content.
  - Every past version keeps a fixture that must still load.
- **Slots** live in `@eb/platform`.
  - Each slot has a summary, so a list doesn't read the saves.
  - Each slot keeps a backup: the save its last write replaced.
  - A save that won't load, that a write would destroy, or that an update changed is copied to quarantine first, and is never overwritten.
  - Logs stop growing: `writeSession` compacts the session at 200 actions.
- **Export and import.** The save file is JSON, and a text code (`EB1.<game>.<payload>.<check>`) carries it deflated. The buttons are the save/load screen's (M4.2).
- **Storage.**
  - IndexedDB by default, then localStorage, then memory. A file adapter for Electron comes with Phase 8's desktop export.
  - A persistent-storage request on the first save.
  - Every write goes through one gate that reports failure to the player (rule-or-drool's `meta/storage.ts`).
- **Namespaces.** Keys are namespaced by game id and edition. All github.io projects share one origin, so two games, or a demo and a full build, must never collide.

## Audio and haptics

- Every existing game synthesizes its sound. The engine keeps that as the default:
  - an SFX designer with ZzFX-style parameters, presets and randomize;
  - ambience beds and music stems on buses (master, music, SFX, UI);
  - settings for each bus.
- Files (OGG/MP3/WAV) are supported for 3D games.
- Haptics and sounds read the same cue list (landnam's `haptics.ts`), so feedback stays consistent and can be switched off per channel.

## Platform and export

- **Target matrix.** A project lists its targets, following chooser-of-the-dead's `targets.ts`. Each target has an edition (demo, full, playtest), content packs, a platform adapter, PWA on/off, a base path and a storage namespace.
- **Leak check.** A demo build must not contain full-game tokens. A full build must contain its canary, so the check can't pass by doing nothing.
- **Pages PWA.**
  - A service worker whose precache is hashed, and whose cache cleanup is prefix-scoped (the origin is shared).
  - Updates are offered only at safe moments, by prompt, never forced mid-session (project-ascent's update gate).
  - `version.json` plus a build stamp, and a deploy check that waits for the live commit.
- **Single-file HTML** (landnam, 2060td, ludus) for hand-off, itch.io and `file://`.
- **TWA.**
  - dirtbag's pipeline: pinned Bubblewrap, targetSdk ≥ 36, signing from CI secrets, versionCode from the clock.
  - `assetlinks.json` at the origin root, so it needs a custom domain or the root github.io repo.
  - Upload with `include-hidden-files`.
- **Electron/Steam** later, from dirtbag's `desktop/`: an `app://` protocol, file-backed saves and an achievements adapter.
- **Icons** are generated from one source. The editor renders them in a canvas, and the CLI uses Playwright.

## Testkit

Games built on the engine get these from the start; templates ship with them already wired.

- A headless runner (Node or a worker), with bot policies that play only through `game.options` and `reduce`, and see only what a player sees (M1.9, [specs/runner.md](specs/runner.md)).
- Seed sweeps with 95% intervals on every number (M1.9), and A/B content overrides later (chooser-of-the-dead's `compare.ts`, Phase 8).
- Canonical state hashes, per-facet readings and first-difference paths ([specs/state-hash.md](specs/state-hash.md)), and golden files of whole runs, per seed and per slice (M1.9).
- Save fixtures for every version ([specs/saves.md](specs/saves.md)).
- Size and performance budgets in CI.

The CLI exposes these as `eb sim` (M1.9) and `eb test` (later). The editor's Balance Lab (Phase 8) charts them.

## Editor

- **Layout** (M2.2, D29, [specs/editor-layout.md](specs/editor-layout.md)).
  - Desktop: dockable panels (dockview, loaded only on desktop), with the layout saved in the browser. Today they are Project, Logic, World, Play, Inspector and Console. Assets, Records, Outliner and Problems join as their milestones land.
  - Tablet: two zones.
  - Phone: one panel at a time with a bottom tab bar, and the inspector as a bottom sheet.
  - Every layout: a command palette, from the top bar or Ctrl/⌘+K.
  - The breakpoints are written down once, in `apps/editor/src/app/layout.ts`. The shell sets `data-layout` from them, and the CSS keys off that attribute.
- **Editing.**
  - Undo and redo through a command log of file changes, autosave through a journal, and one editing tab per project, held by a Web Lock (M2.3, D30, [specs/editor-editing.md](specs/editor-editing.md)).
  - Forms from each record's type file in the inspector, with pickers for refs and assets, the compiler's problems beside each field, and New and Delete in the Project panel (M2.4, [specs/editor-forms.md](specs/editor-forms.md)). Tables and "used by" follow (M2.5).
- **Storage** (M2.1, D10, [specs/editor-storage.md](specs/editor-storage.md)).
  - OPFS everywhere, written through one worker's sync access handles.
  - "Open folder" on desktop Chromium, so the editor and Claude Code edit the same git checkout.
  - Zip import and export, carrying only the project's own files, the same bytes every time.
  - GitHub sync (Phase 4) is the backup and the route from a phone to a repo.
- **Play-in-Editor.** The player runtime in an iframe, fed by the compiler in a worker. It has a state inspector, event log, time controls, quest debugger, save states and replay.

## Packages

```
packages/core       pure: rng, hash, records runtime, conditions/effects, reducers, events, clock
packages/kits       pure: stats/effects, inventory/loot, factions, economy, roster, quests, dialogue, events
packages/schema     zod schemas for the project format and records; type files (M2.4); JSON Schema export
packages/compiler   project loader, validation, packs, export (browser + Node)
packages/ui         runtime UI renderer, widgets, themes, stock screens, input, a11y
packages/platform   save slots and storage (M1.8); SW/update gate, haptics, wake lock later
packages/stage3d    three.js + Rapier + recast (lazy-loaded)              Phase 5
packages/stage2d    sprites, tilemaps, custom-stage API                   Phase 7
apps/editor         the editor PWA
apps/player         the runtime shell that exports ship                    Phase 4
tools/cli           eb validate | build (M1.4), sim (M1.9); export | test later
tools/lint-boundaries
tools/site-check    the deploy check: the live page and every file it loads (M2.2)
templates/*                                                               Phase 4+
```

**Dependency direction.**

- Pure packages depend only on other pure packages.
- `schema` and `compiler` may depend on zod.
- `ui`, `platform` and the stage packages depend on the pure ones, never the other way round.
- `apps/*` depend on anything.

Packages are added in the phase that first needs them, not before.

## Budgets

These are set from readings, not guesses (see ROADMAP Readings).

- **Editor shell:** about 15 kB of gzipped JS at Phase 0.
- **UI-only game export:** a budget set at M4.10 from the first measured template.
- **3D:** FPS targets per quality tier, set from the M1.10 spike on a real phone.

## Open questions

- Whether `kits` stays one package or splits by kit once there are several. Decide at M3.3 from the import graph.
- Whether the sim moves into a Web Worker for 3D games. The action/event boundary already allows it; decide from frame-time readings in Phase 6.
