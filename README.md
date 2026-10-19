# Engine-Builder

A browser-based game engine and editor. Build worlds, missions, scripts, menus and UI on a PC, tablet or phone, then ship the game as a PWA on GitHub Pages or as a Play Store app (TWA).

**Status: Phase 3, the game's logic.** The editor lives at [engine.rcjlabs.com](https://engine.rcjlabs.com/). It stores projects in the browser, imports and exports zips, and opens folders on desktop. Desktop docks its panels, a phone keeps the inspector in a sheet, and a command palette (Ctrl/⌘+K) works on both. Edits save by themselves, undo and redo, and stay whole through a crash, with one editing tab per project. A project's record types are data in its `types/` folder, and each record is edited in a form drawn from its type, with the compiler's problems beside each field. Each type's records also show as a table, to sort, search, filter and change many at once, and every record lists what refers to it. Record types are designed in the editor too, on a phone as well, and renaming a field, a type or a record carries every record and reference with it. Images, sounds, models and fonts come in through an Assets panel, each logged with its source and a licence that lets a game be sold, and stand-ins fill in until the art is ready. A Problems panel lists what `eb validate` would say, each problem opening where it is fixed, and a console says what the editor did and what went wrong. Phase 3 has begun: trigger sheets of When / If / Do rows, and the flags they set, are written in a Logic panel, on a phone as well, checked as `eb validate` checks them, and run by the engine. A game's own code is TypeScript in its `scripts/` folder, written in the editor with completion from the engine's API, checked as you type against the purity rules the engine keeps, and played twenty times by a bot with **Run**, which says what `eb sim` says; `eb validate` and `eb sim` run the same scripts with no flags. A project from a zip or a folder asks once before its scripts run. Kits are the parts many games share, turned on in the Project panel: inventory (items and loot tables), economy (resources, and shops whose prices the engine works out), stats (actors, their stats and the damage they take, and statuses that stack and run out), gear (slots, and items worn in them), factions (standing in bands that set prices and drift back) and time (a calendar in `project.json`, and rows that run as each day, week, month, season and year starts), each with its records, forms and effects. The engine's pure core is built, through the 3D spike:
- seeded RNG and state hashes;
- records, the project format and the compiler;
- the sim kernel, conditions and time, with events that trigger sheets react to;
- the inventory, economy, stats, gear, factions and time kits;
- saves;
- a headless runner, with `eb sim` for bot sweeps and golden runs;
- a throwaway 3D spike at [`engine.rcjlabs.com/spikes/3d/`](https://engine.rcjlabs.com/spikes/3d/), waiting on frame rates from a real phone.

[ROADMAP.md](ROADMAP.md) holds the plan, and its CURRENT MILESTONE marker says what is being built now.

## Why

Every RCJ Labs game rebuilds the same core:

- seeded RNG, which exists in about twenty copies;
- versioned saves with migrations;
- a pure state/action simulation;
- content as data with validators;
- synthesized audio;
- service-worker update prompts;
- headless balance bots.

Engine-Builder builds that core once. On top of it sits an editor where the content of a game is made: records, missions, dialogue, logic, worlds and screens. [docs/research/existing-games.md](docs/research/existing-games.md) has the survey behind this.

## What it is for

- **Records:** items, actors, factions, loot tables, events and your own data types, edited as forms. This works like the Creation Kit's forms, as git-friendly JSON.
- **Missions:**
  - choice events with weighted outcomes;
  - multi-step quests that branch;
  - timed contracts;
  - counter objectives;
  - Bethesda-style quest stages, objectives and aliases.
- **Logic:** "When / If / Do" trigger sheets with no code, and TypeScript scripts for everything else.
- **Worlds:** route maps first, then 3D terrain, interiors and NPCs, then 2D tiles and side-view rooms.
- **Menus and UI:** stock title, settings, save/load, pause, HUD, inventory, journal, map and dialogue screens, restyled with themes.
- **Export:** PWA, single-file HTML, itch.io and Play TWA, plus Electron/Steam later.

[docs/architecture.md](docs/architecture.md) explains how it fits together, and [docs/decisions.md](docs/decisions.md) records what is decided and why.

## Run it

Node 22.18+ and pnpm 10 are required. Corepack picks up the pinned pnpm.

```sh
pnpm install
pnpm dev        # editor at http://localhost:5173
pnpm check      # everything CI runs: typecheck, lint, unit tests, build, e2e
```

| Command | What it does |
| --- | --- |
| `pnpm typecheck` | TypeScript across every package, including the tests |
| `pnpm lint` | Biome, then the purity lint for `eb.pure` packages |
| `pnpm test` | Vitest unit tests |
| `pnpm build` | Builds the editor into `apps/editor/dist` |
| `pnpm e2e` | Playwright against the built editor at phone, landscape and desktop sizes, with axe checks |
| `pnpm format` | Biome autofix |
| `pnpm eb validate <project> [--types <module>]` | Checks a project folder or zip and prints its diagnostics and pack hash ([spec](docs/specs/project-format.md#the-cli)). A project whose types are all in its `types/` needs no module |
| `pnpm eb build <project> [--types <module>] --out <file>` | The same, then writes the content pack |
| `pnpm eb schemas <folder> [--types <module>]` | Writes each record type's JSON Schema into the folder's `.vscode/`, so VS Code checks and completes records edited by hand ([spec](docs/specs/editor-problems.md#eb-schemas)) |
| `pnpm --filter @eb/editor icons` | Re-renders the PWA icons from `apps/editor/public/icons/icon.svg` |

## Layout

```
apps/editor            the editor PWA (Preact + signals, Vite, vite-plugin-pwa)
packages/core          the pure simulation kernel (no DOM, clock or Math.random)
packages/schema        record types as strict zod schemas, type files, validation with coded diagnostics, JSON Schema export
packages/compiler      reads a project (memory, OPFS, folder or zip), checks it and builds content packs
tools/cli              eb validate, build, schemas and sim
tools/lint-boundaries  the purity lint for packages marked "eb": { "pure": true }
tools/site-check       the deploy check: the live page and every file it loads
docs/                  architecture, decisions, research
```

More packages arrive with the phases that need them. The full layout is in [docs/architecture.md](docs/architecture.md#packages).

## Deploy

CI checks every push and pull request. On `main` it deploys the verified `apps/editor/dist` to GitHub Pages, then waits until the live `version.json` names the commit. It needs one setting changed by hand: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
