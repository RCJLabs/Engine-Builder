# Stages drawn in code (M7.4, D86)

A 2D space can be drawn by the project's own code: a stage under `stages/` that paints each frame on Canvas 2D, off the page in a locked worker. The engine keeps everything else a 2D space does: the sim, the walkers' routes and arrivals, the clock, and the uses as buttons. The research behind it is [research/stages.md](../research/stages.md); 2D spaces are [2d-scenes.md](2d-scenes.md), tilemaps [tilemaps.md](tilemaps.md), and scripts, whose loader and rules a stage borrows, [editor-scripts.md](editor-scripts.md).

## A space with a stage

A 2D space names its stage:

```json
{ "name": "Boarding deck", "view": "2d", "stage": "battle", "fit": [176, 80], "size": [176, 80], "objects": [] }
```

- **`stage`** names `stages/<id>.ts`. With none, the space is drawn by stage2d as before.
- **Only 2D spaces** have a stage. A 3D space is walked by walk.js, whose physics a stage can't replace (E058).
- **Nothing else changes:**
  - The space's objects, tilemap, building, marks and uses are packed and played as for any 2D space.
  - The sim reads the same world.
  - The Scene panel draws the space with its built-in 2D view, so it can still be edited.

## Stage files

- **Where they live:** `stages/<id>.ts` is a stage. It may import other `.ts` files anywhere under `stages/`, in folders if it likes, and nothing outside it but `"eb/stage"`.
- **Names:** lowercase, words joined by hyphens, as scripts' are (E030).
- **What may run:** a stage file is checked by the purity rules less two. Transcendental `Math` and `**` are allowed, because a picture needn't agree to the last bit between engines, and the sim never reads one. Still forbidden:
  - `Math.random`: noise is seeded, so a frame drawn twice is the same;
  - `Date` and timers: the frame gives the time;
  - `eval`, `Function` and `import()`;
  - `self`, `postMessage` and the DOM and host globals.
- **Problems:** E028 when a stage file doesn't parse, E029 when it breaks a rule, E030 when it imports something it may not or sits where it shouldn't. Each is at its line, as for scripts.
- **W159:** a stage file that no space's stage reaches, by name or by import. It is left out of the pack.

## The API

```ts
import { defineStage, svg, type Frame, type Start } from 'eb/stage';

export default defineStage({
  start(s: Start) {
    // once, before the first frame
  },
  frame(g, f: Frame) {
    // g is the canvas's 2D context, its transform already set to f.dpr: draw in CSS pixels
    return { uses: [{ object: 'alarm', box: [x, y, w, h] }] };
  },
});
```

**`Start`**, given once, before the first frame:

| Field | What it holds |
|---|---|
| `space` | The space's id. |
| `size` | The space's size in art pixels. |
| `world` | The pack's world as stage2d reads it (JSON): the space, its prefabs, the records its objects name, its tiles and its building. |
| `places` | Each object's place in art pixels, by path, through prefabs. |
| `sheets` | The space's sprite sheets as `ImageBitmap`s, by asset path. |

**`Frame`**, given every frame:

| Field | What it holds |
|---|---|
| `t`, `dt` | Seconds since the stage started, and since the last frame it drew, on the page's clock. |
| `w`, `h`, `dpr` | The box in CSS pixels, and device pixels per CSS pixel (at most 2). |
| `still` | The player asked for reduced motion. |
| `walkers` | Each walker the stage2d loop walks: `{ actor, at: [x, y], facing: 1 or -1, moving }`, `at` in art pixels. |
| `world` | What the Space widget reads: `here`, `fight` and `markers`, or undefined. |
| `taken` | The objects taken from the space. |
| `input` | What the player did since the last frame (below). |

**`input`** is a list of events, in the order they happened:
- `{ kind: 'drag', dx, dy }`: one finger or the mouse moved, CSS pixels.
- `{ kind: 'twist', angle, scale }`: two fingers turned (radians) and pinched (a ratio).
- `{ kind: 'wheel', dy }`.
- `{ kind: 'key', key, down }`: the arrow keys, `+` and `-`.
- `{ kind: 'tap', x, y }`: a tap or click not on a use's button, CSS pixels.

**What `frame` returns.** A stage returns `{ uses }`: each use's object path and its box on screen, `[x, y, w, h]` in CSS pixels.
- The page puts the use's own button there, grown to 44 px at least. Its label is the use's, and pressing it sends `world/use` as stage2d's does.
- A use the stage gives no box has no button, and the hook lists it as unseen.
- Returning nothing keeps the last frame's boxes.

**`svg(text, w, h)`** resolves to an `ImageBitmap` of SVG text the stage made, drawn by the page at `w` by `h` device pixels. A worker can't decode SVG itself. Space-Wrecked's portraits are made this way.

## Where it runs

**stagework.js** is a runtime file built beside stage2d.js. stage2d.js starts it as a worker from a blob, so it runs from `file://` as the single-file export does. Before running anything it locks itself down, as the game's worker does: no fetch, storage, `navigator`, other workers or `importScripts`. Then:
1. **The page hands it the canvas** (`transferControlToOffscreen`), the space's sheets as bitmaps, and the stage's compiled files.
2. **The worker loads the stage** with the scripts' loader, with `require("eb/stage")` answering the API, and calls `start`.
3. **Each animation frame**, the page runs stage2d's loop as it does for any 2D space: walkers, arrivals, clock and uses. It sends a frame only when the worker has answered the last one, so a slow stage drops frames and never queues them.
4. **The worker** sets the transform to the frame's pixel ratio, calls `frame` and answers with the use boxes and how long the frame took.
5. **The page** places the use buttons, and resizes the canvas when the box or pixel ratio changes.

