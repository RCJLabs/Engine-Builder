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
- **Between vertices**, a height is read bilinearly, as the spike's `heightAt` reads it (M1.10). Outside the terrain, the nearest edge holds.

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
| W145 | a water component on an object that isn't a plane |

`eb validate` and the Problems panel both report them. The compiler reads a PNG's header only; it never decodes the image.

## The editor

- **Terrain tools** sit in the Scene panel's toolbar while a space is open. Without a terrain: a size and Add terrain. With one: Raise, Lower, Smooth, Flatten and Paint, the layer to paint, Radius and Strength, and Camera, which puts the pointer back to moving the camera.
- **While a brush is chosen,** one finger or the left button strokes; two fingers pan and pinch, and the right button orbits.
- **The terrain's form** opens from the tools in the inspector: spacing, low, high, and the layers' names and colours, with Add layer, Remove layer and Remove terrain. Changing `low` or `high` keeps each height in metres, clamped to the new range.
- **The view** draws the chunks with the layers' colours blended at each vertex, and water as a see-through plane of its colour.

## Open questions

1. Should a layer be a texture rather than a colour once M5.5 brings textures?
2. Should a terrain grow beyond 513 vertices a side, as several terrains side by side, when M5.9 streams exteriors in chunks?
3. Should Flatten take its height from a number the author types, as well as from the stroke's first dab?
