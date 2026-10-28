# Stages drawn in code: what Evan's games already do (M7.4)

How dirtbag and space-wrecked draw their worlds in code, and what the engine's stages and scripts give such code today, read on 2026-10-27 to design M7.4's custom stages. The decisions it led to are D86; the design is [specs/stages.md](../specs/stages.md). Facts carry their file and line; opinions and guesses are marked as such.

## The engine today

- **A stage starts from the Space widget's host** (`packages/ui/src/render/SpaceWidget.tsx:35-54`, `spaceHost.ts:37-72`).
  - The host gets a plain box and an ask. The ask holds the space, quality, where the player stands, what was taken, the NPCs and their goals, getters for the world (`here()`, `clocked()`, `fight()`, `markers()`), and `send(action)`.
  - The host never gets the view's facts or lists.
- **stage2d does two jobs in one loop** (`apps/editor/src/stage2d/stage.ts:30-130`).
  - It moves things: walkers along their routes, arrivals told back, the clock run, uses sent.
  - Then it draws: `drawFrame`, and the use buttons placed over what was drawn.
  - So drawing alone can be handed to other code without the sim or the movement changing.
- **Choosing and loading the stage.** The stage is chosen by the space's `view` (`apps/editor/src/walk/host.ts:32-33`). It is loaded as a classic script that leaves `window.__eb*` behind (`hosts.ts:47-77`).
- **Exports carry each runtime file only when a space needs it** (`packages/export/src/targets.ts:96-133`):
  - The web build ships it beside the page.
  - The single file holds it as a text script, loaded through a blob URL (`html.ts:116-118`, `hosts.ts:53-56`).
- **A project's scripts** are compiled by sucrase (`packages/script/src/transpile.ts`) and checked by the purity rules (`packages/purity/src/rules.ts:22-44`). They run through `new Function` with a `require` that answers `"eb"` and relative scripts (`load.ts:68-95`).
  - **Where they run:** in a worker that `lockDown` has stripped of fetch, storage, `navigator`, workers and `importScripts` (`apps/editor/src/scripts/lockDown.ts:10-41`). This is "not a sandbox" (`:4-6`).
  - **What trust gates:** only whether the editor runs an imported project's scripts (`trust.ts:1-7`). The player page and exports run a pack's scripts in the locked worker without asking (`Player.tsx:52-57`, `Game.tsx:27-29`).
- **Screens' image widget shows nothing in play** (`packages/ui/src/render/Widget.tsx:63-72`). It draws `drawing.assetUrl(asset)`, but only the designer passes `assetUrl` (`apps/editor/src/designer/ScreenDesigner.tsx:138`), so in play and exports it shows its alt text. SVG is already an image asset (`packages/schema/src/assets.ts:14`).

## dirtbag

- **Where the painters live:** `app/src/view/`. `render.ts` is the entry, `paint/*` holds scenes, people, the wall, the gym, effects, the map, boulders, expeditions and cards, and `kit/geom.ts` and `kit/noise.ts` are the helpers. About 196 exports across 26 files; `scenes.ts`, `people.ts` and `expeds.full.ts` run to 835–1,070 lines each.
- **A frame reads a whole `Frame`:** the game state, the view, the scene, the camera, the time, the width, the device pixels and the player (`render.ts:82-101`, `game.ts:1912-1941`). The painters import sim functions directly (`render.ts:4-32`).
- **The loop is React's** (`App.tsx:41-93`).
  - The screen is 740 logical pixels tall and scaled.
  - The pixel ratio is capped at 3 (`:54`).
  - Each draw starts with `setTransform` (`render.ts:104`).
- **Tied to the DOM by:**
  - `document.createElement('canvas')` for offscreen layers (`geom.ts:13`);
  - cached canvases (`wall.ts:750`, `map.ts:174`);
  - `document.fonts.load` (`card.ts:151`);
  - named web fonts (`fx.ts:8-13`).
- **Transcendental Math throughout** (`render.ts:496-497,673`; `geom.ts:96`). The sim's purity rules would refuse it.
- **Taps hit-test rectangles** the painters return (`game.ts:826-838`).

## space-wrecked

- **No three.js.** Its own painter projects 3D faces onto Canvas 2D through an orbit camera (`src/render/painter.js:1-50`, `orbit.js:1-40`).
- **The battle board** (`render/battleView.js:1-120`):
  - `createBattleBoard()` with `setMap({ map, skin, open })`, `setActors({ faces, glows, figures })` and `draw(ctx, cam, rect, overlay)`.
  - It keeps the last full frame and draws rough half-resolution frames while the camera moves on a slow phone (`frameBudget.js`).
- **Its map is plain data** (`sim/mapFromShip.js:12-30`): tiles, rooms, hazards, and walls on the north and west edges. `sim/mapText.js:14-51` reads the battle map text format that the engine's tilemaps already import (M7.2).
- **What a frame needs:**
  - The scene is built once, as faces and glows (`battleScene.js`, pure: map in, faces out).
  - The units are figures at their tiles with a facing and a pose (`units.js:30-45`), drawn once into kept canvases (`figures/sprites.js`).
- **How much code the battle board takes:** its imports reach about 6,450 lines in 40 files. Most of that is the ship's exterior, pulled in by `shipView.js`, of which the board uses only `drawSpace`. *Estimate:* the board, its scene, the painter, the camera, the palette, the units and the figures come to about 2,500 lines.
- **Four files touch the DOM:**
  - `palette.js`;
  - `figures/sprites.js` and `layer.js`, which make canvases with `document.createElement`;
  - `starfield.js`.
  The pixel ratio comes from `window.devicePixelRatio` (`canvas.js:17`).
- **Portraits and icons are SVG text** (`ui/portrait.js:15-37`, `ui/icons.js:3-6`) shown as images. They are UI, not the board.
- **Taps pick projected convex hulls** (`render/pick.js:12-28`).

## A spike: a canvas in a locked worker

A page made a canvas and handed it with `transferControlToOffscreen()` to a worker started from a blob, with `fetch` and `importScripts` removed. It ran from `file://`, in the cloud container's Chromium (Playwright 1.56.1, 2026-10-27). In the worker:
- rectangles, `Math.sin` and `fillText` with the system's sans-serif all drew;
- `new OffscreenCanvas(10, 10)` gave a second canvas to draw on;
- an SVG, decoded on the page by an `Image` and `createImageBitmap` and handed over as a transferable, drew with `drawImage`.

*Not tested:* Safari, which has had 2D `OffscreenCanvas` only since 16.4, and phones.

## What M7.4 takes

- **From the engine:** stage2d's loop, with its drawing handed over. The Space widget's ask stays as it is, and so do the outbox, the walkers, the clock and the use buttons.
- **From the scripts:** the transpiler, the loader and the lock-down, with a rule set of their own and `"eb/stage"` beside `"eb"`.
- **From space-wrecked:**
  - the battle board, its scene and its figures, as the demo's stage code;
  - its map read from the space's own tilemap rows, by the same map text format;
  - `document.createElement('canvas')` swapped for `new OffscreenCanvas`, and the pixel ratio taken from the frame.
- **From dirtbag:** nothing yet. Its painters would need the same canvas swap, plus fonts, which wait for Phase 10.

## Open questions

1. Whether a stage should get a slice of the view's facts (a quest's stage, a flag) to draw by. M7.4 gives only what the Space widget reads.
2. Safari's 2D OffscreenCanvas on older iPhones, and whether to fall back to the page there.
