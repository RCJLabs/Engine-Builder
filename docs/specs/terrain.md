# Terrain and water (M5.3, D65)

M5.3 is Phase 5's third milestone. It gives a space a terrain: a square heightmap, sculpted and painted with brushes by mouse or finger, and drawn in chunks whose detail falls with distance. It also adds water, a component on a plane. Scatter and foliage wait for M5.6, after Assets (D65).

Nothing here runs in a game yet. M5.3 makes terrain and water data, checks, brushes and drawing in the editor's view; M5.8 brings physics and a player. The files are those of [viewport.md](viewport.md) and [components.md](components.md), which this spec extends.

## The terrain in a space

A space's JSON gains one field, `terrain`, written after `name` and before `objects`:

```json
{
  "name": "Fell",
  "terrain": {
    "size": 129,
    "spacing": 1,
    "low": -10,
    "high": 40,
    "layers": [
      { "name": "Grass", "color": "#5f8f3e" },
      { "name": "Rock", "color": "#8a8580" }
    ]
  },
  "objects": []
}
```

| Field | Holds |
| --- | --- |
| `size` | vertices a side: 65, 129, 257 or 513, each a whole number of chunks of 32 squares |
| `spacing` | metres between vertices, 0.25 to 16 |
| `low`, `high` | metres: the heights the heights file's 0 and 65535 stand for; `low` below `high` |
| `layers` | 1 to 4 paint layers, each a name of 1 to 40 characters and a colour |

- **A space has at most one terrain; a prefab has none.** A prefab with `terrain` is E058.
- **Where it lies:** centred on the space's origin, its vertices `spacing` apart along x and z. Vertex `(i, j)` is at `x = (i − (size − 1) / 2) × spacing`, `z = (j − (size − 1) / 2) × spacing`.
- **Between vertices**, a height is read on the triangles drawn at full detail, each square split from its `(i + 1, j)` corner to its `(i, j + 1)` one, as the spike's `heightAt` reads its own (M1.10). Outside the terrain, the nearest edge holds.

## Its two files

They sit beside the space, named by its id:

- **`spaces/<id>.heights.png`**: 16-bit greyscale, `size` × `size`. Row `j` is the vertices at that `z`, column `i` at that `x`. A value `v` is the height `low + v / 65535 × (high − low)` metres.
- **`spaces/<id>.paint.png`**: 8-bit RGBA, `size` × `size`. Channel `k` (red, green, blue, alpha) is layer `k`'s weight, 0 to 255. A vertex's colour is its layers' colours weighted by these and divided by their sum; where they sum to 0, it is layer 1's.

The editor writes both as it adds a terrain, the heights at 0 m (or `low`, if 0 is outside the range) and all paint in layer 1. Brushes write the file a stroke changed.

## Water

The engine's sixth component kind (components.md):

| Kind | Fields | Means (from M5.8) |
| --- | --- | --- |
| `water` | `color` (colour), `clarity` (number, 0 to 1), both optional | water at the object's plane, which the player swims in |

- Left out, water is `#3a6d8c` and of clarity 0.6, which the view draws as its opacity's complement: clear water is fainter.
- **On a plane.** Water on any other shape, its own or one an override gives it, is W145: it draws, but only a plane's top is a water surface.
- **As many as a space needs:** a lake above the sea is another plane.

## Brushes

Each brush acts in a circle of its radius around the point under the pointer, its effect falling off as `(1 − (d / r)²)²`, and is applied in dabs along a stroke, one every half spacing the pointer moves over the ground. So a stroke's result depends on the path, not on how fast it was drawn.

| Brush | One dab does |
| --- | --- |
| Raise, Lower | moves each height by `strength × 0.25 m × falloff`, up or down |
| Smooth | moves each height towards the mean of it and its eight neighbours by `strength × falloff` of the gap |
| Flatten | moves each height towards the height under the stroke's first dab by `strength × falloff` of the gap |
| Paint | adds `strength × falloff × 255` to the chosen layer's weight and takes the same in proportion from the others, so the four still sum to 255 |

- **Radius** is 0.5 to 64 m, **strength** 0.05 to 1.
- **Heights stay within `low` and `high`.**
- **A stroke is one step of undo,** written as the pointer lifts: the file's bytes before and after.

## Chunks and detail

- **A chunk is 32 × 32 squares.** A 129-vertex terrain is 4 × 4 chunks, a 513-vertex one 16 × 16.
- **Detail by distance.** A chunk at level `l` uses every `2^l`-th vertex, `l` from 0 to 3: at level 3 a chunk is 4 × 4 squares. The level is 0 while the camera is within twice a chunk's width of the chunk's centre, and one more for each doubling of that distance after.
- **No cracks at a seam.** Along an edge it shares with a coarser neighbour, a chunk puts its edge vertices on the neighbour's coarser line, each at the height between the two coarse vertices either side of it. Every point on a shared edge is then on both chunks' surfaces.
- **Normals** come from the full heightmap, not the chunk's level, so shading doesn't jump as detail changes.

## Checks

