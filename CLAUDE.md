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
pnpm build        # apps/editor/dist, then the 3D spike into apps/editor/dist/spikes/3d
pnpm e2e          # Playwright against `vite preview` at / (the editor's own domain, D28)
pnpm format       # Biome autofix
pnpm eb validate <project> [--types <module>]  # check a project folder or zip (paths from the repo root)
pnpm eb build <project> [--types <module>] --out <file>
pnpm eb schemas <folder> [--types <module>]    # JSON Schemas for VS Code, in .vscode/eb-schemas/
pnpm eb sim <project> [--game <module>] [--policy <name>] [--seeds <n>] [--golden <file> [--update]]
```

- Without `--types` or `--game`, a project's own `scripts/game.ts` is its game (M3.2, D38): `eb` runs it to check content and to play.

- `@playwright/test` is pinned to 1.56.1 because that matches the Chromium preinstalled in Claude Code's cloud containers. CI installs its own copy.
- Tools run under Node's native TypeScript stripping (Node ≥ 22.18). Write erasable TS only (`erasableSyntaxOnly`): no enums, namespaces or parameter properties. Import local files with their `.ts` extension.

## Layout

```
apps/editor/           the editor PWA
  src/app/             shell: layout model (layout.ts), zones, panels, console, the phone's inspector sheet and its
                       More tab (MorePanel.tsx, D37),
                       the command palette (commands.ts matches, appCommands.ts lists), panelControl.ts (Show),
                       the console's log (state.ts), ErrorToast.tsx and errors.ts (errors nothing caught, M2.8),
                       ids.ts (useUniqueId: ids unique across the dock's render roots, never Preact's useId)
  src/app/dock/        desktop's dock (M2.2): dockview, loaded only on desktop, and its saved layout (savedLayout.ts)
  src/pwa/             service worker registration and the update gate
  src/projects/        project storage (M2.1): the OPFS library, its writer worker, opened folders, zips, the session;
                       opened.ts is the open project (M2.3)
  src/editing/         editing safety (M2.3): the command log (history.ts), layout-keeping JSON edits, the working
                       copy, autosave, the journal, folder saves, the project lock and tab hand-over; current.ts is
                       the app's one Editing; draft.ts holds typed text until its edit lands
  src/forms/           record forms (M2.4): the catalog (types, records, assets), values.ts (paths, empty values,
                       key order), problems.ts (the compiler's diagnostics per field), one component per field kind
                       in fields/, the picker, refChoices.ts, RecordForm; recordEdits.ts (the file changes forms
                       and tables make); focusField.ts (opening a form at a field, M2.8)
  src/records/         the Records panel (M2.5): recordIndex.ts (every record read and checked, kept up to date by
                       file, used by; flag-related records checked together, flagRelated.ts, M3.1), table.ts,
                       cells.ts, filters.ts and view.ts (columns, cells, filters, sort as plain functions), names.ts
                       (nameField), the table and its tools, UsedBy, actions.ts, RenameRecord (M2.6)
  src/logic/           the Logic panel and the sheet editor (M3.1): rowText.ts (a row in words), sheetEdits.ts (the
                       changes, as plain functions), LogicPanel and its lazy LogicBrowser, the sheet editor's parts
                       (SheetRows, WhenField, EffectsField, choices.tsx, JsonField) in the record form; M3.2's
                       ScriptsSection (scripts, Start a game, trust) and RunGame (Run's 20 games)
  src/scripts/         scripts in the editor (M3.2, D38): the script worker (script.worker.ts, jobs.ts: check and
                       play, protocol.ts, lockDown.ts) and its client with timeouts (scriptWorker.ts); trust.ts;
                       gameState.ts (the open project's game); known.ts (what forms offer from it); templates.ts,
                       scriptEdits.ts, playFiles.ts; the lazy ScriptEditor with CodeMirror (codeEditor.ts,
                       completions.ts, typedAhead.ts); open.ts
  src/assets/          the asset browser (M2.7): assetLog.ts (the provenance log's JSON), assetPaths.ts (names and
                       free paths), assetEdits.ts (steps over the working copy), assetList.ts (rows and the
                       compiler's problems per asset), entries.ts, importPlan.ts and replacing.ts (what the forms
                       check), standIn.ts, modelSummary.ts, the panel (AssetsPanel, AssetBrowser, AssetTile) and the
                       inspector's view (AssetInspector, AssetHead, AssetPreview, ProvenanceFields)
  src/problems/        the Problems panel (M2.8): collect.ts (the list: the catalog's problems, the index's and the
                       game's scripts', M3.2),
                       problemList.ts (where each opens, titles, words, the view), count.ts (the tab's count),
                       open.ts (openPlace), ProblemsPanel and its lazy ProblemBrowser
  src/types/           the type designer (M2.6): defPaths.ts (paths into a type file and the values they reach),
                       rewrites.ts (what a change does to a record), typeFileChanges.ts and fieldEdits.ts (what it
                       does to the type file), typeEdits.ts (steps over the working copy), typeActions.ts, the
                       designer's components (TypeDesigner, FieldList, FieldEditor, ValueOptions, AddField…)
  test/                memory-fs.ts (an in-memory File System API that can cut the power), fs-folder.ts (a disk
                       folder behind it), fake-locks.ts (Web Locks as the spec describes them), fighter.ts (a type
                       and a project that reach every place a value can sit), *-bench.ts (timings; assets-bench.ts
                       is the save journal with big files)
  e2e/                 Playwright specs; checks.ts holds the checks every page gets (errors, overflow either way,
                       44 px targets, axe at every impact, no id twice); ludus.ts brings the ludus fixture into the
                       editor and opens its tables and records
apps/spike-3d/         M1.10's throwaway 3D spike, served at /spikes/3d/ (D27): three.js, Rapier, tiers, a reading
packages/core/         pure kernel (eb.pure): rng, hashes, state fingerprints, record store, readPack (pack formats 1 and 2)
  src/sim/             the sim kernel: defineModule, createGame (reduce, check, preview, migrate), attempts, sessions,
                       events and listeners (events.ts, M3.1)
  src/save/            save files: createSaveFile, verifySaveFile, loadSave, SAVE_VERSION
  src/runner/          the headless runner: policies, playRun, sweep, stats (Wilson, t), golden files, and the
                       sweep's report as lines (report.ts: formatSweep, eb sim's and the editor's Run's)
  src/logic/           conditions: check, text form, evaluate, describe, the lint (sat.ts), logicModule's roll
  src/time/            calendars, timers and wall-clock settling: timeModule
  src/sheets/          the engine's flag and sheet modules (M3.1): flags.ts, sheets.ts; engine.ts beside it lists
                       the engine's own modules (logic, flag, sheet)
  test/                salvage.ts (the test-only text game, with flags and a trigger sheet since M3.1);
                       salvage-, sat-, time-, save-, sweep- and trigger-bench.ts
                       (timings); kernel-modules.ts, logic-catalog.ts (the facts the condition tests use)
  test/fixtures/       salvage-run/: salvage run's content as a project folder, which eb sim plays;
                       saves/salvage-v1.json: a format-1 save that must keep loading to its golden hash
packages/schema/       record types (strict zod), condition(), asset(), validation with E/W codes, JSON Schema
                       export; type files: typeFile.ts (the format) and typeSchema.ts (the zod it becomes);
                       provenance.ts (the assets' log, its licences and checks, M2.7); packValue (text conditions to
                       trees); M3.1: effect.ts (effect(), the engine's effect schemas, rollEffect), engineTypes.ts
                       (flag and sheet), known.ts (the engine's catalogue, or a game's), checkValue.ts (a value and
                       the effects inside it), sheetCheck.ts and flagCheck.ts (the sheets' and flags' checks and
                       the lint); time.ts (the time effects); not pure
  test/                samples.ts and events.ts: sample record types and facts the tests share
packages/compiler/     project sources (memory, directory handle, zip), zips out (projectFiles, zipProject), compileProject, packs,
                       readTypes (types/ beside the code types), readProjectFiles (projectCheck.ts: what compileProject
                       reads before the records, shared with the editor's catalog, M2.8); M3.2: scripts.ts (scripts/
                       read and checked, never run) and projectGame.ts (game.ts run, for eb and the script worker,
                       compileWithGame); not pure
  test/fixtures/v1/    the format-1 fixture project: must keep compiling to its golden hash
  test/fixtures/ludus/ a project made only of data (types/, records, an asset and its provenance log): compiles
                       with no --types module
packages/purity/       the purity rules (eb.pure): scan.ts (tokenizer), rules.ts; tools/lint-boundaries holds the
                       engine to them, the compiler a project's scripts (M3.2)
packages/script/       project scripts (M3.2, D38): files.ts (scripts/<id>.ts), check.ts (E028–E030, no running),
                       transpile.ts (sucrase), load.ts (the CommonJS loader), api.ts ("eb") and apiDocs.ts (the lists
                       completion offers), game.ts and project.ts (game.ts read, E031/E032), catalog.ts; not pure
packages/platform/     the browser's side of saves; not pure: stores (IndexedDB, localStorage, memory), openStore,
                       createSaves (slots, backups, quarantine), save codes, requestPersistence
  test/                runs.ts (salvage sessions and saves), fake-storage.ts, code-bench.ts
tools/cli/             eb validate | build | schemas | sim; folderSource.ts is the Node fs source; modules.ts loads
                       --types and --game, a project's game.ts without them (M3.2); schemas.ts is eb schemas; sim.ts
                       and simReport.ts are eb sim
  test/fixtures/       salvage-game.ts (salvage run for eb sim), sloppy-game.ts, salvage-steady.golden.json; hold/,
                       a game written as scripts (M3.2)
tools/lint-boundaries/ purity lint: the rules from packages/purity, which packages are pure, fixtures/{bad,good}
tools/site-check/      the deploy check CI's confirm job runs: the live page and every file it loads, by origin and type
docs/                  architecture.md, decisions.md, research/, specs/ (exact algorithms + golden vectors for ports)
```

## Writing

- Plain words, short sentences, no hype. Name the actual thing ("the sector map generator"), not a category ("the system").
- Comments say why, not what. Credit a pattern's source repo when it is ported (e.g. "from project-ascent M302").
- Every doc ends with its open questions, if it has any.