**A stage that throws** is stopped. The page puts its message and its file and line over the box, as an alert, and in the editor's console. The space goes on: its walkers, clock and use buttons keep working.

**`window.__ebStage2d`** gains `code()` for a space with a stage: the frames drawn, the last frame's milliseconds, the uses with and without a box, and the error if any.

## The pack

- **Format 20:**
  - `world.stages`: every stage file the spaces' stages reach, compiled to JavaScript by the scripts' transpiler and keyed by its path under `stages/` without `.ts` (`battle`, `space-wrecked/board`). Each space's own `stage` names its entry. Two stages that share a file carry it once.
  - `ui.images`: the assets the screens' image widgets name, as data URLs (PNG, SVG and the other image types an asset may be), by their path inside `assets/`.
- **Either or both:** a pack is format 20 when a space names a stage or a screen shows an image. A game of screens alone may be format 20 with no world.
- **`readPack` refuses** a format 20 pack with neither, a space whose stage the pack lacks, and an image that isn't an image type's data URL.
- **Earlier formats** are read as before, and a pack with neither keeps its format and its hash.

## Screens' images

A screen's image widget shows its asset in play and in exports, a PNG or an SVG, from the pack's `ui.images`. Until M7.4 it drew only in the designer and showed its alt text everywhere else. The alt text stays as the image's description.

## Checks

| Code | When |
|---|---|
| E058 | A 3D space has a `stage`. |
| E095 | A space's `stage` names no `stages/<id>.ts`. |
| E028, E029, E030 | A stage file doesn't parse, breaks a stage rule, imports what it may not, or has a name that isn't an id. |
| E047 | A screen's image widget names a file that isn't an image (since M7.4). |
| W159 | A stage file no space's stage reaches. |

## The editor

- **The Logic panel's Scripts section lists the stage files** under Stages, with New stage. A new stage draws:
  - the space's tilemap as plain squares, or its objects as boxes;
  - its walkers as dots;
  - its uses as outlined boxes, with their buttons.
  So it plays at once, and shows the API's every part.
- **The script editor edits stage files** as it does scripts, with each problem at its line and completion for `eb/stage`'s names.
- **A 2D space's inspector**, with nothing chosen, has a Stage field: a stage file, or none.
- **Play** packs format 20 and plays the stage. The Scene panel goes on drawing the space with its built-in view.

## The demo

**What it is:** `tools/cli/test/fixtures/boarding/`, M7.2's boarding deck drawn by Space-Wrecked's battle board.
- **The space and its sim** are the deck's: the example ship's tilemap, Ines and Oren on their rounds, and an alarm that sends both to the airlock.
- **The space** names `"stage": "battle"`.
- **`stages/battle.ts`** reads the deck's tilemap rows with Space-Wrecked's map text reader and builds Space-Wrecked's battle map from them. Each frame it draws the board through its own camera: deep space, the floors tinted by room, the walls, doors and fittings standing on the deck, and Ines and Oren as Space-Wrecked's figures where the walkers are, facing their way.
- **Input:** a drag or a twist turns the board, a pinch or the wheel zooms, and the arrow keys turn it too. The alarm's button stands over its console.
- **`stages/space-wrecked/`** holds the port, about 2,500 lines of Space-Wrecked's render code, with its own NOTICE: all rights reserved, RCJLabs, from the space-wrecked repository at a named commit. The changes:
  - files renamed to the stage's naming;
  - JavaScript given the types TypeScript needs;
  - `document.createElement('canvas')` changed to `new OffscreenCanvas`;
  - `window.devicePixelRatio` changed to the frame's;
  - the ship's exterior, which the board doesn't draw, left out.
- **Its HUD** shows a small SVG of the alarm, drawn fresh, through a screen's image widget.

## The gate

- `eb validate` finds the boarding deck clean and breaks it once each for E095, E058 (a stage on a 3D space), E029 (a stage file that uses `document`) and W159.
- **Unit tests:**
  - the stage rules;
  - the loader with `eb/stage`;
  - format 20's packing, and earlier formats read as before;
  - the frame the page builds from stage2d's walkers and input;
  - the worker's protocol, against a stand-in canvas;
  - the use boxes made into buttons;
  - a screen's image widget with a PNG and an SVG asset.
- **The port held still:** the battle map built from the boarding deck's tilemap gives the same faces every time, held to a golden hash. Its walls, doors and fittings are counted against the ship's map text.
- **The boarding deck played in the Play panel,** by mouse and keys and by touch at 360, 390 and sideways:
  - drawn by the worker, its frames counted by the hook and Space-Wrecked's palette on the canvas;
  - the crew walking their rounds;
  - the alarm by a click, a tap and the keyboard on its button;
  - the board turned by a drag, a twist and the arrow keys;
  - the HUD's SVG shown.
- **Exported** as one file and played from `file://`.
- **In the editor alone** at 1280 and 390: a stage made with New stage, a problem shown at its line, then fixed, set as a 2D space's stage in its inspector, and played.
- **Budgets:** stage2d.js, stagework.js, the precache and the editor's start.

## Open questions

1. Whether a stage should read the view's facts (a quest's stage, a flag) to draw by. M7.4 gives what the Space widget reads.
2. A stage for a 3D space, beside walk.js's physics, or for a screen's widget.
3. Fonts for stages, with Phase 10's OFL fonts.
4. Safari before 16.4, which has no 2D OffscreenCanvas: a stage there would have to draw on the page, outside the worker's lock.
