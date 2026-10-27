# 2D scenes (M7.1, D83)

A 2D space is a space drawn from the side in whole art pixels: sprites cut from grid sheets and animated by named clips, parallax layers behind them, and figures the sim sends between marks. It is drawn by an orthographic camera on the same three.js renderer the 3D view uses, in the Scene panel and in play. The research behind it is [research/2d.md](../research/2d.md).

## A 2D space

- **The file** is an ordinary space's (`spaces/<id>.json`) with these fields beside its objects:
  - `view: "2d"`, without which a space is 3D;
  - `fit: [w, h]`, the art pixels the space wants in view, 320 by 180 if left out;
  - `size: [w, h]`, the art pixels the camera keeps within, from the origin up and to the right; what its objects cover if left out;
  - `backdrop`, a colour drawn behind everything, black if left out.
- **Objects** are the same objects: shapes, placed prefabs and placed records, with components, overrides, tags, uses and actors.
  - `at` is `[x, y, depth]` in art pixels: x to the right, y up from the space's foot, depth toward the viewer (the nearer is drawn in front; equal depths keep the file's order).
  - `scale` is whole numbers in 2D, as anything else blurs a pixel; `turn` is not used.
  - A shape draws flat: a box as a filled rectangle of its scale, a sphere as a filled circle. A cylinder or a plane is E058 in a 2D space.
- **What a 3D space has and a 2D one doesn't:** terrain, water, environments, models, foliage and navmeshes are E058 in a 2D space. A 2D space needs no navmesh for its walkers.

## Sprites

A sprite is an engine record type, like a model:

```json
{
  "name": "Guard",
  "sheet": "starter-sprites/figure-guard.png",
  "frame": [16, 24],
  "origin": [8, 0],
  "clips": {
    "idle": { "frames": [0, 1], "fps": 2 },
    "walk": { "frames": [2, 5], "fps": 8 }
  },
  "clip": "idle"
}
```

- **The sheet** is a PNG among the project's assets, named from `assets/` as a model's file is, cut into frames of `frame` pixels, numbered across and then down from 0.
- **`origin`** is the frame's pixel that stands at the object's `at`: its bottom centre if left out.
- **A clip** is a run of frames, `[first, last]`, played at `fps` (1 to 60) and looping unless `loop` is false, when it holds its last frame. `clip` is the one played when nothing names another: the first clip if left out.
- **E091** is a sprite that can't be drawn as written: a sheet missing or not a PNG; a sheet not a whole number of frames across and down; a clip running past the sheet; a clip named that the sprite doesn't have. The compiler reads only the PNG's header for its size, as it does a terrain's.

## Components

- **`sprite`**: `{ sprite, clip?, flip?, phase? }`. The sprite record it draws, the clip it plays (the sprite's own if left out), drawn mirrored across, and where in the clip it starts, in frames.
- **`parallax`**: `{ factor: [x, y], repeat? }`. 0 stays with the camera, 1 moves with the world, and between them a layer moves at that share of the camera's movement. A layer that repeats is tiled across the view.
- **`interact`** works in 2D as in 3D: a tap on the object's sprite uses it.

## Actors in a 2D space

- **An actor's `sprite`** (beside its model and figure) is what it draws as in a 2D space, and its **`speed`** is how fast it walks in art pixels a second, 24 if left out.
- **It plays `walk`** while it moves and `idle` while it stands, when its sprite has them, and its sprite's own clip otherwise. It faces the way it last walked.
- **It walks in a straight line** to the mark the sim sends it to, and the stage tells the sim when it arrives, as the crowd does in 3D (`world/npcs-at`). Behaviours, schedules and the clock work as they do in 3D.

## The view

The Scene panel's 2D view and the 2D stage in play draw a space the same way.

- **The scale** is the largest whole number `s` at which `fit` still fits the box's device pixels, and at least 1: `s = max(1, floor(min(w·dpr / fit.w, h·dpr / fit.h)))`. The canvas is `ceil(w·dpr / s)` by `ceil(h·dpr / s)` art pixels, shown at `s` device pixels each with nearest-neighbour sampling (`image-rendering: pixelated`). Textures are sampled nearest, with no mipmaps. From afterglass's layout (stage.js:34-59).
- **The camera** is a centre in art pixels, kept within `size` and drawn at whole pixels. The editor's zoom is whole steps from the fitted scale, so turning a phone keeps it sensible. From afterglass's and 2060td's cameras.
- **A parallax layer** at factor `f` is drawn at `at + camera · (1 − f)`; one that repeats is tiled across the view.
- **A clip's frame** is `first + floor(t · fps + phase) mod n`, where `t` is the page's seconds since the space was drawn. Under reduced motion every clip holds its first frame. The sim never hears of a frame.
- **Draw order:** depth, nearest last; equal depths keep the file's order.

## The editor

- **New space** offers 2D beside 3D.
- **The Scene panel** draws a 2D space in its 2D view:
  - a click or tap picks the sprite under it, by its frame's box;
  - a drag moves the chosen in whole art pixels;
  - arrow keys move them a pixel, 8 with Shift;
  - a drag on nothing pans, and the wheel, a pinch or the zoom buttons zoom in whole steps;
  - Frame fits the chosen, or the space.
- **Add → Sprite…** places an object with a sprite component at the view's centre.
- **Above a sprite's form,** its sheet with the frame grid drawn over it, and each clip playing.
- **Add starter sprites** copies the starter sprite kit into the project, as Add starter kit does.

## Play

- **stage2d.js** draws a 2D space in the Space widget, built beside walk.js and loaded by the same hosts, which pick the stage by the space's view. An export ships it only when a space is 2D.
- **The camera** starts at the space's start, or the spawn point arrived at, and a drag pans it within `size`.
- **A tap or click** on a sprite whose object has an interact uses it (`world/use`). Tab and Shift+Tab, or a pad's shoulders, move a ring among the uses on screen, and Enter, E or the pad's A uses the ringed one: no use needs a pointer.
- **The clock** runs while a 2D space is shown, as it does while a 3D one is walked (M6.3).
- **The hook** is `window.__ebStage2d`: the space, the scale, the canvas's art pixels, the camera, and what is drawn (each object's sprite, clip, frame, whole-pixel place and flip), with a frame count.

