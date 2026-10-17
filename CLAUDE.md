# CLAUDE.md: Engine-Builder

A browser game engine and editor. The plan is [ROADMAP.md](ROADMAP.md), the design is [docs/architecture.md](docs/architecture.md), and settled choices are in [docs/decisions.md](docs/decisions.md). Where this file and the docs disagree, the docs win; fix whichever is wrong.

## Sessions

- **Start at the CURRENT MILESTONE marker** in ROADMAP.md, and work only on that milestone. Ideas outside it go under that phase in ROADMAP.md, not into code.
- **One milestone per session.** Before changes that span several files, say what you plan to do.
- **Done means the milestone's gates pass**, not that its scope list is ticked. Update the marker, the Readings table and any decision you made, in the same change.
- **Decisions are Evan's** when they shape the product: build order, scope, tone, licences, domains, store listings. Put each one to Evan with a recommendation. Record the answer in docs/decisions.md with the date.

## Rules

- **The sim decides; the stage renders.**
  - Packages marked `"eb": { "pure": true }` are the simulation. They must give the same result in every browser, in Node and in a worker.
  - So they may not use the DOM, `Math.random`, `Date`, timers, `Intl`, transcendental `Math` (`sin`, `pow`, `exp`…) or `**`.
  - They may import only their own files and other pure packages.
  - `tools/lint-boundaries` enforces this; never weaken a rule to get past it.
- **Content is data.** Missions, events, dialogue and conditions are JSON validated by schemas, never closures. If adding content needs an engine edit, the engine is wrong: fix the engine.
- **Saves never break.**
  - Every change to a save's shape bumps `SAVE_VERSION`, adds a migration, and adds a fixture saved by the old version that must still load.
  - Storage keys are never renamed. A save that won't load is quarantined, never overwritten.
- **A check counts once it has been seen failing.** Break the thing it guards once, watch it go red, restore. A check that cannot fail looks exactly like one that passes.
- **Numbers are readings.** Record the instrument, date and N in ROADMAP.md's Readings. Measure before tuning, and say when a change is untested for feel.
- **Odds on screen are the odds rolled.** Anything a player sees about a chance, a cost or an outcome comes from the same `preview()` the sim uses.
- **Mobile first.**
  - Check at 360 and 390px wide in portrait, and in landscape.
  - Touch targets at least 44px, safe-area insets, no horizontal overflow, no hover-only actions.
- **Offline always.** No runtime network calls, analytics or CDNs in the editor or in exported games.
- **Assets carry their provenance.** Log the source, licence, prompt and hand edits. No NC, ND or SA licences.
- **Small files.** Aim for under ~300 lines and no function over ~60. Split by role (`sim`, `content`, `stage`, `ui`, `platform`) rather than by size.

## Commands

```sh
pnpm install
pnpm dev          # editor dev server
pnpm check        # typecheck → lint → unit tests → build → e2e (what CI runs)
pnpm typecheck    # every package, plus tests via tsconfig.tests.json
pnpm lint         # Biome + tools/lint-boundaries
pnpm test         # Vitest
pnpm build        # apps/editor/dist
pnpm e2e          # Playwright against `vite preview` at /Engine-Builder/
pnpm format       # Biome autofix
pnpm eb validate <project> --types <module>    # check a project folder or zip (paths from the repo root)
pnpm eb build <project> --types <module> --out <file>
```

- `@playwright/test` is pinned to 1.56.1 because that matches the Chromium preinstalled in Claude Code's cloud containers. CI installs its own copy.
- Tools run under Node's native TypeScript stripping (Node ≥ 22.18). Write erasable TS only (`erasableSyntaxOnly`): no enums, namespaces or parameter properties. Import local files with their `.ts` extension.

## Layout

```
apps/editor/           the editor PWA
  src/app/             shell: layout model (layout.ts), zones, panels, console
  src/pwa/             service worker registration and the update gate
  e2e/                 Playwright specs
packages/core/         pure kernel (eb.pure): rng, hashes, state fingerprints, record store, readPack
  src/sim/             the sim kernel: defineModule, createGame (reduce, check, preview), attempts, sessions
  src/logic/           conditions: check, text form, evaluate, describe, the lint (sat.ts), logicModule's roll
  src/time/            calendars, timers and wall-clock settling: timeModule
  test/                salvage.ts (the test-only text game); salvage-, sat- and time-bench.ts (timings);
                       kernel-modules.ts, logic-catalog.ts (the facts the condition tests use)
packages/schema/       record types (strict zod), condition(), rollEffect() and the time effects,
                       validation with E/W codes, JSON Schema export; not pure
  test/                samples.ts and events.ts: sample record types and facts the tests share
packages/compiler/     project sources (memory, directory handle, zip), compileProject, packs; not pure
  test/fixtures/v1/    the format-1 fixture project: must keep compiling to its golden hash
tools/cli/             eb validate | build; folderSource.ts is the Node fs source
tools/lint-boundaries/ purity lint: scan.ts (tokenizer), rules.ts, fixtures/{bad,good}
docs/                  architecture.md, decisions.md, research/, specs/ (exact algorithms + golden vectors for ports)
```

## Writing

- Plain words, short sentences, no hype. Name the actual thing ("the sector map generator"), not a category ("the system").
- Comments say why, not what. Credit a pattern's source repo when it is ported (e.g. "from project-ascent M302").
- Every doc ends with its open questions, if it has any.
