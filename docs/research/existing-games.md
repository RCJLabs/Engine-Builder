# The existing games: what the engine must cover

This is a survey of the RCJ Labs game repos, done on 2026-10-17 from shallow, read-only clones (one commit each, so no history). Only public repositories are described here; two private repos were also read and are left out of this public doc.

The evidence feeds [../architecture.md](../architecture.md) and [../decisions.md](../decisions.md). Paths below are relative to each repo's root.

## The games

| Repo | What it is | Stack | Rendering |
| --- | --- | --- | --- |
| 2060td | Tower defense plus base builder. Raids are planned, then a deterministic sim plays them back as a replay. | TS, Vite, no runtime deps | Its own Canvas2D stage (replaced Phaser at v1.49, which was ¾ of the download) |
| afterglass | Side-view castle builder and defense. The dead return as shades at night. | Vanilla ES modules | Canvas2D pixel art, DOM HUD |
| chooser-of-the-dead | A Valkyrie judges souls in a deduction game in the vein of Papers, Please. Has campaign, daily and endless modes. | TS 7 pnpm monorepo, Preact + signals, inkjs, zod | DOM + SVG |
| climbing-world-traveler | Climbing career sim. Every attempt is simulated hold by hold. | TS, Preact + signals, idb, zod | Canvas2D wall playback |
| dirtbag | Climbing life sim: van, shifts, people, a 5-act story, minigames on each climb | TS, React 19 (panels), Vite | Canvas2D "Mix" renderer, drawn in code |
| dirtbag-ue | Unreal experiment: plain C++17 sim plus brainstorm and roadmap | C++ | — |
| football-manager-simulator | All-time football GM ("Gridiron Eras"), simulated play by play | Vanilla JS, no build | DOM + SVG charts |
| landnam | Viking survival strategy: coast travel, shield-wall fights, a steading through winter | Vanilla TS, Vite single-file | Inline SVG, no asset files |
| ludus | Gladiator school management, Capua 70 BC | React 18 in one file, esbuild single-file build | SVG + CSS animation |
| post-apocalypse-rpg-v2 | Wasteland Protocol's ancestor | One HTML file | PNG art |
| project-ascent | Climbing training app, with one minigame ("The Ascent"); not a game itself | React 19, zustand, Tailwind, idb | DOM, plus Canvas2D for the minigame |
| rule-or-drool | Political card swiper in the style of Reigns | React 19, TS, Vite | Procedural SVG/CSS |
| sandbagged | Climbing card battler | React 19, TS, Vite | DOM |
| space-wrecked | Build a ship, flee a pursuer, settle a world. Boarding fights are XCOM-style, inside your own layout. | Vanilla ES modules | Its own 3D renderer on Canvas2D, plus SVG |
| spliceworld | Mad-geneticist ranch with creature battles | Vanilla ES modules | Procedural SVG from a genome |
| wasteland-protocol | Squad roguelike: Darkest Dungeon-style ranks on a Slay the Spire-style map | Vanilla JS, one 16k-line file | DOM + WebP art |
| who-am-i- | Local-first personality profiler (a game is planned on top) | Svelte 5, TS, zod, YAML | DOM/SVG |

## The shared core

Every game rebuilds most of these parts.

- **Seeded RNG.**
  - mulberry32 plus FNV-1a appears in about 14 repos, plus a C++ port in dirtbag-ue.
  - chooser-of-the-dead uses sfc32 seeded by splitmix32, with `fork(label)` streams.
- **A pure sim.**
  - It sits behind `act` / `step` / `reduce`, which return state plus events.
  - Purity is enforced by tsconfigs without DOM (dirtbag, who-am-i-), purity tests, and chooser-of-the-dead's boundary lint.
  - Renderers drain an event stream: landnam's "beats", spliceworld's battle steps, 2060td's command buffer.
- **Content as data**, checked by validators:
  - who-am-i- has coded diagnostics E001–E017 and W101–W112;
  - rule-or-drool has graph rules (flags set and never read, unreachable arcs);
  - chooser-of-the-dead's compiler walks every ink path.
  - wasteland-protocol is the exception: its content is closures.
- **Saves.**
  - `SAVE_VERSION` with migrations: landnam v67, spliceworld 67 migrations, dirtbag v76, space-wrecked v29.
  - Slots; unreadable saves quarantined, not overwritten; file or text export.
