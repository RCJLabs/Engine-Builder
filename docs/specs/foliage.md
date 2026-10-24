# Foliage (M5.6, D68)

M5.6 is Phase 5's sixth milestone. It scatters models over a terrain: trees, bushes, grass and rocks, painted as density with brushes by mouse or finger and drawn instanced. Settled by D68: foliage is density in a PNG beside the space, scattered by a fixed seed; a foliage type is a record; Plant, Clear and Fill now, wind later; the gate is by machine.

Nothing here runs in a game yet, as for the terrain it grows on ([terrain.md](terrain.md)): M5.6 is data, checks, brushes and drawing in the editor's view. M5.8 brings physics, and with it the question of plants that block.

## The foliage record

The engine's tenth record type, beside flag, sheet, sound, ambience, music, environment, material and model. Only `model` is needed.

| Field | Kind | Left out | Meaning |
| --- | --- | --- | --- |
| `name` | text | the id | |
| `model` | ref model | required | What is scattered |
| `density` | number 0.01–400 | 10 | Plants per 100 m² where it is painted fully |
| `smallest`, `largest` | number 0.05–20 | 0.8, 1.2 | Each plant's size is between them, times the model's own scale |
| `turn` | yes or no | yes | Each plant turned at random about its upright |
| `lean` | number 0–1 | 0 | 0 stands upright, 1 stands square to the ground |
| `steepest` | number 0–90 | 90 | No plant on ground steeper than this many degrees |
| `lowest`, `highest` | number, metres | none | No plant on ground below or above them |
| `distance` | number 5–5000 | 200 | Drawn up to this many metres from the camera |

The presets, which Start from above a foliage record's form writes, keeping its name and model:

| Preset | Density | Size | Lean | Steepest | Distance | The kit's model |
| --- | --- | --- | --- | --- | --- | --- |
| Trees | 2 | 0.8–1.3 | 0 | 35 | 400 | `kit-pine` |
| Bushes | 8 | 0.7–1.2 | 0.2 | 40 | 200 | `kit-bush` |
| Grass | 150 | 0.6–1.3 | 1 | 45 | 60 | `kit-grass` |
| Rocks | 3 | 0.5–1.8 | 1 | 90 | 300 | `kit-rock-small` |

Every preset turns its plants. The starter kit gains `kit-grass`, a tuft of blades, for the grass preset: 21 pieces.

## Foliage in a terrain

A terrain's settings gain `foliage`, up to four foliage record ids, after `layers`:

```json
"terrain": {
  "size": 129, "spacing": 1, "low": -10, "high": 40,
  "layers": [{ "name": "Grass", "color": "#5f8f3e" }, { "name": "Rock", "color": "#8a8580" }],
  "foliage": ["glade-trees", "glade-grass"]
}
```

- **The density file**, `spaces/<id>.foliage.png`, sits beside the heights and the paint while `foliage` lists one at least: 8-bit RGBA, `size` × `size`, row `j` the vertices at that `z`, column `i` at that `x`, as the paint's. Channel `k` (red, green, blue, alpha) is foliage `k`'s density, 0 to 255. Unlike paint, the channels don't share: each is its own.
- **Between vertices** a density is read bilinearly from the four around it.
- **A new foliage** starts at 0 everywhere. Removing foliage `k` moves the later channels down one, as removing a paint layer does, so each keeps its plants.
- The editor writes the file as the first foliage is added and takes it as the last is removed, or the terrain is.

## The scatter

Where each plant stands is worked out, never stored. For each of a terrain's foliage types, with its record's fields:

1. **Cells.** A cell is `c = 10 / √density` metres a side, so a fully painted cell holds one plant. Cells tile the terrain from its −x, −z corner: cell `(u, v)`'s corner is at `(−e + u·c, −e + v·c)`, where `e` is half the terrain's width, for `u` and `v` from 0 up to the last corner inside it.
2. **Draws.** Each cell has five numbers in [0, 1), from a 32-bit hash: splitmix32 (as `@eb/core`'s rng seeds sfc32) started from the FNV-1a hash of the foliage record's id, mixed with `u` and `v`. They are `keep`, `x`, `z`, `turn` and `size`, in that order. The same record, cell and terrain give the same plant in every browser.
3. **Where.** The plant is at the corner plus `(x·c, z·c)`. Outside the terrain there is none.
4. **Whether.** It stands when `keep` is below its density there over 255. So painting more only adds plants and painting less only takes them, and nothing already standing moves.
5. **The ground.** Its height is the terrain's `heightAt` on the triangles drawn at full detail. The triangle's slope (`gx`, `gz`, rise over run) is too steep when `gx² + gz²` is above `tan²(steepest)`. Too steep, below `lowest` or above `highest`: no plant.
6. **How.** Its size is `smallest + size × (largest − smallest)`, times the model's scale. With `turn`, it is turned `turn × 360°` about its upright. Its upright is the world's up moved `lean` of the way to the ground's normal.

- **Grouped by chunk.** Each plant belongs to the terrain chunk (terrain.md) it stands in, so a stroke scatters again only the chunks its dabs reached.
- **A chunk with no density** in a type's channel isn't scattered for it at all.
- **At most 200,000 plants** of each type in a space: the scatter stops there, and the view says so in the console.

## Brushes and Fill

The terrain's row gains two brushes, acting on the foliage type chosen:

| Brush | One dab does |
| --- | --- |
| Plant | adds `strength × falloff × 255` to its density |
| Clear | takes the same away |

- **Their dabs** are the terrain brushes': the same radius, strength, falloff `(1 − (d / r)²)²` and spacing along a stroke. A density stays within 0 and 255. Each stroke is one step of undo, written as the pointer lifts.
- **Fill** sets the chosen type's density at every vertex at once: Everywhere (255), Nowhere (0), or from a paint layer's weight there ("Where Grass is": the grass grows where Grass is painted, as thick as it is painted). One step of undo, "Fill Glade, grass from Grass".

## Drawing

- **Instanced, by chunk.** For each chunk, each foliage type is drawn as one instanced mesh for each mesh in its model, with the model's materials and slots as a placed model draws them (models.md).
- **Detail by distance.** A chunk draws a type at the model's LOD level for the distance from the camera to the chunk's centre, as the model's own `lod` sets it, and not at all beyond the type's `distance`.
- **Drawn again** when what it is drawn from changes: a stroke's chunks as its dabs land, and the chunks an undo or a Fill changed; every chunk, scattered again on the next frame, when the terrain's list or settings or a type's record change; and a type's chunks when its model is drawn otherwise (decoded, or its LOD levels, slots or scale changed).
- **The model** is drawn as a placed model is (models.md): read with the space's models, though nothing places it, decoded once, and cut into its LOD levels by the simplifier. Until its file is decoded, its plants stand scattered but undrawn.

## Checks

| Code | When |
| --- | --- |
| E058 | (M5.1's) a terrain's `foliage` lists more than four, or one twice, or isn't ids |
| E067 | (M5.3's) the foliage file is missing while `foliage` lists one, isn't a PNG, or isn't 8-bit RGBA of `size` × `size` |
| E073 | a terrain's `foliage` names a foliage record there isn't |
| E074 | a foliage record's `smallest` is above its `largest`, or its `lowest` isn't below its `highest` |
| W144 | (M5.3's) a foliage file whose space has no terrain, or whose terrain lists no foliage |
| E005 | a foliage record's `model` isn't a model record (as for any ref) |

`eb validate` and the Problems panel both report them. The compiler reads the PNG's header only. A space using a foliage record is one of its uses: the record's form lists it under In spaces, and renaming the record rewrites the terrain's list.

## The editor

- **Records** lists Foliage after Model, with Start from and the four presets above its form.
- **The terrain's form** gains Foliage: each type the terrain lists, with its record's name, Open and Remove; then Add foliage, a picker of the project's foliage records it doesn't list yet and New from Trees, Bushes, Grass or Rocks. A new one is a record named after the space and the preset (`glade-trees`, "Glade, trees"), its model the preset's kit model when the project has it, else its first model record, else none (E005 shows on its form). Each is one step of undo with the list.
- **The terrain's row** gains Plant and Clear after Paint, once the terrain lists a foliage type. With either chosen, it holds the type to paint, and Fill, a menu of Everywhere, Nowhere and each paint layer.
- **The view's hook** (`window.__ebViewport`) adds:
  - `foliage()`: for each of the terrain's types, its foliage and model ids, where each of its model's levels starts as drawn now (none until the model is decoded), the plants scattered, the plants drawn now, whether the scatter stopped at its most, and each chunk's plants, LOD level (−1 when not drawn) and distance;
  - `plantsNear(foliage, x, z, radius)`: how many of a type's plants stand within `radius` metres of a point.

## The gate

- **`foliage.spec.ts`** on desktop, by mouse and keys, and **`foliagePhone.spec.ts`** by touch at 360×740, 390×844 and 844×390 start from an empty project. They:
  - add the starter kit, make a space and give it a 129-vertex terrain, and paint Rock at a spot of its own;
  - in the terrain's form, add foliage new from Trees and from Grass, the kit's pine and grass;
  - plant trees in a stroke 32 m long with a brush 10 m across, then clear across its middle: fewer trees within 30 m of the row, more than none, and an undo puts every one back;
  - fill the grass from Grass: grass on open ground and none within 0.75 m of the Rock's middle;
  - give the kit's pine a LOD level in its form, half its triangles from 40 m (it has none, under 1,000 triangles), after its trees are drawn, so they take it up only by drawing their model again;
  - read the counts near and far: every tree chunk at the level its distance gives, some whole, and some grass drawn; zoomed out until the camera is 150 m off, past the grass's 60 m from every chunk, no grass drawn and every chunk's level −1, every grass plant still scattered, and every tree still drawn, at the pine's second level;
  - reload, and find the terrain's list, the density file's bytes, both records, each type's plants by chunk and the trees by the row as they were.
- **`tools/cli/test/foliage.test.ts`** holds the grove fixture to `eb validate`, clean, and finds each check in a copy broken once for each.
- **Unit tests** hold the scatter to its rules: the same plants every time, painting more only adding, each type reading its own channel, the slope and height limits, the turn, size and lean, the cap, and one chunk scattered alone giving that chunk's plants of the whole. Others hold Plant and Clear to their channel and to 0 and 255, a stroke's undo, the edits (added, filled, taken out with the later channels moved down, made new, Start from), a chunk's level and the count near a point, the foliage's models read as placed ones are, and a rename reaching the terrain's list.

## Open questions

1. **Wind** (D68, later): grass and leaves swaying in a wind the environment sets.
2. **Plants that block** (M5.8): if trees get colliders, should the scatter move into a pure package so the sim knows where they stand? It already uses integer hashing and plain arithmetic, all but the slope limit's `tan²`.
3. **More than four types** a terrain: a second file, as paint would need.
4. **Foliage on models** rather than terrain, such as moss on a rock or flowers in a planter.
5. **A density map is as fine as the terrain's vertices**, so at 4 m spacing a meadow's edge is blocky. Should density have its own resolution?
6. **Baked into an export** (M5.7), if scattering as a space loads is dear on a phone.
