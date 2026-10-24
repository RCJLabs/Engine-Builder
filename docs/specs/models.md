# Models and materials (M5.5, D67)

How a 3D model comes into a project, what it is as data, how a space draws it, and the starter kit.
Settled by D67: the editor reads Draco, Meshopt and KTX2 and packs geometry with Meshopt on import;
a model and a material are records; the starter kit is made by a script here and dedicated to CC0;
the gate is by machine.

## The records

### `material`

The engine's eighth record type, beside flag, sheet, sound, ambience, music and environment. Every
field may be left out.

| Field | Kind | Left out | Meaning |
| --- | --- | --- | --- |
| `name` | text | the id | |
| `color` | colour | `#b0b0b0` | The base colour |
| `roughness` | number 0–1 | 0.8 | 0 a mirror, 1 chalk |
| `metalness` | number 0–1 | 0 | 1 for bare metal |
| `emissive` | colour | `#000000` | The colour it glows |
| `emissive-strength` | number 0–10 | 1 | How bright the glow is |
| `opacity` | number 0–1 | 1 | Below 1, drawn see-through |

The presets, which Start from above a material's form writes, keeping its name, as environments'
do:

| Preset | Colour | Roughness | Metalness | Other |
| --- | --- | --- | --- | --- |
| Wood | `#8a5a35` | 0.8 | 0 | |
| Stone | `#8d8a84` | 0.95 | 0 | |
| Metal | `#b8bcc2` | 0.35 | 1 | |
| Painted | `#c4473a` | 0.5 | 0.1 | |
| Plastic | `#e4e4e4` | 0.45 | 0 | |
| Glass | `#cfe8f0` | 0.05 | 0 | opacity 0.35 |
| Glow | `#ffd27a` | 0.6 | 0 | emissive `#ffb84d`, strength 3 |
| Ground | `#6b5a43` | 1 | 0 | |

### `model`

The engine's ninth record type.

| Field | Kind | Left out | Meaning |
| --- | --- | --- | --- |
| `name` | text | the id | |
| `file` | asset (model) | required | A `.glb` or `.gltf` under `assets/` |
| `scale` | number 0.001–1000 | 1 | Applied to the whole model |
| `materials` | list of { `slot`: text, `material`: ref material } | none | Each of the file's materials, by its name in the file, drawn with a material record instead. Slots not listed are drawn as the file has them |
| `lod` | list of { `ratio`: number 0.01–0.99, `from`: number 0.1–10000 }, up to 3 | none | Each level keeps `ratio` of the triangles and is drawn from `from` metres away |
| `collider` | group | none | Its `shape`, and the numbers that shape needs, in the model's own metres before `scale` |

The collider's shapes:

| `shape` | Needs | |
| --- | --- | --- |
| `box` | `center` [x, y, z], `size` [x, y, z] | |
| `sphere` | `center`, `radius` | |
| `capsule` | `center`, `radius`, `height` | Upright, along y; `height` is the whole length, caps included |
| `hull` | `points`, 4 to 64 of [x, y, z] | Convex: the physics wraps the points |

## The checks

`eb validate` and the Problems panel read a model's file as far as its glTF JSON: a GLB's first
chunk, or the `.gltf` itself. Nothing is decoded.

| Code | When | Where |
| --- | --- | --- |
| E018 | The file isn't in `assets/` | `/file` (as for any asset field) |
| E070 | The file isn't glTF 2.0 that the engine can draw: not a GLB or glTF JSON, not version 2, an extension it requires that the engine doesn't read, or a buffer or image it names that isn't beside it | `/file` |
| E071 | The LOD levels don't each keep fewer triangles from farther away: a ratio not below the one before, or a `from` not beyond it | `/lod/<i>/ratio` or `/lod/<i>/from` |
| E072 | A collider without the numbers its shape needs, or with ones it doesn't use | `/collider/<field>` |
| W146 | A material slot the file has no material of that name for | `/materials/<i>/slot` |
| E005 | A slot's material that isn't a material record | (as for any ref) |

