# Engine-Builder

A browser-based game engine and editor. Build worlds, missions, scripts, menus and UI on a PC, tablet or phone, then ship the game as a PWA on GitHub Pages or as a Play Store app (TWA).

**Status: Phase 0, foundations.** The editor is an installable shell with placeholder panels, and the engine work starts in Phase 1. [ROADMAP.md](ROADMAP.md) holds the plan, and its CURRENT MILESTONE marker says what is being built now.

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
| `pnpm --filter @eb/editor icons` | Re-renders the PWA icons from `apps/editor/public/icons/icon.svg` |

## Layout

```
apps/editor            the editor PWA (Preact + signals, Vite, vite-plugin-pwa)
packages/core          the pure simulation kernel (no DOM, clock or Math.random)
packages/schema        record types as strict zod schemas, validation with coded diagnostics, JSON Schema export
tools/lint-boundaries  the purity lint for packages marked "eb": { "pure": true }
docs/                  architecture, decisions, research
```

More packages arrive with the phases that need them. The full layout is in [docs/architecture.md](docs/architecture.md#packages).

## Deploy

CI checks every push and pull request. On `main` it deploys the verified `apps/editor/dist` to GitHub Pages, then waits until the live `version.json` names the commit. It needs one setting changed by hand: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