- **Audio and haptics.** All sound is synthesized; no repo ships an audio file. Haptics often read the same cue list as the sound.
- **PWA.** Updates offered by prompt (the dominant rule), a build stamp, `version.json`, and offline-first with no analytics or CDNs.
- **Testing discipline.**
  - Headless bots and Monte Carlo balance harnesses; golden files and state hashes; property tests.
  - Mutation testing: spliceworld plants 647 defects, sandbagged catches 454 of 462.
  - Accessibility: axe, contrast checkers, 44–48px targets, reduced motion, text scale, colour-blind palettes, live regions, spatial focus navigation.
- **Layout.**
  - Mobile first at 360–390px.
  - A bottom sheet on phones becomes a right drawer at 900–1080px.
  - Tap to preview, tap again to confirm.

## Mission families and their data

Four families recur. The engine's quest model (architecture.md, "Missions") covers all four.

1. **Choice events.**
   - space-wrecked's `data/events.json` is the cleanest. It has 29 events across 8 kinds:
     ```json
     { "id": "dead-hauler", "kind": "derelict", "title": "Dead hauler", "text": "…",
       "choices": [
         { "id": "strip", "label": "Strip it", "outcomes": [
           { "chance": 70, "text": "…", "effects": { "drop": "salvage", "credits": 10 } },
           { "chance": 30, "text": "…", "effects": { "drop": "salvage", "wound": { "hp": 3 } } } ] },
         { "id": "leave", "label": "Leave it", "outcomes": [{ "chance": 100, "text": "…", "effects": {} }] } ] }
     ```
   - The `needs` keys are `berth`, `credits`, `parts` and `supplies`.
   - The effect keys are `credits`, `drop`, `heat`, `joins`, `materials`, `sell`, `standing`, `supplies` and `wound`.
   - Others in this family: dirtbag's knocks on the van and roadside stops, afterglass's visitors, and wasteland-protocol's events (closures).
2. **Multi-step quests.**
   - space-wrecked's `data/quests.json` has 11 quests. Each step is typed by `act` plus one of `job`, `event` or `place`.
   - A step lists `done` and `cold` choice ids, which advance the quest or end it. It also has `next` and `said` text and `effects`, and the quest ends in a `payoff`.
   - Others in this family: dirtbag's goal ladders (`Goal { aim, done }`, typed aims such as `{ grade: 4 }`), afterglass's chapters (goal plus a closing choice that branches), and wasteland-protocol's follow-ups gated on standing.
3. **Timed or contract jobs.**
   - spliceworld's `operations.json`: duration, cooldown, demands, odds formula, outcome sealed at launch.
   - space-wrecked's `contracts.json`: missions `clear`, `grab` and `hack`; random twists; client and site lists; encounter; credit ranges; drops; a `{site}` / `{client}` pitch template.
4. **Counter objectives.**
   - wasteland-protocol's bounties, achievements everywhere, and spliceworld's condition-driven guides (`reachable` / `done`).
   - Also delayed consequences: wasteland-protocol's `CONSEQUENCE_POOL` lands a set number of nodes later.

## World models

- **Node graphs.**
  - wasteland-protocol: a 10-tier sector map, generated and validated, e.g. "a camp within 2 nodes of the boss".
  - space-wrecked: seeded column graphs (`sectors.json`, weighted node kinds).
  - spliceworld: county nodes with income and notoriety.
  - dirtbag: a valley of pins and roads.
  - landnam: a 26-stop coast derived from the seed.
- **Tile grids.**
  - space-wrecked's job sites are ASCII glyph maps, and `tiles.json` gives each tile walk, cover and sight.
  - Its colony is a 20 × 12 grid built by the ship-builder rules.
- **Side-view rooms.** afterglass's floors × room slots, and dirtbag's side-view scenes.
- **3D.**
  - Only space-wrecked, using its own renderer.
  - Otherwise it has been pushed to Unreal: dirtbag-ue's plan is "2D minigames, 3D staging", and landnam's ROADMAP plans an Unreal port. In both, the TS sim is the spec.

## Combat styles