The extensions the engine reads, as three's GLTFLoader does and the import's reader does:
`KHR_draco_mesh_compression`, `EXT_meshopt_compression`, `KHR_mesh_quantization`,
`KHR_texture_basisu`, `KHR_texture_transform`, `EXT_texture_webp`, `KHR_materials_emissive_strength`,
`KHR_materials_unlit`, `KHR_materials_ior`, `KHR_materials_specular`, `KHR_materials_transmission`,
`KHR_materials_clearcoat`, `KHR_materials_sheen`, `KHR_materials_volume`, `KHR_lights_punctual`.
Any other in `extensionsRequired` is E070; any other merely used is drawn without it.

The provenance checks (E019 to E021) hold for a model's file as for any asset.

## Import

The Assets panel's import, given a `.glb`, or a `.gltf` with its `.bin` and images in the same pick:

1. In a worker, gltf-transform reads the file, decoding Draco with three's own copy of the Draco
   decoder (its wrapper and wasm from the editor's files, made only when a file uses Draco) and
   Meshopt with meshoptimizer's. KTX2 images are kept as they are.
2. It reorders each primitive for the vertex cache with meshoptimizer's `reorderMesh`, dropping
   vertices no triangle uses; quantises positions to 16 bits inside each mesh's bounds, which a node
   of its own beneath each node that draws it carries (as gltfpack does), and texture coordinates
   within 0 to 1 to 16 bits (`KHR_mesh_quantization`); and compresses every buffer view with Meshopt
   (`EXT_meshopt_compression`, required), normals through its octahedral filter at 8 bits. A
   primitive sharing its vertices with another isn't reordered, and a skinned or morphed mesh isn't
   quantised. Draco is gone from what it writes. The same file gives the same bytes.
3. It writes one `.glb` with everything inside it, to `assets/models/<name>.glb`, whatever the
   file was called (a `.gltf` and its files become one GLB, so nothing beside it can go missing).
4. The provenance entry is the import form's, with the edit "Geometry packed with Meshopt on
   import" added.
5. With Make a model ticked (the default), a `model` record named after the file: its file, no
   material slots (all drawn as imported), and a box collider fitted to the mesh. A model over
   1,000 triangles gets LOD levels: 0.5 from 15 m, 0.25 from 30 m, 0.1 from 60 m.

The import's limits are M2.7's: 25 MB a file (a model and the files its `.gltf` names together)
and 50 MB a pick. A pick can mix models and other files: the files a `.gltf` names go inside its
GLB, and the rest are imported as any file is. A `.gltf` whose files weren't picked with it, or
that isn't JSON, is refused before anything is packed, saying why. Models are packed one after
another; one that can't be packed stops the import before anything is written. Everything else,
the GLBs, their log entries and the records, is one step of undo. One model imported opens its
record. Each packing's sizes, triangles and time go to the console.

## Placing and drawing

- **A placed model record** (`"record": "model:crate"`) is drawn as its file's scene, scaled.
- **A placed record of another type** is drawn as a model if its type has a top-level field that
  refers to `model` alone and the record sets it: the first such field in the type file. An item
  with a `model` field is drawn as its model wherever it is placed. Any other placed record is
  M5.2's marker.
- **Add** in the Scene panel's toolbar gains Model…, which lists the project's model records.
- **Materials:** each slot listed is drawn with its material record's values; the rest as the file
  has them.
- **LOD:** each level is made as the model is first drawn: meshoptimizer's simplifier keeps
  `ratio` of each primitive's indices, sharing its vertices, so the same file and ratio give the
  same mesh. three's `LOD` picks the level by the camera's distance.
- **The collider** is drawn as a wire shape while the object is chosen, as M5.2's collider marks are.
- **Loading:** the loaders (GLTFLoader, DRACOLoader, MeshoptDecoder, KTX2Loader) and their wasm load
  with the first model drawn, from the editor's own files, never with the Scene panel. Only the
  Draco files the view names are shipped: the ones three's DRACOLoader names itself, an asm.js
  fallback and the glTF build, are blanked as the editor is built. Each file is
  decoded once, again only when its bytes change (a hash of them), and cloned for each placement.
  A placement whose file is still decoding draws M5.2's marker; one three can't decode says so in
  the console and keeps the marker.
- **Overrides:** placements are walked as the view walks them, through prefabs, so a placement's
  overrides of a placed model's fields (its scale, say) are drawn, and so is an override of the
  field that names the model.

## The model's form

Above a model record's form:
- the file's facts (triangles, materials, textures, extensions);
- each of the file's materials with a picker of material records, which writes `materials`;
- **Fit collider**: Box, Sphere, Capsule, Hull. Each measures the decoded mesh, every node's
  transform applied, and writes `collider`. A hull keeps at most 64 points, the farthest first.

## The starter kit

- `tools/starter-kit/` builds about 20 pieces from boxes, cylinders and cones in code: floor, wall,
  doorway, window wall, stairs, ramp, pillar, crate, barrel, fence, gate, rocks (two), pine, oak,
  bush, lamp post, table, bench and chest. Each part is named by its material: `wood`, `stone`,
  `metal`, `painted`, `leaves`, `glow`.
- It writes `starter-kit/` at the repo's root as a project folder that `eb validate` holds to no
  problems: `assets/starter-kit/<piece>.glb` packed as import packs, `records/model/kit-<piece>.json`
  with each slot given its kit material and a fitted collider (a hull for the ramp and the rocks, a
  capsule for the barrel and the trees, a sphere for the bush, a box for the rest),
  `records/material/kit-<name>.json` from the presets of the same name and a green for `leaves`,
  which no preset is, `assets/assets.json`, the log whose entries join a project's (licence
  `CC0-1.0`, author RCJLabs, tool the script, source this repo), and its own `project.json`, which
  stays behind. The ramp is a wedge, the one shape that isn't a box, cylinder or cone.