## The pack

- **Format 17** once a space is 2D. The 2D space travels as its file does, and each sprite it draws is among the world's records, its sheet among the world's files.

## The starter sprite kit

- **`starter-sprites/`,** written only by `pnpm make:starter-sprites` from `tools/starter-kit/src/sprites/`, and held to it byte for byte, as the 3D starter kit is.
- **A palette of its own,** 16 colours chosen for night and torchlight.
- **The sheets:**
  - figures with idle (2 frames) and walk (4), in a guard's, a keeper's and a villager's colours;
  - a torch (3 frames), a bell (still and swung) and a banner (2);
  - the keep's parts: wall, battlement, tower, gate and a lit window;
  - backdrop layers that repeat across: the sky, the stars, the far ridge and the near ridge, and a moon.
- **Dedicated by RCJLabs to CC0,** with each sheet's entry in the provenance log.

## The keep (the gate's fixture)

`tools/cli/test/fixtures/keep/`: a keep at night, from the starter sprites.

- **The space:** a night backdrop; the sky (factor 0), the stars (0.05), the moon (0.1), the far ridge (0.3) and the near ridge (0.6) in parallax; the keep at 1, its wall, battlements, two towers and the gate; four torches flickering.
- **Two guards** walk the wall walk between its marks on a behaviour, all night.
- **A bell** on the gatehouse: its use rings it, a feedback line says so, and the HUD says whether the watch has rung it.

## The gate

- **Checks:** `eb validate` finds the keep clean, and breaks once for each new check: E091, E058's 2D rules, and a 2D walker needing no navmesh.
- **The starter sprites** are held to their generator byte for byte and validate clean.
- **Unit tests:** the scale rule, parallax, a clip's frames, straight-line walking and arrivals, and the hit test.
- **Headless:** the keep's guards walk the wall through a night in Node, the sim hearing each arrival, as the square's are walked.
- **The keep in play,** in the Play panel:
  - by mouse and keys at 1280 (the bell rung by a click, and by Tab and Enter);
  - by touch at 360, 390 and sideways (the bell tapped, the camera dragged);
  - drawn at the scale rule's whole scale, its canvas holding only the palette's colours;
  - its parallax layers moving at their factors as the camera pans;
  - the guards' frames advancing as they walk and the sim hearing them arrive, and the torches' frames advancing;
  - exported as one file and played from `file://`.
- **The editor:** a 2D space built from the starter sprites in the Scene panel at 1280 and 390: sprites placed, moved by a drag and by arrow keys to the pixel, a parallax layer set, a clip previewed, then played.
- **Budgets:** stage2d.js, the precache and the editor's start.
- **Phones:** 360, 390 and sideways, every target 44 px, nothing past the edges and nothing axe finds.

## Open questions

1. Light at night (a torch's glow, a lit window) as a shader, or as sprites drawn additively? M7.1 draws only sprites.
2. Sorting by y for top-down scenes, which M7.2's tiles will want.
3. Hit tests by the frame's box, or by its opaque pixels?