- Ranked squad, turn-based: wasteland-protocol; landnam's shield wall.
- Three-creature battles: spliceworld, with a battle engine that has no DOM and emits a replayable event stream.
- XCOM-style grid with cover, overwatch and bleed-out: space-wrecked boardings.
- Real-time tower defense on a fixed tick: 2060td.
- Card battler (sandbagged) and card swiper (rule-or-drool).
- Minigames whose outcome the sim decides: dirtbag's climbs, project-ascent's Ascent.

## Release channels, and lessons the repos recorded

- **Pages through Actions:** 2060td, football, space-wrecked, rule-or-drool, who-am-i-, climbing-world-traveler, project-ascent, chooser-of-the-dead, afterglass and dirtbag.
  - Patterns worth keeping: deploy the exact artifact you verified (who-am-i-); confirm the live `version.json` (dirtbag).
  - landnam, sandbagged, ludus and spliceworld commit their built files instead.
- **Single-file HTML** (2060td, ludus, landnam, sandbagged, afterglass). It exists for hand-off as one file, for itch.io, for `file://`, and to keep the zero-request offline promise.
- **itch.io:** butler in chooser-of-the-dead's CI, which skips cleanly when the secrets are missing.
- **Play TWA.** Only dirtbag has shipped one. Its pipeline:
  - Bubblewrap pinned at 1.25;
  - a check that targetSdk is ≥ 36;
  - signing from secrets;
  - versionCode taken from the clock;
  - a Play Billing acknowledger injected into the generated project;
  - `assetlinks.json` holding two SHA-256 fingerprints.
- **Electron/Steam:** dirtbag's `desktop/` (an `app://` protocol, file-backed saves for Steam Cloud, demo edition, smoke tests under xvfb) and chooser-of-the-dead's `apps/electron`.
- **Capacitor:** planned in chooser-of-the-dead, dirtbag and space-wrecked, but not built.
- **Lessons:**
  - `assetlinks.json` must sit at the origin root, which a github.io project path can't do; custom domains (`*.rcjlabs.com`) fix it.
  - `upload-pages-artifact` v4+ drops dotfiles unless `include-hidden-files` is set.
  - `.nojekyll` matters for branch deploys.
  - versionCode must always rise.
  - All github.io projects share one origin, so cache cleanup and storage keys need a per-app prefix (rule-or-drool).
  - Moving from a TWA to Capacitor strands saves in Chrome's storage (dirtbag ROADMAP).
  - Package ids are inconsistent today: `io.github.rcjlabs.*` and `com.rcjlabs.*`.

## Reuse map

What to port into which engine module. The first two rows are already done.

