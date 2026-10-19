# CLAUDE.md: Engine-Builder

A browser game engine and editor. The plan is [ROADMAP.md](ROADMAP.md), the design is [docs/architecture.md](docs/architecture.md), and settled choices are in [docs/decisions.md](docs/decisions.md). Where this file and the docs disagree, the docs win; fix whichever is wrong.

## Sessions

- **Start at the CURRENT MILESTONE marker** in ROADMAP.md, and work only on that milestone. Ideas outside it go under that phase in ROADMAP.md, not into code.
- **As many milestones in a session as it has time for** (D39), one at a time and in ROADMAP order: each is done before the next starts. Before changes that span several files, say what you plan to do.
- **Merge on green and go on** (D39). When a milestone's PR is green, merge it with a merge commit, confirm the deploy, and start the next. Stop at a milestone whose gate needs Evan's phone.
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
pnpm build        # apps/editor/dist (the player page at play/ with it), then the 3D spike into apps/editor/dist/spikes/3d
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
                       ids.ts (useUniqueId: ids unique across the dock's render roots, never Preact's useId),
                       ProjectKits.tsx (the Project panel's kit boxes, M3.3), ProjectCalendar.tsx and
                       calendarFile.ts (project.json's calendar as a form, M3.5), loaded by CalendarSlot.tsx
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
                       and tables make); focusField.ts (opening a form at a field, M2.8); pressing.ts (problems
                       shown as a field is left wait for the press to be over, at its click: M3.8, M3.9 on touch)
  src/records/         the Records panel (M2.5): recordIndex.ts (every record read and checked, kept up to date by
                       file, used by; records whose checks read each other checked together, flagRelated.ts:
                       flags (M3.1), loot tables and shops (M3.3), stats, actors and items (M3.4), factions
                       (M3.5), the roster and recruits (M3.6), events (M3.7), talks (M3.8), quests (M3.9)), table.ts,
                       cells.ts, filters.ts and view.ts (columns, cells, filters, sort as plain functions), names.ts
                       (nameField), the table and its tools, UsedBy, actions.ts, RenameRecord (M2.6)
  src/logic/           the Logic panel and the sheet editor (M3.1): rowText.ts (a row in words), sheetEdits.ts (the
                       changes, as plain functions), LogicPanel and its lazy LogicBrowser, the sheet editor's parts
                       (SheetRows, WhenField, EffectsField, choices.tsx, JsonField) in the record form; M3.2's
                       ScriptsSection (scripts, Start a game, trust) and RunGame (Run's 20 games); KitEffect.tsx
                       (a kit's effect, its form drawn from its fields, M3.3); ScenesSection (M3.11)
  src/dialogue/        the talk map (M3.8, D46): talkMap.ts (rows by steps from a start, where each line leads, as
                       a plain function of the talk's value; branches and lines that pass, M3.11) and TalkMap.tsx,
                       above a talk's form or beside a scene; its styles, styles/kitMap.css, the quest map's too
  src/scenes/          ink scenes in the editor (M3.11, D49): open.ts, templates.ts, inkLanguage.ts (ink's colours),
                       the lazy SceneEditor; the catalog lists scenes/ and the record index compiles each into its
                       talk with the game's facts
  src/quests/          the quest map (M3.9, D47): questMap.ts (rows by steps from the first stage, where each stage
                       leads and how it ends, over the kit's quests/graph.ts; a job's outcomes and gone lines, M3.10)
                       and QuestMap.tsx, above a quest's form; forms/refChoices.ts offers a quest's slots (M3.10)
  src/scripts/         scripts in the editor (M3.2, D38): the script worker (script.worker.ts, jobs.ts: check and
                       play, protocol.ts, lockDown.ts) and its client with timeouts (scriptWorker.ts); trust.ts;
                       gameState.ts (the open project's game); known.ts (what forms offer from it); templates.ts,
                       scriptEdits.ts (text files' steps, a scene's too), playFiles.ts; the lazy ScriptEditor with
                       CodeMirror (codeEditor.ts, completions.ts, typedAhead.ts; codeFile.tsx, the parts the scene
                       editor shares); open.ts
  src/assets/          the asset browser (M2.7): assetLog.ts (the provenance log's JSON), assetPaths.ts (names and
                       free paths), assetEdits.ts (steps over the working copy), assetList.ts (rows and the
                       compiler's problems per asset), entries.ts, importPlan.ts and replacing.ts (what the forms
                       check), standIn.ts, modelSummary.ts, the panel (AssetsPanel, AssetBrowser, AssetTile) and the
                       inspector's view (AssetInspector, AssetHead, AssetPreview, ProvenanceFields)
  src/play/            the Play panel (M4.1, D51): PlayPanel, and the lazy PlayView (the game drawn by @eb/ui's
                       GameScreens) and ScreensList (New screen, New theme); jobs.ts (a project packed, or started,
                       in a copy of the script worker), protocol.ts, playClient.ts (its client, with timeouts)
  src/screens/         screens in the editor (M4.1): open.ts, ScreenEditor (the JSON in CodeMirror, jsonLanguage.ts),
                       screenChecks.ts (ui/ checked against the game after the index), templates.ts
  src/player/          the player page at /play/ (M4.1, play/index.html, a page of the editor's own build): Player.tsx
                       opens a game file and plays it; player.worker.ts runs its scripts, locked down
  src/problems/        the Problems panel (M2.8): collect.ts (the list: the catalog's problems, the index's and the
                       game's scripts', M3.2, and the screens', M4.1),
                       problemList.ts (where each opens, titles, words, the view), count.ts (the tab's count),
                       open.ts (openPlace), ProblemsPanel and its lazy ProblemBrowser
  src/types/           the type designer (M2.6): defPaths.ts (paths into a type file and the values they reach),
                       rewrites.ts (what a change does to a record), typeFileChanges.ts and fieldEdits.ts (what it
                       does to the type file), typeEdits.ts (steps over the working copy), typeActions.ts, the
                       designer's components (TypeDesigner, FieldList, FieldEditor, ValueOptions, AddField…);
                       KitFields.tsx (a kit's fields, locked, M3.3)
  test/                memory-fs.ts (an in-memory File System API that can cut the power), fs-folder.ts (a disk
                       folder behind it), fake-locks.ts (Web Locks as the spec describes them), fighter.ts (a type
                       and a project that reach every place a value can sit), *-bench.ts (timings; assets-bench.ts
                       is the save journal with big files; loot-, stats-, factions-, roster-, events- and dialogue-bench.ts
                       the index with kits; scenes-bench.ts, with ink scenes)
  e2e/                 Playwright specs; checks.ts holds the checks every page gets (errors, overflow either way,
                       44 px targets, axe at every impact, no id twice); ludus.ts brings the ludus fixture into the
                       editor and opens its tables and records; kitHelpers.ts is what the kits' specs share;
                       hut.spec.ts is Phase 3's gate (D50), the hut built from an empty project, its parts in
                       hutGoods.ts, hutStory.ts, hutQuests.ts, hutLogic.ts and hutExport.ts; hutScreens.ts,
                       play.spec.ts and playPhone.spec.ts are M4.1's gate, the hut played through its screens;
                       inputHelpers.ts, input.spec.ts and inputPhone.spec.ts are M4.2's, the hut by keys, by a
                       faked gamepad and by touch with its swipes
apps/spike-3d/         M1.10's throwaway 3D spike, served at /spikes/3d/ (D27): three.js, Rapier, tiers, a reading
packages/core/         pure kernel (eb.pure): rng, hashes, state fingerprints, record store, readPack (pack formats 1 to 4)
  src/sim/             the sim kernel: defineModule, createGame (reduce, check, preview, migrate, content), attempts,
                       sessions, events and listeners (events.ts, M3.1); made.ts, records modules make in play, and
                       a module's start (M3.6)
  src/save/            save files: createSaveFile, verifySaveFile, loadSave, SAVE_VERSION
  src/runner/          the headless runner: policies, playRun, sweep, stats (Wilson, t), golden files, and the
                       sweep's report as lines (report.ts: formatSweep, eb sim's and the editor's Run's)
  src/logic/           conditions: check, text form, evaluate, describe, the lint (sat.ts), logicModule's roll
  src/time/            calendars, timers and wall-clock settling: timeModule; starts.ts, the start-of events (M3.5)
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
                       the lint); time.ts (the time effects); M3.3: kitTypes.ts (the kits' type files, a project's
                       fields joined to them), kitEffects.ts (the kits' effects as fields, their schemas made from
                       them), kitCheck.ts (loot loops, shops' stock: E035, E036, W113); M3.4: statTypes.ts (stat,
                       actor, status, slot, and gear's fields on items and actors), statCheck.ts (E035, W114),
                       kitFields.ts; M3.5: factionTypes.ts (faction, and a shop's faction), factionCheck.ts
                       (E035, E039, W115), timeEffects.ts (wait and cancel-timer in the calendar's units); M3.6:
                       rosterTypes.ts (recruit, hall, roster), rosterCheck.ts (E035, E040, W117), bandCheck.ts (bands
                       lowest first, a faction's and the roster's); M3.7: the type files' effects kind,
                       eventTypes.ts (event, deck), eventEffects.ts (open-event, draw-event, later, cancel-later as
                       fields), eventCheck.ts (E035, E041, W118 to W120); M3.8: dialogueTypes.ts (speaker, talk),
                       dialogueEffects.ts (open-talk as fields), dialogueCheck.ts (E035, E042, W119, W121 to
                       W123); M3.9: questTypes.ts (quest), questEffects.ts (start-quest, set-stage, fail-quest as
                       fields), questCheck.ts (E035, E043, W120, W124 to W126, and counts' E022 and E023 through
                       sheetCheck.ts's checkWhen); M3.10: questSlots.ts (slots and jobs: E035, E044, E045, W127,
                       W128, and slotScope, the slots each field of a quest can name as @slot); M3.11: talkPaths.ts
                       (lines that pass in a loop: E035; the walk of every path: W129; lines that can't end:
                       W130); M4.1: uiSchema.ts (screens and the theme as strict zod) and uiCheck.ts (E047 to E050,
                       W132, W133); M4.2: feedbackCheck.ts (ui/feedback.json: E051, E052) and uiLints.ts (W133,
                       W134); not pure
  test/                samples.ts and events.ts: sample record types and facts the tests share
packages/compiler/     project sources (memory, directory handle, zip), zips out (projectFiles, zipProject), compileProject, packs,
                       readTypes (types/ beside the code types), readProjectFiles (projectCheck.ts: what compileProject
                       reads before the records, shared with the editor's catalog, M2.8); M3.2: scripts.ts (scripts/
                       read and checked, never run) and projectGame.ts (game.ts run, for eb and the script worker,
                       compileWithGame); M3.5: project.json's calendar (manifest.ts: E038, W116) and
                       readKitSettings (the kits and calendar a game's kits are built from); M3.11: scenes.ts
                       (scenes/<id>.ink compiled into talks, E046, W131, atSceneLine) and sceneFiles.ts (where
                       scenes sit, apart so the editor names them without loading the ink compiler); M4.1: ui.ts
                       (ui/ read, checked with each problem at its line, packed; the feedback too, M4.2), uiFiles.ts
                       (where screens, the theme and the feedback sit) and jsonLines.ts (a JSON Pointer's line in a
                       file's text); not pure
  test/fixtures/v1/    the format-1 fixture project: must keep compiling to its golden hash
  test/fixtures/ludus/ a project made only of data (types/, records, an asset and its provenance log): compiles
                       with no --types module
packages/kits/         the kits (eb.pure, M3.3, D41), each a module with its types: inventory/ (items, the bag, give
                       and take), loot/draw.ts (loot tables rolled), economy/ (resources, quote.ts's prices, shops);
                       M3.4 (D42): stats/ (values.ts: a value and its parts; pools.ts: damage, healing, bases;
                       statuses.ts: stacks and time; state.ts; module.ts, built knowing whether gear is on) and
                       gear/ (worn.ts, module.ts: equip and unequip); M3.5 (D43): factions/ (standing.ts: bounds,
                       bands, prices, drift; module.ts) and time/ (the time module with project.json's calendar);
                       M3.6 (D44): roster/ (offers.ts: recruits rolled and made; members.ts: cap, join, leave, ranks;
                       bonds.ts; hall.ts: hiring; module.ts, built knowing whether economy is on); bands.ts (the band
                       rule factions and the roster share); own.ts (a slice's map read by id); M3.7 (D45): events/
                       (choices.ts: the verdict, the view and the options in one; choose.ts; open.ts: opening and
                       waiting; decks.ts: draws; laters.ts: consequences; module.ts, built knowing whether economy
                       is on); M3.8 (D46): dialogue/ (records.ts; view.ts: the line shown, its options from the
                       events kit's verdict; open.ts: opening, waiting, ending; say.ts: saying and going on;
                       graph.ts: where lines lead; module.ts, built knowing whether economy is on; lines that
                       pass and branch, M3.11); M3.9 (D47):
                       quests/ (records.ts; run.ts: checking, moving and ending quests; start.ts: starting them,
                       and repeats (M3.10); slots.ts: slots filled, bound and gone (M3.10, D48); jobs.ts: jobs
                       rolled and kept as timers (M3.10); journal.ts: what a quest shows, start-quest's preview;
                       facts.ts; graph.ts: where stages lead, for the checks and the map; metrics.ts: kitMetrics,
                       each quest's state for sweeps; module.ts); kits.ts (KITS,
                       kitsOn: what project.json's kits
                       turn on), modules.ts (kitModules, apart from the list so reading it costs no sim code)
  test/                market.ts, barracks.ts, embassy.ts, muster.ts, caravan.ts, crag.ts, dock.ts and board.ts (the
                       dock with a crew for slots, M3.10): the records and games the kit tests share;
                       fixtures/saves/dock-quests-v1.json, a save by the quests kit's version 1 that must keep loading
packages/ink/          ink scenes (eb.pure, M3.11, D49): compileScene, chooser's subset into a talk and a map of
                       its lines: source.ts (comments out), text.ts and parse.ts (lines into items), expr.ts and
                       conditions.ts (ink conditions as the engine's, through EXTERNALs), tags.ts and fx.ts,
                       weave.ts (choices and gathers nested), lower.ts (lines to be), emit.ts (ids, the talk, the
                       map); inkjs.test.ts holds it to inkjs, a dev dependency, way by way
packages/ui/           a game's screens (M4.1, D51), not pure: format/ (screen.ts, the widgets and sources;
                       template.ts; bindings.ts, what screens name; theme.ts and its contrast; feedback.ts, M4.2);
                       session/ (play.ts: a game played and its view after each step; views.ts, the kits' views as
                       lists; words.ts; say.ts, a step's beats in the feedback's words (M4.2); fromPack.ts and
                       host.ts, a pack played in a worker; protocol.ts); render/ (GameScreens, Screen, Widget, Tabs,
                       LogView, Feedback.tsx (toasts and the announcer), screens.css; stack.ts, fill.ts, layout.ts
                       and feedback.ts as plain functions); input/ (M4.2, D52: spatial.ts, pad.ts and gestures.ts
                       as plain functions; focus.ts; the hooks useInput, useGamepad, useSwipes, useBackHistory)
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
                       a game written as scripts (M3.2); hangar/, a slice of Space-Wrecked's act 1 made with the
                       kits, and hangar-worker.golden.json; stall/ and stall-game.ts, a --game module the kits
                       join (M3.3); hangar-bench.ts; arena/, a slice of Ludus made with all four kits, and
                       arena-lanista.golden.json (M3.4); steading/, a slice of Landnam made with the factions and
                       time kits, and steading-jarl.golden.json; almanac/ and almanac-game.ts, a --game module the
                       time kit joins with project.json's calendar (M3.5); crew/, a slice of Space-Wrecked made with
                       the roster kit, and crew-captain.golden.json (M3.6); convoy/, a slice of Wasteland Protocol
                       made with the events kit, and convoy-scout.golden.json (M3.7); crag/, a slice of Dirtbag
                       made with the dialogue kit, and crag-climber.golden.json (M3.8); yard/, a slice of
                       Space-Wrecked's first act made with the quests kit, and yard-scavenger.golden.json (M3.9);
                       school/, a slice of Ludus made with slots, repeats and jobs, and school-lanista.golden.json
                       (M3.10); gatehouse/, a slice of Chooser of the Slain whose dusk scenes are ink, written
                       fresh, and gatehouse-chooser.golden.json (M3.11); hut/, Phase 3's gate, an original
                       adventure at an alpine hut that hut.spec.ts builds in the editor, and hut-keeper.golden.json;
                       its ui/ (M4.1), six screens and a theme, which hutScreens.test.ts plays through, and its
                       feedback (M4.2)
tools/lint-boundaries/ purity lint: the rules from packages/purity, which packages are pure, fixtures/{bad,good}
tools/site-check/      the deploy check CI's confirm job runs: the live page and every file it loads, by origin and type
docs/                  architecture.md, decisions.md, research/, specs/ (exact algorithms + golden vectors for ports)
```

## Writing

- Plain words, short sentences, no hype. Name the actual thing ("the sector map generator"), not a category ("the system").
- Comments say why, not what. Credit a pattern's source repo when it is ported (e.g. "from project-ascent M302").
- Every doc ends with its open questions, if it has any.