| Code | When |
| --- | --- |
| E058 | (M5.1's) a terrain's settings don't fit: a size that isn't 65, 129, 257 or 513, spacing out of range, `low` not below `high`, no layers or more than four; or a prefab has a terrain |
| E067 | a terrain's heights or paint file is missing, isn't a PNG, or isn't 16-bit greyscale or 8-bit RGBA of `size` × `size` |
| W144 | a heights or paint file whose space has no terrain |
| W145 | a water component on an object that isn't a plane, its own or one a placement's overrides make so |
| W141 | (M5.1's) a terrain's file whose name before `.heights.png` or `.paint.png` isn't an id |

`eb validate` and the Problems panel both report them. The compiler reads a PNG's header only; it never decodes the image. A PNG under `spaces/` whose part is neither `heights` nor `paint` (a misspelt `fell.height.png`) is no terrain's file and is ignored, as any other file there is; a terrain missing the file it meant is E067.

## The editor

- **Terrain tools.** In a space (not a prefab), the toolbar's Terrain button opens a row of its own:
  - Without a terrain, it holds a size and Add terrain. A new terrain is 1 m between vertices, from −10 to 40 m, with four layers: Grass, Rock, Sand and Snow.
  - With one, it holds Camera, then Raise, Lower, Smooth, Flatten and Paint, then the layer to paint (with Paint chosen), Radius and Strength sliders, and Terrain settings.
  - Camera puts the pointer back to moving the camera. Closing the row, or the space, chooses Camera too.
- **While a brush is chosen:**
  - One finger or the left button strokes. A ring shows the brush on the ground, under the mouse as it moves and under the finger as it strokes.
  - A press that starts off the terrain orbits instead.
  - A second finger puts the stroke back as it was and pinches; so does the browser taking the pointer away. Only a lifted pointer writes a stroke.
  - The right button orbits, the middle button pans, and the wheel zooms. The gizmo's handles don't take a press.
- **A stroke** is encoded as the pointer lifts, from the grid as the stroke left it, so a stroke drawn before the last one's step lands can't slip into it. Its step in the undo list names it: "Raise the terrain", "Paint Rock".
- **The terrain's form** is in the inspector while nothing is chosen in a space with a terrain. Terrain settings in the row chooses nothing and shows the inspector. It holds:
  - spacing, low and high, and each layer's name and colour, with its own Remove and an Add layer below;
  - Remove terrain, which takes both files with the settings.
  - Changing `low` or `high` keeps each height in metres, clamped to the new range. Both are written as the field is left or Enter pressed, not as each key lands: a range passed through on the way to the one typed would clamp heights for good.
  - Removing a layer moves the later layers' channels down one, so each vertex keeps the colours of the layers it had.
- **Add** stands a new object on the terrain's ground where it lands, to the centimetre, rather than at 0 m.
- **The view:**
  - It draws the chunks with the layers' colours blended at each vertex. Water is a see-through surface of its colour, its opacity clarity's complement. A placement's water, having no surface of its own, is a metre's plane.
  - The editor's grid is hidden while a terrain is shown, as the ground would only flicker through it.
  - A terrain is built a chunk at a time, once each, at the level the camera gives it. After that, a chunk is built again only when its level, or a neighbour's, changes.
  - A stroke draws again only the chunks its dabs reached, with a vertex around them for the normals.
  - The files are compared with what is shown after each change to the project, and decoded only when they differ. After an undo, only the chunks whose vertices changed are drawn again.
- **The view's hook** (`window.__ebViewport`, for the e2e) adds these:
  - `terrain()`: each chunk's level, triangles and distance, and the widest gap at any seam, read from the meshes' own buffers, with how many seams join two levels; and the widest gap between the drawn inner vertices and the grid;
  - `groundAt(x, z)`, the ground's point on the page;
  - `heightAt` and `paintAt`;
  - `waterAt(id)`, the opacity of an object's water.

## The gate

- **`terrain.spec.ts`** on desktop, by mouse and keys, and **`terrainPhone.spec.ts`** by touch at 360×740, 390×844 and 844×390 start from an empty project. They:
  - make a space, give it a 129-vertex terrain, and sculpt near the origin: Raise a ridge, Lower a trench, Smooth the ridge and Flatten across both, each brush's effect read back through the hook and each stroke a step of undo;
  - paint Rock, Grass, Sand and Snow at spots of their own;
  - use the terrain's form: on desktop, High typed a key at a time and Rock recoloured; by touch, a layer renamed;
  - add a plane with water, drawn see-through;
  - zoom out, by keys or a pinch, until the sculpted seams join chunks of two levels. Then the levels must rise with distance, finer near than far, with no gap at any seam and the drawn vertices on the grid's heights;
  - reload, and find the space's file, both PNGs' bytes and the hook's readings as they were.
- On desktop, an undo of Flatten puts the trench back and is drawn so; a redo fills it again.
- **`tools/cli/test/terrain.test.ts`** holds the fell fixture to `eb validate`, clean, and finds each check in a copy broken once for each.

## Open questions

1. Should a layer be a texture rather than a colour once M5.5 brings textures?
2. Should a terrain grow beyond 513 vertices a side, as several terrains side by side, when M5.9 streams exteriors in chunks?
3. Should Flatten take its height from a number the author types, as well as from the stroke's first dab?
4. On a phone the brush's ring shows only once a finger is down, so Radius is first seen as a stroke lands. Should the ring show in the middle of the view while Radius is dragged?
