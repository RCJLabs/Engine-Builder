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
pnpm check        # typecheck → lint → unit tests → build → budgets → e2e (what CI runs)
pnpm typecheck    # every package, plus tests via tsconfig.tests.json
pnpm lint         # Biome + tools/lint-boundaries
pnpm test         # Vitest
pnpm build        # an exported game's runtime into apps/editor/dist-game, walk.js, nav.js and stage2d.js beside it (M5.8, M6.2,
                  # M7.1), then apps/editor/dist
                  # (the player page at play/ and the runtime at runtime/ with it), then the 3D spike into
                  # apps/editor/dist/spikes/3d, then pnpm build:games: Space-Wrecked's web export into
                  # apps/editor/dist/games/space-wrecked (M4.12), the trail's into apps/editor/dist/games/trail (M5.8)
                  # and Kaldvík's into apps/editor/dist/games/kaldvik (M6.10)
pnpm budgets      # after the build, each size against budgets.json (M5.7): the start, the 3D chunks, walk.js, nav.js,
                  # stage2d.js, the precache, the exports; and the runtime the service worker must keep (M5.8, M6.2, M7.1)
pnpm e2e          # Playwright against `vite preview` at / (the editor's own domain, D28)
pnpm format       # Biome autofix
pnpm eb validate <project> [--types <module>]  # check a project folder or zip (paths from the repo root)
pnpm eb build <project> [--types <module>] --out <file>
pnpm eb schemas <folder> [--types <module>]    # JSON Schemas for VS Code, in .vscode/eb-schemas/
pnpm eb sim <project> [--game <module>] [--policy <name>] [--seeds <n>] [--golden <file> [--update]]
pnpm eb export <project> --target web|file|itch|repo [--out <path>] [--edition <id>] [--runtime <folder>]
pnpm eb publish <project> --repo <git folder> [--message <text>] [--push]  # the repository, committed with your git
pnpm eb new <folder> --template <id> [--name <text>]  # a project from a template (M4.11), as New project makes it
pnpm import:space-wrecked [--from <data folder>]      # games/space-wrecked/records/ from the original's data (M4.12)
pnpm make:starter-kit                                  # starter-kit/ from tools/starter-kit's code (M5.5)
pnpm make:starter-character                            # starter-character/ from tools/starter-kit/src/character (M6.5)
pnpm make:starter-sprites                              # starter-sprites/ from tools/starter-kit/src/sprites (M7.1)
pnpm make:moor                                         # tools/cli/test/fixtures/moor/ from moor.ts (M5.10)
pnpm make:kaldvik                                      # games/kaldvik/spaces/shore.*.png from tools/make-kaldvik (M6.10)
pnpm bake <project> <space>                            # spaces/<space>.nav baked in Node, as Bake navigation bakes it (M6.2);
                                                       # give the project as an absolute path under pnpm -C
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
                       calendarFile.ts (project.json's calendar as a form, M3.5, and its clock, M6.3), loaded by CalendarSlot.tsx;
                       ProjectFighting.tsx and fightingFile.ts (project.json's fighting as a form, M6.4), loaded by FightingSlot.tsx
  src/app/dock/        desktop's dock (M2.2): dockview, loaded only on desktop, and its saved layout (savedLayout.ts)
  src/pwa/             service worker registration and the update gate
  src/projects/        project storage (M2.1): the OPFS library, its writer worker, opened folders, zips, the session;
                       opened.ts is the open project (M2.3); templates.ts, the templates New project offers, each
                       bundled from templates/ as a lazy chunk (templateFiles/, M4.11; a 3D one's GLBs and
                       navmeshes inlined as data URLs, M6.9)
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
                       (nameField), the table and its tools, UsedBy (In spaces, M5.2), actions.ts, RenameRecord (M2.6),
                       lookup.ts (a record and its value by key, for the screens' and the spaces' checks, M5.2)
  src/logic/           the Logic panel and the sheet editor (M3.1): rowText.ts (a row in words), sheetEdits.ts (the
                       changes, as plain functions), LogicPanel and its lazy LogicBrowser, the sheet editor's parts
                       (SheetRows, WhenField, EffectsField, choices.tsx, JsonField, WalkToFields since M6.2, with follow and stand since M6.3) in the record form; M3.2's
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
                       and QuestMap.tsx, above a quest's form; forms/refChoices.ts offers a quest's slots (M3.10);
                       targetChoices.ts, what an objective's target offers (actors and actor slots, the spaces, the
                       objects of the space it names, M6.6; a slot's In and a target's space and object slots, M6.7)
                       and targetChecks.test.ts (E086 and W155 in the editor); radiantChecks.test.ts (E088, W127 and
                       E086's slots in the editor, as eb validate gives them, and again when only tags change, M6.7)
  src/barter/          barterChecks.test.ts (M6.8, D80): E089 and W156 in the editor, as eb validate gives them, W156
                       gone when only the shop's actor changes (records/flagRelated.ts's merchantRelated)
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
  src/models/          models in the editor (M5.5, D67): modelImport.ts (a pick's models, the files a .gltf names,
                       their GLBs' paths, a model's first record) and modelEdits.ts (the import's file changes) as
                       plain functions; the model worker (model.worker.ts, protocol.ts, modelWorker.ts: packing with
                       @eb/models and Fit collider off the page, Draco from three's own copy); actions.ts (the import,
                       Add starter kit, Add starter character since M6.5); placedModels.ts (which placements draw as models, through prefabs and
                       overrides) and liveModels.ts (what they need, read and hashed for the space's live copy);
                       modelForm.ts, ModelHead and FitCollider above a model's form, MaterialStart above a
                       material's; kitEdits.ts and starterKit.ts (the kit, bundled as a lazy chunk); M6.5: the worker puts
                       a skinned model on the rig before packing it (modelImport.ts's rigOf: its record's rig and clips),
                       starterCharacter.ts and bundled.ts (the starter character as a lazy chunk, as the kit is);
                       fileProblems.ts and modelChecks.ts (E070 and W146 in the editor)
  src/play/            the Play panel (M4.1, D51): PlayPanel, and the lazy PlayView (the game played inside @eb/ui's
                       play shell, its saves under edition "playtest", M4.3) and ScreensList (New screen, its
                       template chosen in NewScreen.tsx (M4.4), New theme, New feedback, New shell); jobs.ts (a
                       project packed, or opened, in a copy of the script worker), protocol.ts, playClient.ts (its
                       client, with timeouts) and client.ts (the panel's one); moment.ts (its last save, which the
                       designer's frame draws, M4.5); debug/ (M4.9, D59): in the worker, host.ts (the run recorded
                       and the tools' requests), recording.ts, steps.ts, moves.ts (back, forward, replay), look.ts
                       and quests.ts (what the panel shows, each quest's why), protocol.ts; on the page, tools.ts
                       (signals and requests), words.ts, DebugTools and its sections (DebugSteps, DebugQuests,
                       RunEffect, DebugState, NamedStates)
  src/maps/            the World panel (M4.6, D56): worldList.ts (its rows, a new map's rules) and mapPreview.ts
                       (a seed's map, a drawn map, the check over seeds in words) as plain functions; WorldPanel
                       and its lazy WorldBrowser; MapPreview above a map's form, MapBoard (laid out as the map
                       widget is, a drawn map's places dragged); the Map stock template is screens/stock/play.ts's
  src/behaviours/      a behaviour in the editor (M6.3, D75): outline.ts (its rows and edits as plain functions: add,
                       move, wrap, unwrap, remove, a node made another kind), nodeWords.ts (a step in a few words),
                       nodeFields.ts (each kind's fields, and where each step's problems go); BehaviourOutline.tsx
                       (the outline and its bar, in a behaviour's form) and NodeForm.tsx (the chosen step's form);
                       aiChecks.test.ts (E080, W149, E081 and W148 in the editor, as eb validate gives them)
  src/anim/            animation (M6.5, D77): animator.ts (an animator run as plain functions: transitions read in order,
                       blends, rates by speed, pace or phase), mixer.ts (a body's clips laid on three's mixer three ways:
                       the legs, the upper body under the upper layer, the upper layer), character.ts (the starter
                       character copied on bones of its own for a figure, the stock animator) and characterLoad.ts (its
                       GLB decoded, a chunk of its own)
  src/animators/       an animator in the editor (M6.5, D77): outline.ts (its rows and edits as plain functions: add,
                       move, remove, rename), AnimatorOutline.tsx (a layer's outline and its bar) and AnimRowForm.tsx (the
                       chosen row's form, a clip from its model's clips); AnimatorPreview.tsx (the facts set by hand) and
                       the lazy AnimatorView.tsx (the starter character playing it, window.__ebAnimPreview) with
                       previewClips.ts (a project model's clips decoded)
  src/encounters/      the fight above an encounter's form (M4.7, D57): fightPreview.ts (the kit's own table from
                       the records at full health, against its fighters, the roster's start or one actor picked;
                       a result in words) and FightPreview.tsx; its styles, styles/encounters.css
  src/audio/           the previews above a sound's, an ambience's and a music's forms (M4.8, D58): soundEdits.ts
                       (Paste ZzFX, the presets, Vary, a half-made sound played, as plain functions), loopParts.ts
                       (the parts and the mix a loop's preview plays), SoundPreview.tsx and LoopPreview.tsx (through
                       the game's own player); Records lists sound, ambience and music after a project's own types
  src/spaces/          the Scene panel and the Outliner (M5.1, D63): state.ts (the file open, the objects chosen,
                       the toolbar's settings), load.ts and open.ts, and the panels' shells in the editor's start;
                       SceneBrowser (the list, SpaceList, or the file open), SceneToolbar, Outliner, ObjectForm (the
                       inspector's), live.ts (the open file and every prefab, read after each change) and actions.ts
                       (the edits as steps of undo), loaded with a project; plain functions with tests: vec.ts (turns
                       held to three's own), snap.ts, gizmoMath.ts, handles.ts (hits measured on screen, 44 px),
                       drag.ts, orbit.ts (the camera), spaceFile.ts (the writer, one object a line) and spaceEdits.ts;
                       and with three, loaded with the first file opened: SceneView, viewport.ts (WebGPURenderer,
                       picking, drawing on demand, window.__ebViewport), build.ts, gizmoView.ts, gestures.ts; M5.2
                       (D64): spaceChecks.ts (the checks that read records, after the index, and who uses each
                       record; project.json's fighting's names, E082, M6.4), partEdits.ts (components and overrides as plain functions), kindEdits.ts (a kind's
                       file and its components), recordRenames.ts (renames reaching spaces), partForm.ts (the record
                       form's fields over a part), PartFields, ComponentsSection, PlacedParts (Here, Inside and an
                       object inside), ObjectFields; M5.3 (D65): terrainView.ts (with three: the chunks at their
                       levels, strokes drawn as they land, the brush's ring, the hook's terrain readings); live.ts
                       reads a space's terrain files, build.ts draws water; M5.4 (D66): environmentView.ts (with
                       three: the lights and fog, the hook's environment(), read back from three), skyView.ts (three's
                       SkyMesh, a gradient sphere with the sun's disc, or a colour) and weatherView.ts (rain as
                       lines, snow as one mesh drawn many times); live.ts reads a space's environment record; M5.5
                       (D67): modelsView.ts (with three, a chunk of its own loaded with the first model: GLTFLoader and
                       its Draco, Meshopt and KTX2 decoders, a placement drawn as its model, the hook's summary),
                       modelParts.ts (materials, slots, LOD levels cut by the simplifier, the collider's wire) and
                       viewModels.ts (the view's side: the lazy load, a rebuild when a file is decoded, wires on the
                       chosen, window.__ebViewport.models()); live.ts reads what its models need; Add → Model…;
                       lastShown.ts (what the view was last shown, kept only once there is a view); M5.6 (D68):
                       foliageView.ts (with three: each foliage type scattered over the grid and drawn as instanced
                       meshes a chunk, at the model's level for its distance, scattered again where the terrain
                       changed, the hook's foliage() and plantsNear()), terrainView.ts reads the density file and
                       says what changed, live.ts reads the terrain's foliage records and their models;
                       viewportHook.ts (window.__ebViewport's shape, set and taken away); M5.7 (D69): the view
                       made at a quality tier (viewport.ts, SceneView.tsx: a new tier, a new view on a new canvas, the
                       camera kept), shadows.ts (the sun's shadows at a tier, fitted round what is drawn, with tests),
                       meshes.ts's lodsOf (models' levels picked for the view's camera alone), perfSummary.ts (the
                       tier read back from three: the hook's perf() and the overlay's); M5.10 (D72): bounds.ts
                       (latch: touching or flush within 12 px; dropBy), snapView.ts (each object's box as drawn, the
                       latch's wires); the toolbar's Grid step and Drop; M6.1 (D73): figureLook.ts (an NPC's look as
                       plain values: its figure, height and chest), figureView.ts (the figure in three; figuresIn, the
                       hook's figures()); M6.2 (D74): navOverlay.ts (Show navigation's lines, the hook's nav()); M6.6
                       (D78): fromAbove.ts (a space drawn from straight above for Bake map; leftOut, what it hides),
                       build.ts's OFF_MAP (marks, zones, spawn points and characters left off a map); M6.7 (D79):
                       tags.ts (a typed tag tidied, whether it can be added, the project's tags) and TagsField.tsx (a
                       space's, an object's and, as an override, an object's inside a placement)
  src/nav/             navmeshes in the editor (M6.2, D74): geometry.ts (the solids and the terrain as Recast's soup of
                       triangles), lib.ts (Recast and Detour: a soup baked, a navmesh opened, paths, closest points, the
                       crowd), entry.ts (nav.js's, built by vite.nav.config.ts beside walk.js); bake.worker.ts,
                       protocol.ts and bakeClient.ts (the bake off the page, running the nav.js in runtime/);
                       bakeProject.ts (a space baked from a project's files, for pnpm bake and the tests, with
                       scripts/bake.ts); navState.ts, navActions.ts (Bake navigation as a step of undo, the row's words)
                       and NavTools (the Scene toolbar's Navigation row); nav.test.ts, navChecks.test.ts (E076, E078,
                       E079 and W147 in the editor, as eb validate gives them)
  src/spaceMaps/       Bake map (M6.6, D78): shot.ts (the ground a map covers, the camera's height and the roofs left
                       out, as plain functions), mapActions.ts (the bake written as one step of undo; whether the map is
                       stale, as W154 says), mapState.ts, MapTools.tsx (the Scene toolbar's Map row)
  src/terrain/         a space's terrain in the editor (M5.3, D65): plain functions with tests: grid.ts (heights in
                       metres and paint weights, from and to the two files; heightAt on the triangles drawn),
                       brushes.ts (one dab of each brush; dabs by distance), stroke.ts (a stroke's dabs, Flatten's
                       target, put back), chunks.ts (chunks at four levels, edges laid on coarser neighbours', the
                       seam measured from a mesh's buffers), ray.ts (where a ray meets the ground) and terrainEdits.ts
                       (add, change, remove, a layer removed, a stroke written, as file changes); state.ts (the brush
                       chosen), actions.ts (the edits as steps of undo), TerrainTools (the toolbar's row), TerrainForm
                       (the inspector's); M5.6: Plant and Clear in brushes.ts, the foliage's density in grid.ts
  src/foliage/         a terrain's foliage in the editor (M5.6, D68): plain functions with tests: scatter.ts (where
                       each plant stands, by chunk, from the density and a cell's seed), drawing.ts (a chunk's level
                       for its distance, plants near a point) and foliageEdits.ts (a type added, taken out, filled,
                       made new from a preset, Start from, as file changes); actions.ts (the edits as steps of undo),
                       FoliageSection (the inspector's, under the terrain's form), FoliageTools (Plant and Clear's
                       type and Fill in the terrain's row), FoliageStart (Start from, above a foliage record's form)
  src/perf/            the 3D view's quality (M5.7, D69): plain functions with tests: tiers.ts (Low, Medium and High:
                       pixel ratio, antialiasing, shadows, the sky, foliage's reach and share, weather's share),
                       hints.ts (Auto's first tier from the GPU's name, memory, cores and pointer), frames.ts (frame
                       times' median and 95th percentile), stepDown.ts (Auto a tier down when frames drawn back to
                       back run long, past a 2 s warm-up); state.ts (Quality and Stats, kept per device, Auto's pick
                       and its step, the words for why), readHints.ts (the hints read in the browser), QualityTools
                       (the Scene toolbar's Quality and Stats), PerfOverlay (over the view's corner)
  src/walk/            a space walked in play (M5.8, D70), built into walk.js: plain functions with tests: solids.ts
                       (a space's solids, trigger zones and spawns through prefabs and overrides), zones.ts (zones
                       entered, sent once, answered), controls.ts (keys, pad, stick and drags as one intent), stick.ts
                       (the floating stick), cameras.ts (third person pulled in, first person), motion.ts (walk, run,
                       jump and fall, fixed steps, a jump carried to a frame with a step), physics.ts (Rapier's world,
                       the heightfield, the kinematic character) and world.ts (a space of the pack's world); with
                       three and the page: view.ts, inputs.ts (keys, mouse, pad), touch.ts (the stick and the jump
                       button), surface.ts (the canvas, its view at a tier), sender.ts (world/trigger sent), hook.ts
                       (window.__ebWalk), stage.ts (the loop), entry.ts (walk.js's), host.ts and hosts.ts (the Space
                       widget's host, walk.js loaded once), editorWalk.ts (the Play panel's and the player page's);
                       walk.test.ts walks the trail headless in Node through Rapier; M5.9 (D71): interact.ts (the use
                       the player faces: 2 m, 60°), stood.ts (when to say where the player stands), outbox.ts (one
                       step at a time, a dropped one tried again), acts.ts (Interact and world/at through the
                       outbox), prompt.ts (the prompt, a button beside Jump), all with tests in acts.test.ts; M5.10 (D72):
                       cells.ts (64 m cells, the near and kept rings, the far), footprints.ts (each top-level
                       object's reach and its placed models), streamer.ts (the rings as the player crosses cells),
                       streaming.ts (the rings to the walker, the zones, the uses and the view), nearObjects.ts (built
                       4 ms a frame), farModels.ts (the far, instanced at their coarsest level), fog.ts; streaming.test.ts
                       walks the moor headless, and the rest have their own tests; M6.1 (D73): facing.ts (an NPC turned
                       to face the player and back), npcView.ts (the NPCs built, turned, and the hook's npcs(), read
                       from three), npcs.test.ts (the figure, its capsule and its Talk at its chest); M6.2 (D74):
                       goals.ts (each object's place, through prefabs), crowdWalk.ts (Detour's crowd walking the NPCs
                       built, their arrivals), npcTell.ts (world/npcs-at through the outbox), tapPath.ts (a tap's
                       corners as a push), tapMarker.ts (its ring; a tap's ray, screenOf's projection), navStage.ts
                       (the walk's navigation: nav.js loaded, the hook's nav()); navWalk.test.ts, and square.test.ts,
                       the square walked headless through Recast with the sim hearing each arrival; M6.3 (D75):
                       gameClock.ts (time/elapse once a real second while the walk runs, 2 s at most), senses.ts
                       (sight by range, cone and Rapier's ray; the player's run, landing and Interact heard), walkSenses.ts
                       (ai/sensed once a second through the outbox, the hook's senses()), crowdWalk.ts's follow and
                       facing (crowdFollow.test.ts); village.test.ts, the village's day walked through Recast and the
                       guard's senses through Rapier; M6.4 (D76): swing.ts (a swing's wind-up, strike and recovery on fixed
                       steps), strike.ts (what a swing reaches), aim.ts (soft aim), arrows.ts (arrows under gravity) and
                       arrowView.ts, fight.ts (the player's and the NPCs' swings and arrows, hits sent, bodies to search, the
                       distance the crowd keeps, the hook's fight(); no swing started while a hit waits for the sim, M7.3); fight.test.ts, and camp.test.ts, the camp fought through
                       Rapier and Recast; M6.5 (D77): anims.ts (each body's animator and mixer, stepped every frame within
                       30 m, every other frame to 60 m and not beyond, by the motion's time; an NPC's speed from how far it
                       moved; the hook's anims()), anims.test.ts; M6.6 (D78): markers.ts (each marker's point, a door
                       standing in for another space, bearings and the compass strip), markerStage.ts and markerView.ts
                       (the compass and the markers over the view, the hook's markers()), mapPins.ts (the Map screen's
                       pins, run in walk.js), glenMarkers.test.ts (the glen's quests followed headless); M6.10 (D82):
                       knocked.ts (a down NPC's body out of Rapier's way, its rise asked for 10 s on), kaldvik.test.ts
                       (Kaldvík walked headless: the townsfolk's day, the howe fought, and again with the sim a second
                       behind, M7.3; Halvard down and up); M7.1 (D83):
                       host.ts and hosts.ts load stage2d.js beside walk.js and pick the stage by the space's view
  src/stage2d/         a 2D space in play (M7.1, D83), built into stage2d.js by vite.stage2d.config.ts: plain functions
                       with tests (stage2d.test.ts): scale.ts (the scale rule: the largest whole scale the fit allows),
                       camera.ts (kept within the size, at whole pixels), clips.ts (a clip's frame on the page's clock),
                       place.ts (where an item lands: its origin, flipped, a parallax layer at at + camera·(1 − f), tiled),
                       scene.ts (what a space draws, through prefabs, in draw order), start.ts (the fit, the size and the
                       camera's first centre), walkers.ts (straight lines to the sim's marks, arrivals told back;
                       walkersOf, the stage's start, since M7.2), uses.ts (a use's target, 44 px at least); with the
                       page: draw.ts (Canvas 2D at whole pixels, smoothing off,
                       which the Scene panel's 2D view draws with too), sheets.ts (the world's sheets decoded), view.ts (the
                       canvas shown pixelated), useButtons.ts (the uses as the page's own buttons), stage.ts (the loop, the
                       arrivals and the clock), hook.ts (window.__ebStage2d), entry.ts (stage2d.js's); keep.test.ts walks
                       the keep's guards through a night headless and rings its bell; M7.2 (D84): tilemap2d.ts (each cell's
                       frame by the 4-bit mask, the edges and posts, the tile under a point and a tile's centre; tested in
                       tilemap2d.test.ts), walkers.ts's routes over the tiles by core's route, draw.ts's tilemap culled to
                       the view; deck.test.ts walks the deck's crew through a shift headless, a tile at a time; M7.3
                       (D85): building2d.ts (a building's pieces, each room's sprite across it and the ladders up their
                       floors; a walker's way through it by core's route, from its own floor's foot; tested in
                       building2d.test.ts and drawBuilding.test.ts), walkers.ts's Ground (the tilemap or the building);
                       tower.test.ts walks the tower's folk through a night headless and rings its bell
  src/spaces2d/        the Scene panel's 2D view (M7.1, D83): view2d.ts (the zoom, screen to world and back, a pan, a zoom
                       about a point, Frame) and pick2d.ts (the pick by a frame's box, moves in whole pixels, the arrows)
                       as plain functions with tests (view2d.test.ts); state2d.ts (where Add puts things, the zoom asked),
                       actions2d.ts (Add and moves as steps of undo, arrow presses in a row one step), liveSprites.ts and
                       sheets2d.ts (the sprites and sheets read, decoded by hash), gestures2d.ts (a drag on the chosen
                       moves them, elsewhere pans; the wheel and a pinch zoom), hook2d.ts (window.__ebView2d),
                       SceneView2d.tsx and Toolbar2d.tsx, loaded with the first 2D space opened; M7.2 (D84):
                       tilemapEdits.ts (the cell and side under a point, painting, edges, Import ASCII, a new tilemap, as
                       plain functions with tests), painter2d.ts (a stroke's cells or sides, filled between points, an edge
                       stroke kept to its first side's line), tiles2d.ts (the Tiles row's tool, layer, tile, edge kind and
                       Show rules), tileActions.ts (Add tilemap, strokes and Import ASCII as steps of undo), TilesRow2d.tsx
                       (its tile buttons drawn from the sheets the view decoded, not the asset browser's reader, which
                       brings the record index into the Scene chunk), AddTilemap2d.tsx, rules2d.ts (Show rules); M7.3
                       (D85): buildingEdits.ts (the slot and place under a point, rooms placed over a stroke's slots
                       and those in the way replaced, erased, stairs set and taken out, floors added and taken off, as
                       plain functions with tests), roomPainter.ts (Place, Erase and Stairs strokes, tested), rooms2d.ts
                       (the Rooms row's tool and room), buildingActions.ts (Add building and the strokes as steps of
                       undo), strokes2d.ts (the stroke a press starts, tiles or rooms), RoomsRow2d.tsx, AddBuilding2d.tsx;
                       liveSprites.ts reads the room records
  src/sprites/         a sprite in the editor (M7.1, D83): SpritePreview.tsx (its sheet with the frame grid and each clip
                       playing, above its form), starterSprites.ts (starter-sprites/ bundled as a lazy chunk, for Add
                       starter sprites), spriteChecks.test.ts (E091 and E058's 2D rules in the editor, as eb validate
                       gives them, and no E079 for a 2D walker); M7.2: TilesetPreview.tsx (a tileset's sheet with its
                       tile grid, each tile and edge named, above its form), TileFrame.tsx, useSheet.ts
  src/environment/     a space's environment in the editor (M5.4, D66): plain functions with tests: look.ts (the sun
                       and the sky's light from the hour, every field left out filled in), presets.ts (the seven),
                       weather.ts (each drop's place from its seed, the moment and where the camera looks) and
                       environmentEdits.ts (a space given one, a new one from a preset, a field changed, as file
                       changes); actions.ts (the edits as steps of undo), EnvironmentField (the inspector's, with
                       nothing chosen in a space), EnvironmentStart (Start from, above an environment's form)
  src/designer/        the UI designer (M4.5, D55): a screen as an outline, a form and a device frame, the theme as
                       colours; tree.ts and treeEdits.ts (the outline's rows and its edits, as plain functions),
                       paths.ts, widgets.ts (each kind's fields, new widgets, key order), drawable.ts (a half-made
                       file drawn), samples.ts, frame.ts (devices, fit, pick), moment.ts (lookAt: the designer's own
                       game, compiled without ui/) and useDesign.ts, state.ts, formApi.ts (the record form's fields
                       over a screen file); ScreenDesigner, Frame, Outline, OutlineBar, WidgetForm, PartForms,
                       ActionField, ThemeDesigner
  src/screens/         screens in the editor (M4.1): open.ts (uiView: Design or JSON, M4.5), ScreenEditor (the
                       designer, or the JSON in CodeMirror, jsonLanguage.ts),
                       screenChecks.ts (ui/ checked against the game after the index), templates.ts; stock/ (M4.4,
                       D54): the stock screens as plain functions of the project (context.ts), parts.ts, modal.ts
                       (dialogue, event, shop, hall), pages.ts (inventory, journal, codex, credits), play.ts (HUD,
                       ending), index.ts (STOCK, allStock: every one the kits allow, the pages first)
  src/player/          the player page at /play/ (M4.1, play/index.html, a page of the editor's own build): Player.tsx
                       opens a game file and plays it inside the play shell (M4.3, saves under edition "play");
                       gameWorker.ts (a game's worker client, failing every request still waiting if it dies) and
                       playerWorker.ts (the page's own worker script, kept apart so the game runtime bundles none);
                       seed.ts; pwa.ts (the update the shell offers on its title); player.worker.ts runs its
                       scripts, locked down
  src/game/            an exported game's runtime (M4.10, D60), built by vite.game.config.ts into dist-game/ as
                       game.js and game.css, its worker inlined: boot.ts (#eb-game read, walk.js named, M5.8),
                       Game.tsx (the pack played in the shell, saves under its edition, spaces walked by walk.js),
                       pwa.ts (./sw.js and Reload to update); game/index.html only builds it, as Export writes its
                       own page; vite.walk.config.ts builds src/walk/ into dist-game/walk.js beside it (M5.8), and
                       vite.nav.config.ts src/nav/entry.ts into dist-game/nav.js (M6.2)
  src/export/          the Project panel's Export section (M4.10): exportForm.ts (export.json as a type file, its
                       edits), ExportSection.tsx (the form, a button a target, the report) and its lazy
                       ExportSlot; exporting.ts (packs from the Play worker, the runtime from runtime/,
                       @eb/export, the download); exportChecks.ts (export.json's problems over the index)
  src/problems/        the Problems panel (M2.8): collect.ts (the list: the catalog's problems, the index's and the
                       game's scripts', M3.2, the screens', M4.1, and export.json's, M4.10),
                       problemList.ts (where each opens, titles, words, the view), count.ts (the tab's count),
                       open.ts (openPlace), ProblemsPanel and its lazy ProblemBrowser
  src/guide/           Make it yours in the Project panel (M4.11, D61): guideSteps.ts (guide.json read, where each
                       step opens, guideMoved: a step following its record renamed), guideChecks.ts (its problems,
                       as eb validate's), GuideSection and its lazy GuideSlot
  src/types/           the type designer (M2.6): defPaths.ts (paths into a type file and the values they reach),
                       rewrites.ts (what a change does to a record; renameAtPointers, a record renamed wherever the
                       index finds it, M4.11), typeFileChanges.ts and fieldEdits.ts (what it
                       does to the type file), typeEdits.ts (steps over the working copy), typeActions.ts, the
                       designer's components (TypeDesigner, FieldList, FieldEditor, ValueOptions, AddField…);
                       KitFields.tsx (a kit's fields, locked, M3.3); KindDesigner.tsx (a component kind, M5.2)
  test/                memory-fs.ts (an in-memory File System API that can cut the power), fs-folder.ts (a disk
                       folder behind it), fake-locks.ts (Web Locks as the spec describes them), fighter.ts (a type
                       and a project that reach every place a value can sit), *-bench.ts (timings; assets-bench.ts
                       is the save journal with big files; loot-, stats-, factions-, roster-, events- and dialogue-bench.ts
                       the index with kits; scenes-bench.ts, with ink scenes; debug-bench.ts, the debug tools, M4.9;
                       terrain-bench.ts, dabs, the files, chunks and the ray at 257 and 513, M5.3; environment-bench.ts,
                       a look worked out and a frame of weather placed, M5.4); anim.bench.ts, a frame of the walk's
                       animation for the square's thirteen, run by bench.config.ts (M6.5)
  e2e/                 Playwright specs; checks.ts holds the checks every page gets (errors, overflow either way,
                       44 px targets, axe at every impact, no id twice); ludus.ts brings the ludus fixture into the
                       editor and opens its tables and records; kitHelpers.ts is what the kits' specs share;
                       hut.spec.ts is Phase 3's gate (D50), the hut built from an empty project, its parts in
                       hutGoods.ts, hutStory.ts, hutQuests.ts, hutLogic.ts and hutExport.ts; hutScreens.ts,
                       play.spec.ts and playPhone.spec.ts are M4.1's gate, the hut played through its screens;
                       inputHelpers.ts, input.spec.ts and inputPhone.spec.ts are M4.2's, the hut by keys, by a
                       faked gamepad and by touch with its swipes; playShellHelpers.ts, playShell.spec.ts and
                       playShellPhone.spec.ts are M4.3's, the hut's saves, Daily, crash, pause and settings;
                       stockHut.ts, stockScreens.spec.ts and stockScreensPhone.spec.ts are M4.4's, the hut made
                       again from stock screens and played to its end on them; designerHelpers.ts,
                       designerScreens.ts, designer.spec.ts and designerPhone.spec.ts are M4.5's, the hut's own
                       screen and journal made again in the designer alone, as the fixture's JSON; mapHelpers.ts,
                       maps.spec.ts and mapsPhone.spec.ts are M4.6's, the drift's sector and the valley made in
                       the World panel and the drift flown to its exit through its map widget; encounterHelpers.ts,
                       encounters.spec.ts and encountersPhone.spec.ts are M4.7's, the drift's fight and the pit's
                       thraex bout made with forms, and the drift's first hostile ship fought, its odds the table's;
                       hutAudio.ts is M4.8's step of hut.spec.ts (the hut's stem imported, its sounds pasted in as
                       ZzFX, its ambiences and music made with forms); audioHelpers.ts, audio.spec.ts and
                       audioPhone.spec.ts are M4.8's, the hut heard through window.__ebAudio, buzzes caught from a
                       stand-in navigator.vibrate, the volumes by touch, and the sound preview;
                       debugHelpers.ts, debug.spec.ts and debugPhone.spec.ts are M4.9's, the hut's debug tools on
                       desktop (the loads quest edited, Replay stopping at step 1) and by touch on phones;
                       exportHelpers.ts (the hut imported, downloads caught and unzipped, a static server of the
                       e2e's own), export.spec.ts and exportPhone.spec.ts are M4.10's, the hut exported to each
                       target and played: the file from file://, the web build served, offline and updated, the
                       itch.io zip, a taster's E055 and leak check, and Publish's repository; templateHelpers.ts,
                       templates.spec.ts and templatesPhone.spec.ts are M4.11's, a project from each template, its
                       guide followed, played to an ending and exported as one file, on desktop and by touch;
                       spaceWrecked.spec.ts is M4.12's, Space-Wrecked's web export played by touch sideways and
                       upright (a captain, a job from the board, a part fitted), and its size budget;
                       spaceHelpers.ts, spaces.spec.ts and spacesPhone.spec.ts are M5.1's, a space built in the
                       Scene panel by mouse and keys and by touch, through window.__ebViewport;
                       componentHelpers.ts, components.spec.ts and componentsPhone.spec.ts are M5.2's, a kind of
                       the project's own, components, a placed record and a prefab's overrides made with forms;
                       terrainHelpers.ts, terrain.spec.ts and terrainPhone.spec.ts are M5.3's, a terrain sculpted
                       with each brush, painted with each layer, watered, seen at two levels with no crack, and
                       kept, by mouse and keys and by touch, through window.__ebViewport;
                       environmentHelpers.ts, environments.spec.ts and environmentsPhone.spec.ts are M5.4's, an
                       environment from each preset, its hour, fog and weather, read through window.__ebViewport
                       and the canvas's own pixels, and kept, by mouse and keys and by touch; modelHelpers.ts,
                       models.spec.ts and modelsPhone.spec.ts are M5.5's, a Draco, a Meshopt and a KTX2-textured
                       model imported, a material on a slot, LOD and a collider made, placed and read back through
                       window.__ebViewport near and far, the starter kit added, and kept, by mouse and keys and by touch;
                       foliageHelpers.ts, foliage.spec.ts and foliagePhone.spec.ts are M5.6's, the kit's pines and
                       grass made foliage of a glade, planted, cleared, filled from a layer and seen past the grass's
                       reach through window.__ebViewport, and kept, by mouse and keys and by touch;
                       perfHelpers.ts, perf.spec.ts and perfPhone.spec.ts are M5.7's, the grove's glade at Auto and
                       each tier read back from three through window.__ebViewport.perf(), its plants a subset at each
                       lower tier, its counts within budgets.json's, Auto stepping down on a computer it reads as
                       fast, and the tier and Stats kept, by mouse and keys and by touch;
                       walkHelpers.ts, walk.spec.ts, walkPhone.spec.ts and walkExport.spec.ts are M5.8's, the trail
                       walked in the Play panel through window.__ebWalk: by keys and the mouse (the camera pulled in,
                       the boulder, the step jumped, the bank, the crate, the cairn's trigger sent once, the bothy in
                       first person) and by a stand-in pad, by touch at 360, 390 and sideways with the floating
                       stick, a look drag and the jump button, and exported as one file and as a web build, each
                       walked to the cairn offline; glenHelpers.ts, glen.spec.ts and glenPhone.spec.ts are M5.9's,
                       the glen walked by keys and the mouse, by a stand-in pad and by touch at 360, 390 and
                       sideways: the rope and the lamp taken by Interact, each door each way with its loading screen,
                       the gate's zone setting the quest's stage, and a save in the bothy loaded where it stood;
                       streamingHelpers.ts, streaming.spec.ts and streamingPhone.spec.ts are M5.10's, the moor
                       walked through window.__ebWalk.cells(): its rings built and taken down along the road, its far
                       models instanced, the cairn's zone heard once built and the chest taken, by keys and by touch;
                       snappingHelpers.ts, snapping.spec.ts and snappingPhone.spec.ts, a hut latched together from the
                       starter kit to the millimetre, the grid at 1 m and Drop, by mouse and by touch;
                       fordHelpers.ts, ford.spec.ts and fordPhone.spec.ts are M6.1's, the ford walked by keys, a pad and
                       touch, each NPC talked to and turned, the walk paused under a talk and the bags on the HUD kept by a
                       save; npcEditor.spec.ts, Ada made in the editor alone at 1280 and 390 wide and talked to in Play;
                       squareHelpers.ts, square.spec.ts and squarePhone.spec.ts are M6.2's, the square walked by keys
                       (Tam sent to the well, the twelve across without meeting, a save mid-walk) and crossed by a tap
                       at 360, 390 and sideways; navEditor.spec.ts, a stall moved, W147, Bake navigation, at 1280 and 390;
                       villageHelpers.ts, village.spec.ts and villagePhone.spec.ts are M6.3's, the village walked by keys
                       and by touch at 360, 390 and sideways, the clock running and Wait jumping it, the guard hearing,
                       seeing and halting the player; aiEditor.spec.ts, a watch made for the guard in the outline alone
                       at 1280 and 390 and played; campHelpers.ts, camp.spec.ts, campPhone.spec.ts and campEditor.spec.ts are
                       M6.4's, the camp fought by keys and the mouse, by a stand-in pad and by touch at 360, 390 and sideways,
                       the hero falling and Back to the camp, and a bandit armed with forms alone at 1280 and 390;
                       animHelpers.ts, anim.spec.ts and animPhone.spec.ts are M6.5's, the camp's every frame read through
                       window.__ebWalk.anims() by keys and by touch at 360, 390 and sideways: idle, walk and run at their
                       paces, the air, a swing's phases, a bandit down; animEditor.spec.ts, a foreign rig's walk imported,
                       an animator made in its outline and preview at 1280 and 390, and Ada playing it as her talk opens;
                       markerHelpers.ts, markers.spec.ts, markersPhone.spec.ts and markersEditor.spec.ts are M6.6's, the
                       glen's quests followed by the compass and the markers by keys and by touch at 360, 390 and
                       sideways, Track from the journal, the Map screen's pins and the setting; and the glen's map baked,
                       W154 after a move and a target set with forms at 1280 and 390; hollowsHelpers.ts, radiant.spec.ts,
                       radiantPhone.spec.ts and radiantEditor.spec.ts are M6.7's, the hollows' Supplies read from the board
                       by keys (the barrow's cache, then the mine's, then no third run) and by touch at 360, 390 and
                       sideways (the compass, the journal, the Map's pin), and the hollows tagged and Supplies made with
                       forms alone at 1280 and 390, then played; postHelpers.ts, barter.spec.ts, barterPhone.spec.ts and
                       barterEditor.spec.ts are M6.8's, the post's chest taken from and put into and Hild's lamp bought
                       and the candle sold, by keys and by touch at 360, 390 and sideways, and the chest's Holds, Hild's
                       Purse, the shop's Actor and the Container screen made with forms alone at 1280 and 390, then played;
                       templates3dHelpers.ts, templates3d.spec.ts and templates3dPhone.spec.ts are M6.9's, a project
                       from each 3D template, its guide followed to each place, walked to its ending by keys and by
                       touch at 360, 390 and sideways (Attack held through the hamlet's fights), and exported as one file;
                       kaldvikHelpers.ts, kaldvik.spec.ts and kaldvikPhone.spec.ts are M6.10's, Kaldvík's web export at
                       games/kaldvik/ played by keys from New game to the ending, and by touch at 390 and sideways (a
                       talk, a flatbread bought from Gudrun, the hall's door), talks aimed at the NPC where the crowd has them;
                       keepHelpers.ts, keep.spec.ts, keepPhone.spec.ts and keepExport.spec.ts are M7.1's, the keep played
                       through window.__ebStage2d: drawn at the scale rule's whole scale with only the palette's colours,
                       parallax at its factors, clips advancing, the guards arriving, the bell rung by a click, the keys and
                       a tap at 360, 390 and sideways, the camera dragged, and exported as one file and as a web build, each
                       played offline; keepEditorHelpers.ts and keepEditor.spec.ts, a 2D space built from the starter
                       sprites in the Scene panel alone at 1280 and 390 through window.__ebView2d, then played;
                       deckHelpers.ts, deck.spec.ts, deckPhone.spec.ts and deckExport.spec.ts are M7.2's, the boarding deck
                       played through window.__ebStage2d: its joins as the mask says, the crew routed four ways through
                       doors and never through a wall, the alarm by a click, the keys and a tap at 360, 390 and sideways,
                       and exported as one file played offline; deckEditor.spec.ts, a deck built from the starter tileset
                       in the Scene panel alone at 1280 and 390, Space-Wrecked's text imported, then played;
                       towerHelpers.ts, tower.spec.ts, towerPhone.spec.ts and towerExport.spec.ts are M7.3's, the tower
                       played through window.__ebStage2d: each room's sprite across its slots and the ladders up their
                       floors, the folk climbing only at the stairs, the bell by a click, the keys and a tap at 360, 390
                       and sideways, the camera dragged, and exported as one file played offline; towerEditor.spec.ts, a
                       tower raised from the starter rooms in the Scene panel alone at 1280 and 390, then played
apps/spike-3d/         M1.10's throwaway 3D spike, served at /spikes/3d/ (D27): three.js, Rapier, tiers, a reading
packages/core/         pure kernel (eb.pure): rng, hashes, state fingerprints, record store, readPack (pack formats 1 to 18)
  src/sim/             the sim kernel: defineModule, createGame (reduce, check, preview, migrate, content), attempts,
                       sessions, events and listeners (events.ts, M3.1); made.ts, records modules make in play, and
                       a module's start (M3.6); debug.ts, the editor's debug step and debugStepsOf (M4.9)
  src/save/            save files: createSaveFile, verifySaveFile, loadSave, SAVE_VERSION
  src/runner/          the headless runner: policies, playRun, sweep, stats (Wilson, t), golden files, and the
                       sweep's report as lines (report.ts: formatSweep, eb sim's and the editor's Run's);
                       replay.ts, a recording played on another build and where it parts (M4.9); stage.ts, a
                       walked game's stage for bots (stageOptions, joinStages: what a stage could send, each kept only
                       when the sim takes it, M6.9, D81)
  src/logic/           conditions: check, text form, evaluate, describe, the lint (sat.ts), logicModule's roll
  src/time/            calendars, timers and wall-clock settling: timeModule; starts.ts, the start-of events (M3.5);
                       clock.ts (project.json's clock as ms a tick, M6.3); time.hour and time.clock
  src/sheets/          the engine's flag and sheet modules (M3.1): flags.ts, sheets.ts; engine.ts beside it lists
                       the engine's own modules (logic, flag, sheet)
  src/world/           M5.8 (D70): packWorld.ts (format 9's world and its checks) and world.ts (the world module:
                       world/trigger checked and run, world/entered, world.fired), joined only to a game with spaces;
                       M5.9 (D71): the slice at version 2 (types.ts: the space, where the player stood, the spawn
                       arrived at, what was taken), actions.ts (world/use, world/at, enter-space), format 10's uses,
                       spawn points and start (packWorld.ts, worldDataOf for format 9), withPackWorld for headless runs;
                       M6.2 (D74): npcs.ts (walk-to, world/npcs-at, world/npc-arrived, world.npc-at), the slice at
                       version 3 with npcs, format 11's navmeshes and actors (asFormat10 when there are none);
                       M6.3 (D75): follow and stand (npcs.ts), the slice at version 4;
                       M6.4 (D76): attack and fall (npcs.ts), the slice at version 5, format 13's fighting (PackFighting);
                       M6.6 (D78): doors.ts (doorsOf, doorToward: the fewest doors between spaces), packMaps.ts (format
                       14's maps); M6.7 (D79): places.ts (format 15's places: every space's tags and each tagged
                       object's, worldPlacesOf, hasTags), doors.ts's doorsBetween and world.doors; M6.8 (D80):
                       containers.ts (format 16's holds: containersOf, holdsAny), a use that holds opening it (actions.ts);
                       M6.9 (D81): stage.ts, the world's stage for bots (the uses, then the zones, of the player's space);
                       M6.10 (D82): rise (npcs.ts), and a down NPC answers no use (actions.ts); M7.1 (D83): a 2D space in
                       format 17 (packWorld.ts's hasFlatSpace; flat.test.ts); M7.2 (D84): tiles/, a tilemap as the sim
                       reads it: grid.ts (format 18's cells and edges), mapText.ts (Space-Wrecked's map text read and
                       written), sight.ts, cover.ts and route.ts (Space-Wrecked's sight, cover and four-way routes, in
                       whole numbers), facts.ts (world.sees and world.cover), pack.ts (format 18's tiles checked); M7.3
                       (D85): rooms/, a building as the sim reads it: building.ts (format 19's building, a place's floor
                       and x, the room it is in), route.ts (afterglass's Dijkstra over the stairs' ends, in whole numbers),
                       facts.ts (world.room), pack.ts (format 19's buildings checked)
  test/                salvage.ts (the test-only text game, with flags and a trigger sheet since M3.1);
                       salvage-, sat-, time-, save-, sweep- and trigger-bench.ts; tileMaps.ts, Space-Wrecked's example
                       ship and a packed tilemap from rows and map text (M7.2); towers.ts, the tower the room tests
                       share (M7.3)
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
                       W134); M4.3: shellCheck.ts (ui/shell.json: E047, E048) and templateCheck.ts (what a
                       template reads, the screens' and the shell's slot line; a codex's @entry and unknown, M4.4);
                       M4.4: codexCheck.test.ts, recordFieldsOf (each type's fields, for a codex's items); M4.6:
                       mapTypes.ts (node-kind, map), mapEffects.ts (enter-map, reveal-map as fields), mapCheck.ts
                       (E035, E053, W119, W120, W135 over 300 seeds, W136); a map widget without the kit is E049;
                       M4.7: encounterTypes.ts (combat, encounter), encounterEffects.ts (fight, with its stance, as
                       fields), encounterCheck.ts (E035, E054, W137); a button's detail checked as its label;
                       M4.8: audioTypes.ts (sound, ambience, music: the engine's audio types, in ENGINE_DATA); a
                       screen's ambience and music, a theme's sounds and a feedback line's sound as E049; M4.12:
                       listCheck.ts (a list's checks: its source's kit, a codex's fields, an offered list's takes,
                       E049); M5.2: componentTypes.ts (the engine's component kinds as type files: five, and water
                       since M5.3); M5.4: environmentTypes.ts (environment, an engine
                       type, in ENGINE_DATA: E068); M5.5: materialTypes.ts (material, its presets) and
                       modelTypes.ts (model: its file, scale, slots, LOD and collider; E071, E072), engine types in
                       ENGINE_DATA; M5.6: foliageTypes.ts (foliage, its presets; E074), an engine type in
                       ENGINE_DATA; M5.9: the interact component kind, enter-space in effect.ts, worldCheck.ts (E076),
                       and what zones and uses hold heard by the kits' checks (flagCheck.ts's HeldElsewhere); M6.1:
                       npcFields.ts (an actor's model and figure, and its talk, faction and carries with their kits); M6.2:
                       walk-to in effect.ts, worldCheck.ts's checkWalkTo (E079); M6.3: follow and stand in effect.ts,
                       aiTypes.ts (behaviour, and an actor's behaviour, sight, cone and hearing), aiCheck.ts (E081 for
                       a node's units, hours, days and points, W148; W150, M6.4); M6.4: fightingTypes.ts (an item's
                       weapon, an actor's drops and on-fall, W151, checkFightingNames: E082); M6.5: animatorTypes.ts
                       (animator, the anim.* facts, E083 to E085, W153), modelTypes.ts's rig and clips; M6.6: questTypes.ts's target, targetCheck.ts (E086,
                       W155); M6.7: worldSlots.ts (slots that find in the world: E088, W127), targetCheck.ts's @slot
                       space and object, spaceShape's tags (E058); M6.8: the interact's holds (componentTypes.ts), an
                       actor's purse (npcFields.ts), a shop's actor (kitTypes.ts), W156 (kitCheck.ts); M6.10: an actor's
                       essential (fightingTypes.ts), E090; M7.1: spriteTypes.ts (sprite, an engine type: its sheet, frame,
                       origin and clips, E091's record rules), the sprite and parallax component kinds, an actor's sprite
                       and speed (npcFields.ts); M7.2: tilesetTypes.ts (tileset, an engine type: its sheet, tile, tiles
                       with their characters and rules, edge frames; legendOf; E092's record rules), the tilemap component
                       kind, a type file's lists of `lines` (a text box a line); M7.3: roomTypes.ts (room, an engine
                       type: a name and a sprite), the building component kind, E094 and W158; not pure
  test/                samples.ts and events.ts: sample record types and facts the tests share
packages/compiler/     project sources (memory, directory handle, zip), zips out (projectFiles, zipProject), compileProject, packs,
                       readTypes (types/ beside the code types), readProjectFiles (projectCheck.ts: what compileProject
                       reads before the records, shared with the editor's catalog, M2.8); M3.2: scripts.ts (scripts/
                       read and checked, never run) and projectGame.ts (game.ts run, for eb and the script worker,
                       compileWithGame); M3.5: project.json's calendar (manifest.ts: E038, W116) and
                       readKitSettings (the kits and calendar a game's kits are built from); M3.11: scenes.ts
                       (scenes/<id>.ink compiled into talks, E046, W131, atSceneLine) and sceneFiles.ts (where
                       scenes sit, apart so the editor names them without loading the ink compiler); M4.1: ui.ts
                       (ui/ read, checked with each problem at its line, packed; the feedback too, M4.2, and the
                       shell, M4.3), uiFiles.ts (where screens, the theme, the feedback and the shell sit) and jsonLines.ts (a JSON Pointer's line in a
                       file's text); M4.4: credits.ts (the assets' credits, from the provenance log, packed as format 7
                       with screens); M4.8: audioFiles.ts (the stems a music names, as base64, packed as format
                       8); M4.10: exportFile.ts (export.json's shape, editions and targets), exportCheck.ts (E055,
                       E056, W138, W139) and edition.ts (editionSource: the files an edition keeps); M4.11: guide.ts
                       (guide.json: E057, W140, opensInEditor, a space or a prefab since M6.9) and template.ts (fromTemplate, idFromName,
                       shortNameOf: a template's files under the author's name); M5.1: spaces.ts (spaces/ and
                       prefabs/ read and checked: E058 to E061, not packed yet) and spaceFiles.ts (where they sit,
                       W141); M5.2: spaceShape.ts (an object's shape), overrides.ts (what a placement's layers make
                       of an object inside it), components.ts (components/ read: W143), spaceParts.ts (E062 to
                       E066, W142, and the uses "used by" lists); M5.3: a space's terrain in spaceShape.ts (E058),
                       its PNGs in spaceFiles.ts and terrains.ts (headers only: E067, W144), water off a plane in
                       spaceLints.ts (W145, beside W142); M5.4: a space's environment in spaceShape.ts (E058 in a
                       prefab) and spaceParts.ts (E069, and a use for "used by"); M5.5: gltf.ts (a glTF's JSON read
                       for its counts, materials, extensions and files beside it, moved from the editor) and
                       models.ts (each model record's file: E070, W146); M5.6: a terrain's foliage in spaceShape.ts
                       (E058, FOLIAGE_MOST), its density PNG in spaceFiles.ts and terrains.ts (E067, W144) and
                       spaceParts.ts (E073, and a use for "used by"); M5.8: world.ts (format 9's world: the spaces,
                       the zones resolved through prefabs and overrides, the files and records they draw from),
                       flagUses.ts (the flags zones and screens use, for W108 to W110), placedModels.ts; M5.9: world.ts
                       (format 10's uses, spaceSpawns, the start), spaceParts.ts (E076 in zones and uses, and what
                       they hold for the kits' checks), projectCheck.ts (E075); M6.1:
                       npcPlaces.ts (E077: an actor in one place) and world.ts's Talk uses; M6.2: navInputs.ts (the
                       solids and terrain a bake reads, and their hash), navFiles.ts (a .nav's header: E078, W147),
                       npcPlaces.ts's walkersOf (E079's names), world.ts's navmeshes and actors; M6.3: project.json's
                       clock (manifest.ts, projectCheck.ts: E080, W149), packed as format 12, and E081 for a behaviour's
                       points and walking against its actor's space; M6.4: project.json's fighting (manifest.ts: E082),
                       packed as format 13 with the kit and a space; M6.5: world.ts packs an actor's animator and the
                       models its clips come from (worldAnimators.test.ts), models.ts's W152; M6.6: mapFiles.ts (spaces/<id>.map.json read:
                       E087, W154), mapInputs.ts (what a bake draws and its hash), world.ts packs the maps as format 14;
                       M6.7: places.ts (placesOf: the tags through prefabs and overrides, and `{slot}`'s names, packed
                       as format 15; spaceTagsOf, what the checks read), tags in spaceShape.ts and spaces.ts (E058);
                       M6.8: E089 (spaceParts.ts's checkHolds), KitSettings.holds (projectCheck.ts) and the checking
                       game's stand-in container (projectGame.ts's HOLDING_WORLD); M7.1: sprites.ts (each sprite's sheet
                       read to its PNG header: E091), space2d.ts (E058's 2D rules, a sprite component's clip: E091),
                       spaceView.ts (is2d, apart from the checks), npcPlaces.ts (a 2D walker needs no navmesh), world.ts
                       packs a 2D space's sprites and sheets as format 17; M7.2: tilemaps.ts (a space's tilemaps through
                       prefabs, E093, W157, cellRules, format 18's tiles), flatPlaces.ts (each object's place in art
                       pixels, through prefabs), tilesets.ts (each tileset's sheet read to its PNG header: E092), world.ts
                       packs a tileset and its sheet; M7.3: buildings.ts (a space's building through prefabs, E094, W158,
                       floorsReached, format 19's buildings), space2d.ts's E058 for a building in 3D, world.ts packs the
                       rooms, their sprites and the stairs' with their sheets; not pure
  test/fixtures/v1/    the format-1 fixture project: must keep compiling to its golden hash
  test/fixtures/ludus/ a project made only of data (types/, records, an asset and its provenance log): compiles
                       with no --types module
packages/kits/         the kits (eb.pure, M3.3, D41), each a module with its types: inventory/ (items, the bag, give
                       and take; bags.ts, an actor's bag, M6.1), loot/draw.ts (loot tables rolled), economy/ (resources, quote.ts's prices, shops);
                       M3.4 (D42): stats/ (values.ts: a value and its parts; pools.ts: damage, healing, bases;
                       statuses.ts: stacks and time; state.ts; module.ts, built knowing whether gear is on) and
                       gear/ (worn.ts, module.ts: equip and unequip); M3.5 (D43): factions/ (standing.ts: bounds,
                       bands, prices, drift; module.ts, band-of since M6.1) and time/ (the time module with project.json's calendar, and its clock since M6.3);
                       M3.6 (D44): roster/ (offers.ts: recruits rolled and made; members.ts: cap, join, leave, ranks;
                       bonds.ts; hall.ts: hiring; offerFacts.ts: a hall's offers as facts, M4.12; module.ts, built
                       knowing whether economy is on); bands.ts (the band
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
                       each quest's state for sweeps; module.ts; tracking.ts and targets.ts, the tracked quest and its
                       targets, slice v3, M6.6; finding.ts, what a slot finds in the world, slots.ts's Nearest and a
                       space slot trying again, the kit built with the pack's places, M6.7); M4.6 (D56): maps/ (layered.ts: maps made from
                       a seed by rules; roads.ts: reach and the quickest road; travel.ts: travelOf, one price for
                       the action, its options and the widget; arrive.ts; sweep.ts: rules over 300 seeds; view.ts:
                       enter-map's preview, the map as the party sees it; facts.ts; module.ts, built knowing
                       economy and the calendar); M4.7 (D57): encounters/ (lines.ts: the two lines, each fighter's
                       stats through the stats kit's facts; rounds.ts: every pair of hurts round by round, exactly,
                       the last 64 kept (M4.12); table.ts: the ends made whole out of 10,000, which the roll and the preview read; fight.ts;
                       module.ts, built knowing whether the roster is on, whose roster.place orders the party);
                       M6.3 (D75): ai/ (types.ts; nodes.ts: paths and kinds; choose.ts: the leaf that holds; run.ts: a
                       leaf started and gone on, in-orders and cooldowns; goals.ts: the world's goals; aware.ts:
                       awareness from ai/sensed; module.ts, built with the calendar); M6.4 (D76): fighting/ (types.ts;
                       weapons.ts: what an actor wields; hits.ts: a hit and its hurt; falls.ts: a fall, its drops and on-fall,
                       a body searched; module.ts, built with the project's fighting); kits.ts (KITS,
                       kitsOn: what project.json's kits
                       turn on), modules.ts (kitModules, apart from the list so reading it costs no sim code; kitsInWorld, M6.7);
                       M6.8 (D80): inventory/containers.ts (containers and bodies opened, taken from and put into, the
                       kit built with the pack's containers, slice v3), bags.ts's restock-bag; economy/purses.ts (slice
                       v2) and shop.ts's merchants (a shop's actor's bag and purse); M6.9 (D81): fighting/stage.ts (the
                       blows and searches a bot may send), stages.ts (walkedStage: walk, or walk+fight), and
                       quests/start.ts's canStart (quests.can-start); M6.10 (D82): fighting/falls.ts's knockDown and the
                       kit's rise (an essential actor down, not fallen, and up again; slice v2)
  test/                market.ts, barracks.ts, embassy.ts, muster.ts, caravan.ts, crag.ts, dock.ts and board.ts (the
                       dock with a crew for slots, M3.10), sector.ts (a sector and a valley, M4.6), brawl.ts (a crew,
                       a ship, raiders and a brute, M4.7), village.ts (a smith, a guard and a dog, M6.3),
                       camp.ts (a hero and three bandits, M6.4), post.ts (Hild's post, a chest and a barrel, M6.8): the records
                       and games the kit tests share;
                       fixtures/saves/dock-quests-v1.json, a save by the quests kit's version 1 that must keep loading,
                       and dock-quests-v2.json, by its version 2 (M6.6);
                       fixtures/saves/market-inventory-v1.json, a save by the inventory kit's version 1 (M6.1), and
                       market-inventory-v2.json, by its version 2 and the economy kit's version 1 (M6.8);
                       fixtures/saves/camp-fighting-v1.json, by the fighting kit's version 1 (M6.10)
packages/ink/          ink scenes (eb.pure, M3.11, D49): compileScene, chooser's subset into a talk and a map of
                       its lines: source.ts (comments out), text.ts and parse.ts (lines into items), expr.ts and
                       conditions.ts (ink conditions as the engine's, through EXTERNALs), tags.ts and fx.ts,
                       weave.ts (choices and gathers nested), lower.ts (lines to be), emit.ts (ids, the talk, the
                       map); inkjs.test.ts holds it to inkjs, a dev dependency, way by way
packages/ui/           a game's screens (M4.1, D51), not pure: format/ (screen.ts, the widgets and sources;
                       template.ts; bindings.ts, what screens name; theme.ts and its contrast; feedback.ts, M4.2;
                       audio.ts, the audio records, buzzes and ZzFX's arguments, M4.8);
                       session/ (play.ts: a game played and its view after each step, or resumed from a state, and
                       looked at for other wants, taking no step (M4.5); views.ts, the kits' views as lists;
                       mapView.ts, the map in words from enter-map's preview (M4.6); markers.ts, markersOf: the tracked
                       quest's open targets for the stage (M6.6);
                       words.ts (fightText: a fight choice's odds from its preview, M4.7); say.ts, a step's beats in the feedback's words (M4.2); saving.ts, the save made
                       after each step (M4.3); records.ts, a codex's entries and the credits, sound.ts (M4.4);
                       fromPack.ts and host.ts, a pack opened in a worker (with the debug step for the editor's, whose
                       saves the player page refuses, M4.9), its games started or loaded from a save's text; protocol.ts; audioPack.ts, the audio records as the page plays them, M4.8); audio/
                       (M4.8, D58: zzfx.ts, the ZzFX 1.4.0 port; render.ts, a sound and a layer's loop; mix.ts,
                       mixOf and the heaviest buzz, as plain functions; player.ts, Web Audio's buses, beds, stems
                       and buzzes; hook.ts, window.__ebAudio; useAudio.ts); render/ (GameScreens, Screen, Widget, Tabs, LogView, Feedback.tsx (toasts
                       and the announcer), screens.css; DesignFrame.tsx, one screen drawn inert at a device's size,
                       each widget in a box saying where it sits (M4.5); MapWidget.tsx and map.css (M4.6);
                       SpaceWidget.tsx and spaceHost.ts (M5.8: the box a page's host walks a space in, and the host's
                       contract; the player's space when it names none, M5.9; the markers and the map's pins, M6.6),
                       SpaceMapWidget.tsx and spaceMap.css (the Map screen's space from above, M6.6), placing.ts (where its stage starts);
                       stack.ts, fill.ts, layout.ts, mapLayout.ts and feedback.ts as plain functions; context.ts's
                       drawingUnder, a screen under another drawn paused, M6.1); input/ (M4.2, D52: spatial.ts, pad.ts and gestures.ts
                       as plain functions; focus.ts; the hooks useInput, useGamepad, useSwipes, useBackHistory);
                       shell/ (M4.3, D53: the play shell, engine-drawn; useShell.ts its state and saves, slots.ts and
                       settings.ts as plain functions, a component per screen (Title, NewGame, SavesScreen with
                       ImportSave and SetAside, Pause, SettingsScreen, Stopped), crash.ts in plain DOM, shell.css; stepLine.ts,
                       the stage's steps and the player's presses on one line to the worker, M6.3; Fallen.tsx, the fallen
                       player's screen and its checkpoint, M6.4); session/fighting.ts, the fight as the stage reads it (M6.4,
                       and the bodies emptied, M6.8); session/containers.ts, each container's name (M6.8),
                       and fighting.ts's down (M6.10)
packages/models/       3D models (M5.5, D67), not pure, in the browser and in Node: io.ts (gltf-transform's reader and
                       writer with every extension, Meshopt's coders, a Draco decoder the caller brings), pack.ts
                       (a .glb, or a .gltf with its files, written as one GLB: reorder.ts for the vertex cache,
                       quantize.ts, Meshopt), colliders.ts (box, sphere, capsule as arithmetic), hull.ts (three's
                       ConvexHull, at most 64 points), lod.ts (meshoptimizer's simplifier); M6.5 (D77): humanoid.ts
                       (VRM's bones), rigMap.ts (joints mapped by name and held to the hierarchy), normalise.ts (the rest a
                       T-pose on the world's axes, the binds and keys carried), inPlace.ts (the hips' drift out, the pace
                       kept), rig.ts (rigModel); test/shapes.ts (models made in code, Draco, Meshopt and a KTX2 sign),
                       test/rigs.ts (a foreign rig and the engine's, made in code), models-bench.ts
packages/export/       a game's exports (M4.10, D60), not pure: targets.ts (the web build, the single file, the
                       itch.io zip, the repository), html.ts (the page, its boot JSON escaped), sw.ts (the service
                       worker, written for each build), site.ts (manifest, version.json, assetlinks), png.ts and
                       icons.ts (PNG in and out, 16-bit greyscale for a terrain's heights since M5.3, icons scaled
                       or drawn), hash.ts (the build's hash), leaks.ts (the
                       leak check and its control), workflows.ts and readme.ts (Publish's), exportGame.ts (one
                       export, start to end, and the zip); walk.js beside the page, or inside a single one (M5.8), and
                       stage2d.js the same for a game with a 2D space (M7.1, stage2d.test.ts)
  test/                hut.ts (the hut with a map of the summit and a taster), export-bench.ts
packages/purity/       the purity rules (eb.pure): scan.ts (tokenizer), rules.ts; tools/lint-boundaries holds the
                       engine to them, the compiler a project's scripts (M3.2)
packages/script/       project scripts (M3.2, D38): files.ts (scripts/<id>.ts), check.ts (E028–E030, no running),
                       transpile.ts (sucrase), load.ts (the CommonJS loader), api.ts ("eb") and apiDocs.ts (the lists
                       completion offers), game.ts and project.ts (game.ts read, E031/E032), catalog.ts; not pure
packages/platform/     the browser's side of saves; not pure: stores (IndexedDB, localStorage, memory), openStore,
                       createSaves (slots, backups, quarantine; loadWith, a save read where the game runs, raw and
                       forget, M4.3; the arrival checkpoint kept beside each slot, M6.4), save codes, requestPersistence
  test/                runs.ts (salvage sessions and saves), fake-storage.ts, code-bench.ts
tools/cli/             eb validate | build | schemas | sim | export | publish; folderSource.ts is the Node fs source; modules.ts loads
                       --types and --game, a project's game.ts without them (M3.2); schemas.ts is eb schemas; sim.ts
                       and simReport.ts are eb sim; exportCmd.ts is eb export and eb publish (M4.10); newCmd.ts is
                       eb new (M4.11); test/templates.test.ts holds each template to no problems, its golden file
                       (fixtures/salvage-coast-skipper.golden.json, last-ferry-ferryman.golden.json; the 3D two's
                       valley-hamlet-wanderer.golden.json and lighthouse-keeper.golden.json through the stage, M6.9) and every stage
                       and ending reached; test/spaceWrecked.test.ts is M4.12's gate (its two warnings, 500 seeds to
                       fixtures/space-wrecked-captain.golden.json with every act 1–2 stage reached, and every
                       action on offer as the captain plays a button its screens draw); test/kaldvik.test.ts is
                       M6.10's (no problems, 50 seeds through the stage to fixtures/kaldvik-stranger.golden.json, every
                       stage of every quest reached, Halvard down with no talk and up)
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
                       its ui/ (M4.1), six screens and a theme, which hutScreens.test.ts plays through, its
                       feedback (M4.2) and its shell (M4.3), whose saves the same test loads back; its sounds,
                       ambiences and music (M4.8), whose stem hut-theme.ts renders, hutAudio.test.ts holds to
                       their hashes and audio-bench.ts times; drift/, a slice
                       of Space-Wrecked's sector run made with the maps kit, its stock screens, which
                       driftScreens.test.ts plays through, and drift-pilot.golden.json; valley/, a map drawn by
                       hand in Dirtbag's style, and valley-random.golden.json (M4.6); the drift's hostile ships
                       fought with the encounters kit, and pit/, a slice of Ludus whose bouts the roster fights,
                       and pit-lanista.golden.json; fights.test.ts, every fight of 300 seeds of each rolled
                       against the table it showed (M4.7); lodge/, a yard with every component kind and one of its
                       own, placed records and overrides two prefabs deep, which spaces.test.ts validates clean
                       and breaks once for each of M5.2's checks; fell/, a hill with its heights and paint PNGs,
                       a tarn and a lochan, which terrain.test.ts validates clean and breaks once for each of
                       M5.3's checks; dale/, the seven preset environments and a dusk of its own named by a farm, a
                       cave and a station, which environment.test.ts validates clean and breaks once for each of
                       M5.4's checks; workshop/, a starter kit crate, Draco hills, a KTX2 sign, a material on a
                       slot, LOD, three colliders and a type drawn as a model, placed in a yard, which
                       models.test.ts validates clean and breaks once for each of M5.5's checks; grove/, a glade
                       whose terrain grows the kit's pines and scrub from its density PNG, which foliage.test.ts
                       validates clean and breaks once for each of M5.6's checks, under a shower since M5.7 (a
                       physical sky and rain for the perf specs); trail/, M5.8's gate: a trailhead with a path, a
                       bank, a boulder, a step, a crate that moves, the kit's crate and a cairn whose zone sets the
                       flag its HUD shows, and a bothy in first person, which world.test.ts builds as format 9,
                       breaks once for each of M5.8's checks and exports, and apps/editor's walk.test.ts walks;
                       saves/trail-world-v1.json, a save by the world module's version 1 that must keep loading;
                       glen/, M5.9's gate: a glen with a rope, a bothy whose door is an interact and whose lamp is on
                       a table, a shed whose door is a zone, and a gate's zone that sets the supplies quest's stage,
                       which glen.test.ts plays through the session to a save and a load, and since M6.6 Find your feet,
                       the supplies' targets and a Map and a Journal screen, which glenMarkers.test.ts follows; moor/, M5.10's gate: a
                       kilometre of terrain with about 1,350 starter kit pieces over all 256 cells, a road, a cairn's
                       zone and a chest, written only by `pnpm make:moor` from moor.ts (makeMoor.ts) and held to it
                       byte for byte by moor.test.ts; ford/, M6.1's gate: a smith and a ferry-keeper drawn as figures, a
                       warden drawn as the kit's pillar and a drover with no talk, a horseshoe passed between their bags,
                       which ford.test.ts plays through the session and breaks once for E077; square/, M6.2's gate: a
                       market with three stalls, a well and a gate, a carter whose talk sends them to the well and twelve
                       villagers a sheet sends between marks, its navmesh baked by `pnpm bake`, which square.test.ts
                       plays through the session and breaks once each for W147, E078 and E079; village/, M6.3's gate: a
                       smith whose day is the forge, the cottage and the green, and a guard who walks the walls by night,
                       stands at the gate by day and halts a player seen close, its navmesh baked by `pnpm bake`, which
                       village.test.ts plays through the session over a whole day and breaks once each for E080, W149,
                       E081 and W148, and village-bench.ts times its days; saves/square-world-v3.json, a save by the
                       world module's version 3 that must keep loading;
                       saves/glen-world-v2.json, a save by the world module's version 2 that must keep loading; camp/,
                       M6.4's gate: a clearing where three bandits wander until alerted and fight a hero with a sword, a bow
                       and ten arrows, its navmesh baked by `pnpm bake`, which camp.test.ts fights through the session and
                       breaks once each for E082 and W150; hollows/, M6.7's gate: a green with a board and a post, the
                       barrow a door away and the mine two through the hall, each cave tagged with a cache (the mine's
                       through the cache prefab) and a bandit, Supplies and the bounty repeating on the nearest, which
                       hollows.test.ts plays through the session and breaks once each for E088, W127 and E086; post/,
                       M6.8's gate: a yard where Hild trades from her bag and purse, a chest of bread and a candle and an
                       empty barrel, which post.test.ts plays through the session and breaks once each for E089 and W156;
                       keep/, M7.1's gate: a keep at night from the starter sprites, 960 art pixels wide, its sky, stars,
                       moon and ridges in parallax, four torches, two guards walking the wall walk and a bell to ring,
                       which keep.test.ts validates clean, builds as format 17 and breaks once each for E091, E058's 2D
                       rules and a 2D walker's navmesh; deck/, M7.2's gate: Space-Wrecked's example ship as a boarding deck
                       from the starter tileset, stars in parallax, Ines and Oren on their rounds and an alarm that sends
                       both to the airlock, which deck.test.ts validates clean, builds as format 18 and breaks once each for
                       E092, E093, E058 and W157; tower/, M7.3's gate: the keep seen side on from the starter rooms,
                       four floors of two slots with a hall and the watch room across a floor each and ladders on
                       alternate sides, a warden and two of the watch on their rounds, a bell that brings them to the
                       hall and the HUD's line on the warden by world.room, which tower.test.ts validates clean, builds as
                       format 19 and breaks once each for E094, E058 and W158
templates/             the templates New project and eb new start from (M4.11, D61), listed by templates.json:
                       salvage-coast/ (the Expedition run: a harbour, a seeded coast, a debt) and last-ferry/ (Story
                       and choices: ink scenes, flags, three endings), each a project folder with its guide.json;
                       M6.9 (D81): valley-hamlet/ (the Open-world RPG in third person: the green, the smithy and the
                       cave, Osric's job against three bandits, Wenna's shop and her supplies job, scripts/wanderer.ts
                       its bot) and lighthouse/ (the First-person adventure: the rock and three rooms, the logbook in
                       ink, the keeper's chest, the store and the lamp), their starter kit pieces and navmeshes with them
games/space-wrecked/   Proof #1 (M4.12, D62): Space-Wrecked's acts 1–2 as a project folder, deployed at
                       /games/space-wrecked/; its text is all rights reserved, RCJLabs (NOTICE). source/, the
                       original's data files the import reads; records/, written only by the import; types/, the
                       project's own; scripts/: campaign.ts (backgrounds, acts, the hangar, Launch, the raid, Settle),
                       refit.ts (parts fitted to the hull, room aboard), crew.ts (wound, sell-part, after a fight,
                       the crew screen's facts), board.ts (act 1's job board as made records), run.ts and voyage.ts
                       (act 2: jumps, supplies, hunters, quest events, docking), shared.ts, captain.ts (the bot),
                       game.ts; ui/, its screens, theme, feedback and shell; export.json
games/kaldvik/         Proof #2 (M6.10, D82): Kaldvík, a steading on Landnam's coast, deployed at /games/kaldvik/; its
                       text is written fresh and all rights reserved, RCJLabs (NOTICE). spaces/: the shore (a 256 m
                       terrain from `pnpm make:kaldvik`), the hall, the smithy and the howe, each with its navmesh;
                       records/: five essential townsfolk and their days, seven outlaws, The Howe, Tove's Net and The
                       Watch, Gudrun's and Ulf's shops; scripts/: kaldvik.ts (Wait an hour, the ending), stranger.ts
                       (the bot), game.ts; ui/, the hamlet's screens made its own; export.json
tools/starter-kit/     the starter kit's generator (M5.5, D67): shapes.ts (boxes, cylinders, cones, a wedge, flat faces),
                       pieces.ts (the 21 pieces, the grass since M5.6, their parts by material and their colliders'
                       shapes), kit.ts (the
                       files: GLBs packed as import packs, records, the log), cli.ts; test/kit.test.ts holds
                       starter-kit/ to it byte for byte and to eb validate; src/character/ and test/character.test.ts
                       the same for starter-character/ (M6.5); src/sprites/ (palette.ts, raster.ts, sky.ts, keep.ts,
                       props.ts, figures.ts, sprites.ts, cli.ts; tiles.ts, the deck's tileset, M7.2; rooms.ts, the
                       keep's rooms and ladder, M7.3) and test/sprites.test.ts the same for starter-sprites/ (M7.1)
starter-kit/           the kit as a project folder, written only by `pnpm make:starter-kit`: 21 pieces dedicated
                       by RCJLabs to CC0, their model and material records and the log; Add starter kit copies it in
starter-character/     the starter character (M6.5, D77), written only by `pnpm make:starter-character` from
                       tools/starter-kit/src/character (skeleton, body, poses, clips, ground, the stock animator):
                       372 triangles on the rig, 16 clips, its model, materials and stock animator, dedicated by RCJLabs
                       to CC0; walk.js and the editor carry it, Add starter character copies it in
starter-sprites/       the starter sprites (M7.1, D83), written only by `pnpm make:starter-sprites`: sheets in a palette
                       of 16 for a keep at night (figures with idle and walk, a torch, a bell, a banner, the keep's parts,
                       the sky, stars, moon and ridges), their sprite records and the log, dedicated by RCJLabs to CC0;
                       since M7.2 the deck's tileset (floor, an airlock, a crate, a console, a locker, machinery and the
                       hull with their joins; walls, the hull, doors and hatches for edges); since M7.3 the keep's rooms
                       seen side on (a crypt, a store, a hall two slots wide, barracks, a chapel and a watch room, each a
                       sprite and a room record) and a ladder; Add starter sprites copies it in
tools/make-kaldvik/    the shore's generator (M6.10): shore.ts (heights, paint and foliage density by integer and
                       polynomial arithmetic, the pads level where the spaces stand things), cli.ts; test/shore.test.ts
                       holds games/kaldvik's files to it byte for byte
tools/import-space-wrecked/ the import (M4.12): src/ writes games/space-wrecked/records/ from source/, one file per
                       family (ship.ts: parts, the hull and shops; crew.ts; fights.ts; events.ts; quests.ts; board.ts;
                       run.ts), importAll.ts and records.ts (the files as written); test/import.test.ts holds the
                       output to the committed records, byte for byte
tools/lint-boundaries/ purity lint: the rules from packages/purity, which packages are pure, fixtures/{bad,good}
tools/site-check/      the deploy check CI's confirm job runs: the live page and every file it loads, by origin and type
tools/budgets/         pnpm budgets (M5.7, D69): measure.ts (a chunk's static imports, the start, the precache, gzip
                       -9 a file), budgets.ts (budgets.json read, the nine sizes measured and held to it, Kaldvík's
                       export since M6.10), cli.ts;
                       test/budgets.test.ts on a made-up build, and budgets.json to its readings' margins
budgets.json           each size and count budget with its reading, date and what it measures (M5.7)
docs/                  architecture.md, decisions.md, research/, specs/ (exact algorithms + golden vectors for ports)
```

## Writing

- Plain words, short sentences, no hype. Name the actual thing ("the sector map generator"), not a category ("the system").
- Comments say why, not what. Credit a pattern's source repo when it is ported (e.g. "from project-ascent M302").
- Every doc ends with its open questions, if it has any.
