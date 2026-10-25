# Navigation (M6.2, D74)

NPCs walk on a navmesh baked in the editor, as Recast and Detour do it, through
[recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js) (MIT; Recast and Detour are zlib). The sim
says where an NPC is going; the stage's crowd walks it there and says when it arrives. A tap on the
ground walks the player there too.

## The navmesh

- **Baked for the player's body:** 0.35 m round, 1.8 m tall, a 0.35 m step and 40° slopes, as
  `src/walk/physics.ts` has them. A cell is 0.15 m across and 0.1 m high.
- **From the solids:** every collider the walk would make (boxes, spheres, capsules, hulls, placed
  models' colliders), through prefabs and overrides, and the terrain's heightfield. Moving solids,
  NPCs, zones and water are left out.
- **One tile, or tiles:** a space no more than 128 m across bakes as one tile; a bigger one as tiles
  of 128 cells (19.2 m), so a moor-sized space bakes in parts.
- **Measured (the spike, Node, recast-navigation 0.43.1):** `init` 32 ms; a 40 m square with three
  stalls baked as one tile in 37 ms to 17,976 bytes, the same bytes twice; twelve agents crossing it
  at 1.4 m/s in 1,526 fixed steps, 0.043 ms a step, never closer than their two radii, the same
  positions on a second run.
- **Its file**, `spaces/<id>.nav`:
  - `EBNV`, a version (1), the hash of its inputs as 16 hex digits, then Recast's own export.
  - **The inputs' hash** is `fnv1a64` over the canonical JSON of what the bake read: each solid's shape,
    place, turn and size, the terrain's settings and its heights file's bytes, and the agent.
  - The compiler works the same hash out (`navInputs.ts`, shared with the editor's bake). A file
    whose hash differs is W147: "Baked before the space's solids last changed: Bake navigation again".
  - A `.nav` file that isn't one, or names a space that isn't there, is E078.

## Goals and arrivals

- **`walk-to`** `{ "effect": "walk-to", "actor": "<actor>", "to": "<object path>" }`: the actor's goal
  becomes that object in the space it stands in. E079 when the actor stands in no space, or the
  object isn't in its space.
- **`world/npc-arrived`** `{ actor, at }`: raised when the stage says the actor has reached its goal
  (within 0.5 m on the navmesh). A sheet's row, a quest stage or a talk's condition can wait on it.
- **The fact** `world.npc-at(actor)`: the object path it last arrived at, undefined while walking.
- **The slice, version 3**, adds `npcs`: by actor, its space, where it last stood (feet and yaw), its
  goal and where it last arrived. Version 2 saves migrate with `npcs` empty, every NPC where it was
  placed; `glen-world-v2.json`, saved by version 2, must keep loading.
- **The stage says** where each NPC built stands with its `world/at`, as `world/npcs-at`, and each
  arrival at once. An arrival the sim refuses (a talk open, say) is said again with the next stand.

## The stage

- **`nav.js`**, beside walk.js, holds recast's wasm and the crowd. walk.js loads it once a space with
  a navmesh is walked.
- **The crowd:** one agent for each NPC built in the rings around the player (M5.10), stepping on the
  walk's fixed 1/60 s steps, 1.4 m/s at most. An NPC's solid follows its agent, kinematic. An NPC
  turns to face where it walks; one being talked to stops, faces the player (M6.1) and walks on after.
- **An NPC farther off** waits where it last stood, its goal kept, until its cell comes near.
- **Tap to move:** a touch that lifts within 300 ms and 10 px, not on a button, is a tap. On the
  navmesh's ground it sets the player's path, from their feet along Detour's corners, followed as if
  the stick were pushed toward the next corner; the stick, the keys or a pad end it, as does arriving
  within 0.3 m. A ring marks the target. On a computer a click still locks the pointer.
- **The hook,** `window.__ebWalk.nav()`: the navmesh's tiles and polygons, each NPC's agent (its
  place, velocity, goal and state), and the player's tapped path.

## The editor

- **Bake navigation** in the Scene toolbar, with the space open: baked in a worker, written as one
  undo step, the time it took said beside it. **Show navigation** draws the navmesh over the view.
- **W147** in the Problems panel opens the space with Bake navigation in reach.
- **`walk-to`'s form:** an actor, then an object of the space it stands in, picked from a list.
- **The hook,** `window.__ebViewport.nav()`: whether the open space has a navmesh, its tiles and
  polygons, and whether it is stale.

## The gate

- **The square** (`tools/cli/test/fixtures/square`): a market square with stalls, a well and a gate.
  A carter whose talk sends them from the gate to the well, round the stalls; twelve villagers who
  walk between the square's corners, each a sheet's row on `world/npc-arrived` sending them on.
  `square.test.ts` validates it clean and as format 11, and walks the carter and the villagers
  through recast in Node: each arrives, none comes within 0.25 m of a stall or of another's centre,
  and the arrivals reach the sim as events. It breaks it for W147, E078 and E079.
- **`square.spec.ts`** in the Play panel by keys: the carter sent by their talk and arriving, the
  villagers crossing, a save while walking loaded with each where it stood and going on.
- **`squarePhone.spec.ts`** at 360, 390 and sideways: the square crossed by a tap to the well, the
  stick taking over, every target 44 px.
- **`navEditor.spec.ts`**: a stall moved in the Scene panel, W147 shown, Bake navigation pressed and
  W147 gone; at 1280 and 390 wide.

## Open questions

1. Jumps and ladders as off-mesh links, between navmesh pieces a walk can't join.
2. Carving moving solids out at runtime (TileCache), declined for M6.2 (D74).
3. NPCs walking in cells far from the player, and over time while the player is elsewhere.
4. A click to walk on a computer, without losing the pointer lock that looks.