- The script's output is held to the committed files byte for byte.
- **Add starter kit** in the Assets panel copies the kit into the open project in one step of undo,
  skipping a file the project already has.

## The hook

`window.__ebViewport.models()` gives each placed object drawn as a model:
`{ object, model, level, levels, triangles, collider, materials, textures, wire }`. `level` is the
LOD level drawn now (0 the whole mesh), `triangles` the triangles it draws, `collider` the record's
shape and its numbers, `materials` each slot's colour as drawn, read back from three, `textures`
the textures its materials draw with (a KTX2 three couldn't read leaves none), and `wire` whether
its collider's wire is drawn.

## Open questions

1. Should an import over a size budget be refused, warned or packed harder? M5.7 sets budgets.
2. Should LOD be baked into an exported game (M5.7 or M5.8) instead of made at load?
3. Should a material carry textures (a colour map and a normal map), and should terrain layers
   (terrain.md question 1) use material records?
4. Should models be drawn as thumbnails in the Assets panel?
5. Animated models: glTF animations are read and kept, but nothing plays them until Phase 6.
6. No test reads a Basis-compressed KTX2 (ETC1S or UASTC): the repo has no Basis encoder, so the
   tests' KTX2 is the uncompressed RGBA8 form, which three reads without the transcoder. A fixture
   made once with a Basis encoder, committed with its provenance, would cover the transcoder's path.
7. A file that comes in as Draco is two to two and a half times the size once packed with Meshopt,
   and a tenth to a sixth bigger once both are gzipped; one that came in as Draco packs worse than
   one that came in plain (Readings). If a game's download matters more than a phone's decode time,
   should import keep Draco geometry as it came?
8. Should New material from (a picker of presets that makes a record, as New environment does)
   join the slot pickers, so a material can be made where it is used?
