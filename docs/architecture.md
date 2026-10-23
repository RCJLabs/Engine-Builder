# Architecture

How Engine-Builder fits together. This is design intent: each section is settled in the phase that builds it, and changes are recorded in [decisions.md](decisions.md). The evidence behind most choices is in [research/existing-games.md](research/existing-games.md).

## Goals and non-goals

**Goals**

- Build the games RCJ Labs makes from data, kits and small scripts, without rewriting an engine each time:
  - squad and party RPGs, route-map roguelites, management sims;
  - card and choice games, tower defense, builders;
  - and, new here, Bethesda-style 3D worlds.
- Edit on a PC, tablet or phone. Every panel works on touch; the layout is tuned for PC and tablet.
- Make a whole game in the editor alone, art and sound included, by following a tutorial: the editor's own painter, rig, music and mesh tools, and the engine's bundled OFL fonts (D40, Phase 10).
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
| CLI | `tools/cli` (Phase 1) | `eb validate`, `eb build`, `eb schemas`, `eb export`, `eb sim`, for CI and for agents working in the repo. |
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
  scripts/<id>.ts          the game's code: modules, bots; scripts/game.ts is the game (M3.2)
  dialogue/*.ink           ink scenes, compiled into talks (M3.11)
  assets/…                 images, audio, models, fonts, plus assets.json (provenance)
  locales/<lang>.json      string tables (Phase 8)
```

- **Format 1** (M1.4) has `project.json` with `id`, `name` and `version`, plus `records/`. M2.4 added `types/`, and asset fields that name files in `assets/`, and M2.7 the provenance log every file there needs (D34), without a format bump, since a project without them loads as before. The other folders, and project.json's `modules`, `targets` and `settings`, arrive with the milestones that use them ([specs/project-format.md](specs/project-format.md)).
- **One record per file** keeps diffs small and merges clean. Big tables (cards, players) may later opt into one collection file per type.
- **Compiling.**
  - `packages/compiler` validates a project and builds **content packs**: canonical JSON with a content hash, plus coded diagnostics.
  - It reads the project from memory, OPFS, an opened folder or a zip, in the editor (in a worker) and in Node (the CLI and CI).
  - The runtime loads packs through `readPack`, which checks the hash. It never reads the project folder.
- **Formatting.** Stable key order and formatting, so a save in the editor and a hand edit produce the same bytes.

## Records

Records are Bethesda's "forms": typed data with stable ids.

- **Base records** come from modules and kits: item, actor, faction, loot table, event, quest, dialogue tree, location, encounter, shop, and dial (a tunable number plus the reason for it).
- **Made records** (M3.6, D44): a module may make records in play from its slice, such as the roster kit's recruits, and the content every module reads holds them beside the pack's, read through the action's drafts and never shadowing a written one ([specs/sim.md](specs/sim.md#made-records)). `game.content(state, sim)` is that content outside an action, for the stage.
- **Custom record types** are data: a project's `types/<type>.json` lists a type's fields by kind, and the compiler builds the same strict zod schema a code type has (M2.4, D31, [specs/type-files.md](specs/type-files.md)). This covers the data unique to a game: football players, gladiators, cards. A project made only of data needs no code at all. The editor designs types in the inspector, and renames carry the records with them (M2.6, D33, [specs/editor-types.md](specs/editor-types.md)).
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
  { "effect": "pay-cost", "cost": { "credits": 20 } },
  { "effect": "roll", "outcomes": [
    { "chance": 70, "text": "The crate comes back.", "effects": [{ "effect": "roll-loot", "table": "salvage" }] },
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
- **Flags** (M3.1, D36) are what content remembers: declared records, on or off or a whole number with bounds. `set-flag` and `add-to-flag` change them, `flag.on` and `flag.number` read them, and a lint warns of flags set but never read, read but never set, or never named (rule-or-drool's graph rules), [specs/triggers.md](specs/triggers.md).
- **Effect fields.** `effect()` marks a field that holds an effect, checked against the effects known: the engine's own, or a game's when `--types` or its scripts/game.ts give them (M3.2).
- **Scripts** (M3.2, D38) are `scripts/<id>.ts`, checked without running (E028 to E030, W111, W112) and packed as JavaScript, pack format 2, once game.ts reaches them ([specs/scripts.md](specs/scripts.md)).
- **Kits** (M3.3, D41) are the engine's modules for what most games share, listed in `project.json`: the inventory kit (items, the party's bag, loot tables) and the economy kit (resources, shops). A kit that is on brings its record types, as type files a project can add fields to, its facts, events and effects, and its module, which joins the game. Every price a shop shows or charges comes from one quote, exact in BigInt ([specs/kits.md](specs/kits.md)). M3.4 (D42) adds the stats kit (actors, stats that any damage takes from and a rising maximum gives back, statuses that stack and run out as time passes) and the gear kit (slots, and items worn in them, out of the party's bag): a value is its base, then every add, then every percent, rounded once, and its parts are what a screen shows ([specs/stats.md](specs/stats.md)). M3.5 (D43) adds the factions kit (standing with each faction in its own range, in bands that set a share of a shop's prices and that conditions read, drifting back a point every few days, [specs/factions.md](specs/factions.md)) and the time kit (the time module with `project.json`'s calendar, which says as each day, week, month, season and year starts, so a sheet's rows are a day's pass, [specs/time.md](specs/time.md#the-time-kit)). M3.6 (D44) adds the roster kit: members who join and leave, kept as gone with why; recruits rolled from templates and offered by halls, each offer worked out again from the seed so only hires are saved; ranks as bands on a stat, each giving a status; and bonds, a number for each pair in bands ([specs/roster.md](specs/roster.md)). M3.7 (D45) adds the events kit: choice events whose choices cost, need or roll something, shown locked with what they need and with their odds hidden unless the event shows them, all from the verdict choosing makes; decks that draw by weight, once, recent and a boost for those unseen; and consequences that land days, choices or a number flag's rise later, checked again as they come due ([specs/events.md](specs/events.md)). Type files gained an `effects` kind for it, a list of effects that every form draws as a row's Do is ([specs/type-files.md](specs/type-files.md#kinds)).

## Logic layers

1. **Trigger sheets** (M3.1, D36, [specs/triggers.md](specs/triggers.md)). Records of rows: *When* (an event, with argument values to match) / *If* (a condition) / *Do* (effects), run in the order written, each row as one attempt. Events are beats modules declare with typed arguments; listeners hear them when the work that raised them finishes, so a timer's consequences land at its tick. Sheets are records of their own today; a scene, an entity or a quest may carry rows later. They cover most mission and level logic with no code.
2. **TypeScript scripts** (M3.2, D38, [specs/scripts.md](specs/scripts.md)).
   - *Sim scripts* are modules made with `defineModule`: facts, effects, events, actions and modes, with bots beside them. `scripts/game.ts` exports the game as `eb sim --game` reads a module, so `eb` and the editor check content against its facts, events and effects, and play it. They import only `"eb"`, the sim's API, and each other, and are held to the purity rules `eb.pure` packages keep (`packages/purity`).
   - *Stage scripts* will drive visuals and movement, unrestricted, with the runtime (Phase 4).
   - The editor edits them in CodeMirror 6 with completion from the engine's API list, and a worker compiles them with sucrase, checks them and runs them as you type; Run plays 20 games and shows `eb sim`'s report ([specs/editor-scripts.md](specs/editor-scripts.md)). Hot reload in Play-in-Editor arrives with it (Phase 4).
3. **Node graphs** (Phase 8) compile to the same actions and effects, so nothing in the runtime depends on them.

A project made in the editor runs its scripts at once; one from a zip or a folder asks once first (D38), since a script runs with the editor's origin and the purity rules are a check, not a wall. The worker that runs them has no network or storage. Scripts from other people as mods (Phase 9) will run in a sandbox of their own origin.

## Missions

The existing games use four families of mission ([research/missions.md](research/missions.md)). One quest model covers them, in kits ([D45](decisions.md), [D47](decisions.md)).

| Family | Seen in | In the engine |
| --- | --- | --- |
| Choice events | space-wrecked events, dirtbag knocks, afterglass visitors, wasteland events | The events kit's `event` record (M3.7): choices with needs, costs and weighted outcomes |
| Multi-step quests | space-wrecked quests (`done` / `cold` steps, `payoff`), dirtbag goal ladders, afterglass chapters | The quests kit's `quest` record (M3.9): stages whose objectives check themselves, branches, failure |
| Timed or contract jobs | spliceworld operations, space-wrecked contracts | A timed job (M3.10): a duration and odds, its outcome sealed at launch |
| Counter objectives | wasteland bounties, achievements, live-ops style hunts | An objective that counts events (M3.9): an event, the argument values to match, and a target |

A quest ([specs/quests.md](specs/quests.md)) has the following parts:

- **Stages,** in a list, the first where it starts. Each has a log line added to the journal as it is reached, effects, objectives, the stage it goes to once they are done (Then), and ways to fail: on reaching it, on a condition, or after a number of days.
- **Objectives,** each a condition or a count of events, checked as each event is heard and done once. One can lead to a stage of its own, so a quest branches on what the player did.
- **Aliases** (M3.10): named slots filled when the quest starts. One can be a specific reference, a unique actor, or "find a matching reference" by conditions, which is how radiant quests repeat with new targets.

The journal is `start-quest`'s preview: what the sim holds, never a second copy. The editor shows each quest as forms with a map above them, as it shows talks. Validation finds stages nothing reaches, quests nothing starts and stages a quest can't end from. The bots' sweep reports each quest's state at its runs' end, so a quest no run finishes, or one left open, shows.

## Dialogue

- **Dialogue trees** for most talk (M3.8, D46, [specs/dialogue.md](specs/dialogue.md)): the dialogue kit's talks.
  - Data in dirtbag's `TalkDef` shape: starts chosen by condition, and lines with a speaker, text, effects and options. Each option is an event's choice, with the line it leads to.
  - Edited with forms and a map of the talk, the same by touch on a phone.
- **ink scenes** for long-form writing (M3.11, D46, D47), compiled into the same talks:
  - a subset of ink: knots, choices, conditions and `# fx:` tags, anything else an error with its line;
  - a scene reads game state only through whitelisted EXTERNALs, which are facts;
  - its `# fx:` tags become a line's or an option's effects;
  - the talk checks find what nothing reaches.
- Both are played by one module in the sim, so bots, saves and previews cover them, and both use the same dialogue screen.

## Encounters

Fights are the encounters kit's (M4.7, [D57](decisions.md), [specs/encounters.md](specs/encounters.md)); the games' own are surveyed in [research/encounters.md](research/encounters.md).

- **Records:** a `combat` names the stats a fight reads (health, the chance to hit, dodge, damage, armour); an `encounter` lists its foes, who fights for the player, and what a win, a draw and a loss do.
- **Worked out exactly:** a fight's chances are worked out round by round over every pair of hurts, made whole numbers out of 10,000, each result a whole percent, and rolled once. The `fight` effect's preview is that same table, so the odds on a choice's button are the odds rolled, not an estimate.
- **Inside events:** a fight is an effect an event's choice or a talk's option holds; a stance is a choice with modifiers, and a way out is another choice with its cost.
- **Who fights:** named actors, or the roster's members front first in the order they joined.
- **Later:** who targets whom within a fight waits for Phase 6's combat and Phase 7's boarding tactics.

## Worlds

| World model | Phase | For |
| --- | --- | --- |
| Node-graph maps | 4 | Sector, valley, coast and county maps. The maps kit (M4.6, D56, [specs/maps.md](specs/maps.md)): layered maps made from a seed by rules written as data (counts, weights and layer windows, such as "a camp within 2 of the boss"), checked over 300 seeds; maps drawn by hand with roads; travel as an action whose cost, time and effects show by the sim's own preview; and the map widget, up a phone and across anything wider. |
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

Screens are data: a widget tree with layout, a theme, bindings and actions. A small runtime renders them with Preact (`@eb/ui`, M4.1, D51). The game plays in a worker; after each step the page gets a JSON view, the game's modes, the actions on offer, the values of what its screens name and the kits' lists, and draws only that. The stack follows the game's modes ([specs/screens.md](specs/screens.md)).

- **Widgets:** panel, stack, grid, text, image, button, toggle, slider, select, progress bar, list (bound to a collection), tabs, modal, tooltip, toast, touch stick, touch button.
- **Layout:** flex and anchors, safe-area insets, and breakpoints at phone portrait, phone landscape, tablet and desktop.
- **Themes:** colour, type and spacing tokens, plus UI sounds. Every theme is checked for AA contrast in CI.
- **Bindings** read the game's facts by name, for example `economy.amount(resource: credits)`, and **buttons** take the actions the game offers or open screens: the sim decides, so a screen never runs an effect itself ([specs/screens.md](specs/screens.md)).
- **Navigation and input** (M4.2, D52, [specs/input.md](specs/input.md)):
  - A screen stack, its screens opened by buttons closed by Back: Escape, a pad's B, a swipe right, and on the player page the browser's own back.
  - Spatial focus for keyboard and gamepad by chooser-of-the-dead's rule (`spatial.ts`), on the top screen; each screen gives focus back to the control it last had.
  - A gesture recognizer from space-wrecked's `ui/gestures.js`, with a swipe added: swipes turn tabs and go Back. Long press is known. M4.6's drawn maps are dragged with pointer events of their own in the editor; pinch waits for a map too big to fit ([specs/maps.md](specs/maps.md#open-questions), question 3).
- **Feedback** (M4.2, D52): a game words its beats in `ui/feedback.json`; the worker fills the words in, and the page shows them as toasts, keeps them in a `log` widget and speaks each step's once through one live region.
- **The play shell** (M4.3, D53, [specs/shell.md](specs/shell.md)) is drawn by the engine in the game's theme, its words, slots and Daily set in `ui/shell.json`: a title with slots (Continue, New, Daily), save and load with files and codes, pause, settings, a crash screen in plain DOM and an update prompt on the title. The worker makes a save after every step and the page keeps it, so the worker never touches storage.
- **Stock screens** (M4.4, D54) ship as templates you restyle, written into `ui/` from the project: HUD, dialogue, event, shop, hall, inventory, journal, codex (records shown once known, with live numbers), credits (packed from the provenance log) and ending ([specs/stock-screens.md](specs/stock-screens.md)). M4.6 adds the map, shown for each mode that travels, which is the HUD of a game that starts on its map.
- **The UI designer** (M4.5, D55, [specs/designer.md](specs/designer.md)) edits a screen as it looks: an outline of its widgets, a form for the one selected, and a frame drawing it at a device's size and breakpoint. The frame reads a game of the designer's own, compiled without `ui/` and loaded to the Play panel's last save, by a `look` request that takes no step; samples fill what the moment lacks. Each change is a JSON edit with the editor's undo, so the file stays the format, and its JSON view stays.
- **Play-in-Editor** (M4.9, D59, [specs/play-in-editor.md](specs/play-in-editor.md)): under the game in the Play panel, debug tools that change it only by its own effects, as debug steps through the sim. The engine's `debug` module, allowed in every mode and offered in none, is built only into the games the editor opens and counts its steps, so a player's game refuses a debugged save. The Play worker records the run with each step's state hash: Step back plays it again from the start, Replay plays it on the edited project and names the first step and place where the two part (`replayRecording`, `placeOf`, from M1.2's facets). Time moves by the calendar's own `wait`; quests say why they haven't moved on; named states are saves of their own.

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
- **Export and import.** The save file is JSON, and a text code (`EB1.<game>.<payload>.<check>`) carries it deflated. The buttons are the save/load screen's (M4.3).
- **Storage.**
  - IndexedDB by default, then localStorage, then memory. A file adapter for Electron comes with Phase 8's desktop export.
  - A persistent-storage request on the first save.
  - Every write goes through one gate that reports failure to the player (rule-or-drool's `meta/storage.ts`).
- **Namespaces.** Keys are namespaced by game id and edition. All github.io projects share one origin, so two games, or a demo and a full build, must never collide.

## Audio and haptics

Built in M4.8 (D58); [specs/audio.md](specs/audio.md) is the design as built.

- Every existing game synthesizes its sound. The engine keeps that as the default:
  - sounds are records of one to three ZzFX voices, rendered by our port of ZzFX 1.4.0 the same in every browser and in Node; above a sound's form, Play, presets, Vary and Paste ZzFX;
  - ambience is synthesised from data (noise and drones as seamless 8-second loops, sounds now and then); music is stems from audio files in `assets/`, packed into the game file (format 8) so it plays offline;
  - buses: master, music, ambience, effects and interface, each set by the player's volumes in the shell's settings.
- What plays is a pure function of the screens on the stack and the view's conditions (`mixOf`): the topmost screen naming an ambience or a music wins, each layer and stem at its condition's level.
- Haptics and sounds read the same cues, `sound` and `buzz` on the feedback lines (landnam's `haptics.ts`), sent with each step, so feedback stays consistent and can be switched off per channel.
- Nothing is made until a press; a hidden page suspends; with Sound at 0 there is no audio context at all.

## Platform and export

M4.10's design is [specs/export.md](specs/export.md) (D60); this is its outline.

- **Targets.** A project's `export.json` names what each target ships: the web build, one HTML file, an itch.io zip, and an Android app. Without it, the first three ship the full game.
- **Editions** leave out records, types, scenes and assets, and are compiled from the project's files without them (`editionSource`). E055 names a kept record that still names something left out. An edition's id names its saves' storage.
- **Leak check.** Every file of an edition's build is read for the left-out content's ids and long texts, the runtime's own text taken out first. The full build is its control: each thing looked for must be found there, so the check can't pass by doing nothing.
- **The runtime** (`apps/editor/src/game`) is built once with the editor into one script and one stylesheet, its worker inside. Export writes its own page around them, beside it or inside it; the editor keeps the runtime offline, and `eb export` reads it from `dist-game/`. The same project gives the same bytes from either.
- **The web build.**
  - A service worker whose caches are named by its scope and the build's hash, and which deletes only its own (the origin is shared). It installs past the HTTP cache, keeps only whole same-origin answers, and never answers for `version.json` or `/.well-known/`.
  - Updates are offered only on the title, by prompt, never mid-session (project-ascent's update gate).
  - `version.json` names the build, and Publish's Pages workflow waits for the live site to serve it.
- **The single file** plays from `file://`; **the itch.io zip** has relative paths and no service worker.
- **Publish** writes a repository to push (a zip, or `eb publish` into a git working tree): the web build under `site/`, a Pages workflow uploading with `include-hidden-files`, and a README. The editor makes no network call.
- **Android (TWA)** is a workflow Publish writes, from dirtbag's pipeline: pinned Bubblewrap, targetSdk ≥ 36, signing from CI secrets, versionCode from the clock. It needs the web build on its own domain, for `assetlinks.json` at the origin's root.
- **Electron/Steam** later, from dirtbag's `desktop/`: an `app://` protocol, file-backed saves and an achievements adapter.
- **Icons** are drawn by the engine's own PNG code, from a project's PNG or the theme's colours, the same bytes in the browser and in Node.

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
  - Desktop: dockable panels (dockview, loaded only on desktop), with the layout saved in the browser. Today they are Project, Logic, Records (M2.5), Assets (M2.7), World, Play and Inspector, with Console and Problems (M2.8) along the bottom. The Outliner joins with M5.1.
  - Tablet: two zones, and the console as a strip along the bottom.
  - Phone: one panel at a time with a bottom tab bar (Project, Records, Assets, Logic, Problems, More: D35, D36, D37), More holding Console, World and Play, and the inspector as a bottom sheet.
  - Every layout: a command palette, from the top bar or Ctrl/⌘+K.
  - The breakpoints are written down once, in `apps/editor/src/app/layout.ts`. The shell sets `data-layout` from them, and the CSS keys off that attribute.
- **Editing.**
  - Undo and redo through a command log of file changes, autosave through a journal, and one editing tab per project, held by a Web Lock (M2.3, D30, [specs/editor-editing.md](specs/editor-editing.md)).
  - Forms from each record's type file in the inspector, with pickers for refs and assets, the compiler's problems beside each field, and New and Delete (M2.4, [specs/editor-forms.md](specs/editor-forms.md)).
  - Each type's records as a table, to sort, search and filter, and to change many at once, copy and delete; "used by" for every record; all from an index of every record kept up to date by file (M2.5, D32, [specs/editor-tables.md](specs/editor-tables.md)).
  - Types designed in the inspector: fields of every kind, nested ones included. Renaming a field, a choice, a type or a record rewrites every record and reference to match, as one step undo takes back (M2.6, D33, [specs/editor-types.md](specs/editor-types.md)).
  - Assets in their own panel, each with its provenance in `assets/assets.json`: imported with a licence from a fixed list, previewed, renamed or replaced with the records that name them, and stand-ins drawn until the art is ready. A file with no provenance stops the build (M2.7, D34, [specs/editor-assets.md](specs/editor-assets.md)).
  - A Problems panel listing what `eb validate` would say, from the same reading of the project's files, each problem a way to where it is fixed; a console that marks errors, with a toast for each on every layout; and `eb schemas`, so VS Code checks records edited by hand (M2.8, D35, [specs/editor-problems.md](specs/editor-problems.md)).
  - A Logic panel listing each trigger sheet with its rows as cards and each flag with what the lint says, and a sheet editor in the inspector: When from the engine's events, If as a condition, Do as a list of effects with forms for the engine's own and JSON for a game's (M3.1, D36, [specs/editor-logic.md](specs/editor-logic.md)).
  - Kits turned on in the Project panel, their types among the project's, their effects in a row's Do with forms drawn from their fields, and a kit's type in the designer with its fields locked and the project's own after them (M3.3, D41, [specs/editor-kits.md](specs/editor-kits.md)); since M3.5, the time kit's calendar as a form in the Project panel.
- **Storage** (M2.1, D10, [specs/editor-storage.md](specs/editor-storage.md)).
  - OPFS everywhere, written through one worker's sync access handles.
  - "Open folder" on desktop Chromium, so the editor and Claude Code edit the same git checkout.
  - Zip import and export, carrying only the project's own files, the same bytes every time.
  - GitHub sync (Phase 4) is the backup and the route from a phone to a repo.
- **Play-in-Editor.** The player runtime in an iframe, fed by the compiler in a worker. It has a state inspector, event log, time controls, quest debugger, save states and replay.

## Packages

```
packages/core       pure: rng, hash, records runtime, conditions/effects, reducers, events, clock, flags and trigger sheets (M3.1)
packages/kits       pure: the kits' modules, a folder each: inventory and economy (M3.3); stats and gear (M3.4); factions and time (M3.5); roster (M3.6); events (M3.7)
packages/schema     zod schemas for the project format and records; type files (M2.4); effect fields and the engine's types (M3.1); JSON Schema export
packages/compiler   project loader, validation, packs, export.json and editions (M4.10) (browser + Node)
packages/export     a game's exports from the runtime and its packs: targets, service worker, icons, leak check, workflows (M4.10)
packages/ui         runtime UI (M4.1 to M4.9): the screens', feedback's, shell's and audio's format, the session that plays a game in a worker, words its beats and cues, makes its saves and is looked at for the designer, the Preact renderer and its design frame, input (focus, gamepad, swipes, Back), the play shell, audio (the ZzFX port, renders, the mix, the player and buzzes), and the host the editor's debug tools reach into (M4.9)
packages/platform   save slots and storage (M1.8); SW/update gate, haptics, wake lock later
packages/stage3d    three.js + Rapier + recast (lazy-loaded)              Phase 5
packages/stage2d    sprites, tilemaps, custom-stage API                   Phase 7
apps/editor         the editor PWA; the player page at /play/ (M4.1) and an exported game's runtime (src/game, M4.10) are built with it
tools/cli           eb validate | build (M1.4), sim (M1.9), schemas (M2.8), export | publish (M4.10); test later
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
- **UI-only game export:** a budget set at M4.12 from the first measured template. M4.10's reading: the runtime is 87.8 kB of gzipped JS.
- **3D:** FPS targets per quality tier, set from the M1.10 spike on a real phone.

## Open questions

- Whether `kits` stays one package or splits by kit. Settled for now at M3.3: one package, a folder each, the kits reaching each other only through facts and effects and sharing only the loot draw and, since M3.6, the band rule (`bands.ts`), so a split later costs little.
- Whether the sim moves into a Web Worker for 3D games. The action/event boundary already allows it; decide from frame-time readings in Phase 6.