| Engine module | Port from (repo: path) |
| --- | --- |
| `tools/lint-boundaries` (done) | chooser-of-the-dead: `tools/lint-boundaries/` |
| editor update gate (done) | project-ascent: `src/lib/swUpdate.ts`, `src/engine/offline.ts` |
| core rng | chooser-of-the-dead: `packages/engine/src/rng/rng.ts`, `rng/hash.ts`; climbing-world-traveler: `src/sim/rng.ts` (normal, triangular, weighted helpers) |
| core state hash, parity | landnam: `src/run/headless.ts`, `src/run/parity.ts`; 2060td: `src/sim/hash.ts` |
| core conditions | who-am-i-: `src/engine/cond/{parse,eval,sat,describe}.ts`; dirtbag: `app/src/sim/cond.ts`; chooser-of-the-dead: `packages/engine/src/campaign/state.ts` |
| core events and beats | landnam: `src/sim/beats.ts`; spliceworld: `battle/engine.js` |
| saves | chooser-of-the-dead: `packages/engine/src/campaign/save.ts`; climbing-world-traveler: `src/save/{session,adapt,backend}.ts`; landnam: `src/state/migrations.ts`; spliceworld: `save/` |
| platform storage, share codes | rule-or-drool: `src/meta/storage.ts`; chooser-of-the-dead: `packages/platform/src/storage.ts`; 2060td: `src/meta/codec.ts` |
| compiler, schemas | chooser-of-the-dead: `packages/content-compiler/src/{compile,scenes}.ts`; who-am-i-: `src/compiler/vite-plugin.ts`, `src/compiler/rules/`, `scripts/gen-schemas.ts` |
| export targets | chooser-of-the-dead: `packages/content-schema/src/targets.ts`, `apps/web/vite.config.ts`, `tools/leak-check/`; dirtbag: `twa/`, `desktop/`, `.github/workflows/build-twa.yml`; 2060td: `scripts/single-file.mjs`; sandbagged: `scripts/build-html.mjs` |
| dialogue | chooser-of-the-dead: `packages/story/src/index.ts` (ink); dirtbag: `app/src/sim/content/people.ts` (`TalkDef`) |
| events, quests, contracts | space-wrecked: `data/{events,quests,contracts}.json`, `src/sim/{events,quests,standing}.js`; spliceworld: `data/operations.json`; wasteland-protocol: `bookConsequence` in `game.js` |
| world maps | wasteland-protocol: `generateSectorMap` / `validateSectorMap` in `game.js`; space-wrecked: `src/sim/gen/sector.js`; spliceworld: `data/regions.json` |
| UI input and a11y | chooser-of-the-dead: `packages/ui/src/{spatial,gamepad,i18n}.ts`; dirtbag: `app/src/ui/{spatial,nav,pad,input,crash}.ts`; space-wrecked: `src/ui/gestures.js`; spliceworld: `ui/{picker,tabs,cards,live,focus}.js` |
| audio, haptics | afterglass: `prototype/src/slice/sound.js`; dirtbag: `app/src/audio/`; landnam: `src/audio/`, `src/haptics.ts`; wasteland-protocol: `SFX` / `AMBIENCE` in `game.js` |
| 2D stage | 2060td: `src/game/stage/`; afterglass: `prototype/src/px/kit.js`; climbing-world-traveler: `src/ui/wall/` |
| testkit | chooser-of-the-dead: `packages/testkit/src/compare.ts`; rule-or-drool: `src/sim/`, `src/playtest/`; afterglass: `prototype/src/slice/{autopilot,watch}.js`; spliceworld: `tools/battery.js`; sandbagged: `sim/mutants.mjs`, `sim/guard.mjs` |

## Duplicated today

These are the counts the engine collapses:

| Utility | Copies |
| --- | --- |
| mulberry32 RNG | about 14 in JS/TS, plus a C++ port |
| Share and run codes (base64url, varints, checksum) | 4 |
| Service-worker stamping | about 8 variants |
| Icon generators | 8 (4 using Playwright, 4 hand-written PNG encoders) |
| Save stacks | 7 |
| Storage wrappers that report failures | 5 |
| Update prompts | 4 |
| Headless browser harness boilerplate | about 8 |
| WCAG contrast checkers | 4 |

## Conventions the repos share

- A ROADMAP with a CURRENT MILESTONE marker and "Done when" gates. One milestone per session.
- Decisions marked LOCKED, PROPOSED or OPEN (rule-or-drool's TRANSFER.md) or dated in a DECISIONS file (2060td).
- **Measurement.**
  - Measure before tuning.
  - "A number in the roadmap is a reading, not a fact" (landnam), recorded with instrument, date and N.
  - Balance changes need Monte Carlo runs (ludus wants N ≥ 800).
- **Guards.**
  - "A check that cannot fail looks exactly like a check that passes" (landnam).
  - Guards are proven by breaking what they guard (sandbagged, spliceworld).
- **Saves and content.**
  - "SAVE_VERSION is sacred"; storage keys are never renamed.
  - Content is data: "if adding content requires engine edits, the engine is wrong" (spliceworld).
- **What players see.** Odds and numbers on screen are the ones the rules use (space-wrecked's Law 4, dirtbag). Offline always; no analytics or CDNs.
- **Assets.** Licences are logged, and NC, ND and SA are not allowed. AI-generated art is logged with its prompt, date and hand edits (space-wrecked's `assets/LOG.md`, wasteland-protocol's `ART_PROMPTS.md`).

## Gaps none of them fill

- **No WebGL.** space-wrecked's 3D is a custom renderer on a 2D canvas.
- **No spatial, quest or NPC editor.** Today's editors are YAML or JSON plus linters plus lab pages: chooser-of-the-dead's Case Lab and Body Lab, who-am-i-'s ContentPreview, the art galleries.
- **3D has always been pushed to Unreal,** with the TS sim as the executable spec. The engine's 3D phases are the first attempt at 3D inside the web stack.
