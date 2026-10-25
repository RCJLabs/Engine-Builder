# Streaming and snapping (M5.10, D72)

A space as wide as a small world, walked without building all of it: the walk builds what is near
the player and draws only the models of what is far. And snapping, so a modular kit's pieces meet
in the Scene panel without aiming to the millimetre.

Nothing here changes a file, a pack or a save. A space is the same file it was; the walk decides
what to build of it, and the Scene panel draws all of it, as before.

## Cells

- **A cell is 64 m square**, on x and z, from the space's origin: cell `(i, j)` holds
  `i × 64 ≤ x < (i + 1) × 64` and `j × 64 ≤ z < (j + 1) × 64`.
- **What streams is a top-level object** of the space's file: a shape, a placed record, or a
  placement of a prefab with everything inside it. Each is built whole or not at all.
- **An object's footprint** is its place on x and z widened by its reach, and it is in every cell
  its footprint touches:
  - a shape's reach is half the diagonal of its scale on x and z;
  - a placed model's is its collider's reach, or half a metre, times its scales;
  - a placement's is the farthest any object inside it reaches, from the placement's place.
- **The terrain and the environment** are always whole: the terrain draws its chunks at their
  levels (terrain.md) and is one heightfield in Rapier. Foliage is drawn to its reach (foliage.md).

## The rings

- **Near:** the player's cell and the eight around it. Everything of an object in them is built:
  - drawn as the Scene panel draws it, its models' levels picked by distance;
  - solid in Rapier, its moving bodies falling and pushed;
  - its trigger zones heard and its uses offered.
- **Kept:** an object stays built until none of its cells is within two of the player's, so walking
  along a cell's edge doesn't build and unbuild the same things.
- **Far:** an object not near whose footprint comes within the tier's view distance of the player
  draws its models only:
  - at their coarsest level: the last of its record's LOD levels, or the model itself without them;
  - as instanced meshes, one draw for each mesh of each model and material set in use;
  - with no physics, zones, uses, lights or shapes;
  - water too, as a lake far off is part of the land.
- **The view distance** is a tier's (performance.md): 250 m at Low, 400 m at Medium, 600 m at High.
- **Fog** closes at the view distance, from 60% of it, in the environment's fog colour, or in the
  sky's when it has none, wherever the environment's own fog doesn't close nearer. Past it nothing
  is drawn but the terrain and the sky.

## Building

- **As the player crosses into another cell,** the near and far sets are worked out again: the
  objects to build, those to take down, and the far instances.
- **Bodies** come and go at once: an object taken down leaves Rapier, one built joins it.
- **Drawing is spread over frames:** each frame builds near objects for at most 4 ms, at least one,
  nearest first. A cell entered is at least 64 m from the cells it brings in, so at a run, 13 s.
- **Before the walk starts,** the near ring around where the player stands is built whole, under
  the loading screen (worldspaces.md). A respawn builds the ring around the spawn before the next step.
- **A moving body** belongs to its authored place. When that place's cells are taken down, it goes,
  and it comes back at its authored place, as a load puts it (worldspaces.md, question 1).
- **What is taken** is built and hidden, as before, so the view's hook still finds it hidden.
- **A space smaller than a cell's ring** is built whole at the start and nothing more happens, so
  every space walked before M5.10 walks the same.

## The hook

`window.__ebWalk.cells()` gives:

| Field | What it is |
| --- | --- |
| `cell` | the player's cell, `[i, j]` |
| `near` | the ids of the objects built, sorted |
| `drawn` | of those, the ids drawn so far, sorted |
| `waiting` | how many near objects are still to be drawn |
| `far` | how many far models are drawn, in how many instanced meshes, and the LOD level each mesh draws |
| `bodies` | how many bodies Rapier holds, the character's left out |
| `zones`, `uses` | how many trigger zones are heard and uses offered |
| `view` | the view distance in metres |
| `farthest` | how far off the farthest object drawn far is, by its footprint's edge |
| `slowest` | the longest a spread frame's building took, in ms; a ring built whole is left out |

## Snapping

The Scene panel's Snap (viewport.md) becomes three things:

- **The grid's step,** chosen beside Snap: 0.25, 0.5, 1 or 2 m, 0.5 at first, kept on the device
  as Quality is. Turns keep 15° and scales 0.1.
- **Bounds snap,** while a move arrow or plane square is dragged:
  - The box of what is moved (the chosen objects' boxes joined, along the world's axes, as three
    draws them, marks and labels left out) latches onto another object's box in the open file:
    - *touching*, a face against the other's opposite face;
    - *flush*, a face in line with the other's same face.
  - On each axis the drag moves along, the nearest latch within 12 px on screen wins, and the grid
    takes an axis that didn't latch.
  - The box latched to is drawn as a wire while the drag holds.
  - Snap off, or Ctrl or ⌘ held to flip it, turns both off.
- **Drop,** a toolbar button, stands each chosen object on what is under it:
  - the highest top of another object's box under its footprint, below its bottom;
  - else the terrain's highest under its footprint's corners and middle, so it is never sunk;
  - else 0 m.
  - It is one step of undo; with several chosen, each lands as if the others weren't moved.
- **The hook** (`window.__ebViewport`) adds `boxes()`, each top-level object's box, and
  `latched()`, the drag's latches now: the axis, the object latched to, touching or flush.

## The gate

- **The moor** (`tools/cli/test/fixtures/moor`): a terrain 1,024 m across (257 vertices, 4 m
  apart), and cottages, fences, rocks, pines and lamp posts from the starter kit spread over it,
  about 1,350 objects in all 256 cells; a road north from the spawn; a cairn whose zone sets a
  flag, 158 m along it; a chest on the road past it to take by Interact, in a cell the start
  doesn't build.
  - It is written by a generator (`pnpm make:moor`) and held to it byte for byte; it validates
    clean and builds as format 10.
  - `streaming.test.ts` walks it headless through Rapier: along the road to the cairn and the
    chest, and carried corner to corner, the ring's cells and objects as the spec says at each
    cell, bodies only for what is near, the ground under the feet at every step, the cairn's zone
    heard once its cell is built, the chest offered once it is.
  - The plain parts have their own tests: `cells.test.ts` (cells, footprints, the streamer),
    `nearObjects.test.ts` (the 4 ms a frame on a stepped clock), `streamingStage.test.ts` (a ring
    built whole after a jump of more than a cell) and `fog.test.ts`.
- **`streaming.spec.ts`** walks it in the Play panel by keys and the mouse, and
  **`streamingPhone.spec.ts`** by touch at 360, 390 and sideways:
  - the start's ring built under the loading screen;
  - along the road, two cells crossed, each crossing building the next ring and taking down what
    left the kept one, through `cells()`;
  - far models drawn as instances and none past the view distance;
  - the cairn's zone heard once its cell is built, and its flag on the HUD;
  - the chest taken.
  - The slowest frame's building is a reading, not a pass mark.
- **`snapping.spec.ts`** by mouse and keys, and **`snappingPhone.spec.ts`** by touch at 360, 390 and
  sideways, build a hut from the starter kit in a new project:
  - a floor; a wall and a doorway, each dragged towards the floor's opposite edges until it
    latches flush, read back from the file to the millimetre (±0.9 m, off the 0.5 m grid);
  - a roof, a second floor, latched flush over the floor and then touching the walls' tops, at 2.5 m;
  - the step at 1 m: the roof moved up lands at 4 m, where a 0.5 m step would stop at 3.5;
  - Drop putting it back on the walls at 2.5 m;
  - on desktop, an undo and a redo of the Drop, and a reload, the file and the step as they were.

## Open questions

1. A terrain wider than 513 vertices, as tiles side by side, waits until a world needs one (D72).
2. Far models are instanced by model; a far cell's pieces merged into one mesh would cut draws further.
3. A point light in a cell built or taken down changes how many lights three's shaders hold, which
   recompiles them: a hitch a phone may feel.
4. A model with no collider reaches half a metre, 1 m across, for its cells: one wider than a cell may be
   left unbuilt at its edge.
5. The view distances, the 4 ms a frame and the 12 px latch are first guesses until a phone walks
   the moor and builds the hut.
6. Bounds snap uses boxes along the world's axes: a piece turned 45° latches by its box, not its faces.
