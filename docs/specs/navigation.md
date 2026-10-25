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
- **Measured (the gate's square, Node, 2026-10-25):** 40 m across with three stalls, a well and two
  gateposts, baked by `pnpm bake` as one tile of 135 polygons, 19,317 bytes, in 84 ms. Walked
  headless, the carter and the twelve villagers there and back took 3,206 fixed steps (53.4 s of
  play), never closer than 0.60 m centre to centre, 0.41 m from a stall or 0.57 m from the well.
- **Its file**, `spaces/<id>.nav`:
  - `EBNV`, a version (1), the hash of its inputs as 16 hex digits, then Recast's own export.
  - **The inputs' hash** is `fnv1a64` over the canonical JSON of what the bake read: each solid's shape,
    place, turn and size, the terrain's settings and its heights file's bytes, and the agent.
  - The compiler works the same hash out (`navInputs.ts`, shared with the editor's bake). A file
    whose hash differs is W147: "Baked before the space's solids last changed: Bake navigation again".
  - A `.nav` file that isn't one, or names a space that isn't there, is E078. A space with a `.nav`
    that won't read still counts as having one for E079, so one bad file is one problem.

## Goals and arrivals

- **`walk-to`** `{ "effect": "walk-to", "actor": "<actor>", "to": "<object path>" }`: the actor's goal
  becomes that object in the space it stands in. E079 when the actor stands in no space, the
  object isn't in its space, or its space has no `.nav` ("open it and press Bake navigation").
- **`world/npc-arrived`** `{ actor, at }`: raised when the stage says the actor has reached its goal
  (within 0.5 m on the navmesh). A sheet's row, a quest stage or a talk's condition can wait on it.
- **The fact** `world.npc-at(actor)`: the object path it last arrived at, undefined while walking.
- **The slice, version 3**, adds `npcs`: by actor, its space, where it last stood (feet and yaw), its
  goal and where it last arrived. Version 2 saves migrate with `npcs` empty, every NPC where it was
  placed; `glen-world-v2.json`, saved by version 2, must keep loading.
- **The stage says** where each NPC built stands, as `world/npcs-at`, as it says the player's with
  `world/at`: every 5 s once one has moved 0.5 m, and as the shell pauses or the page hides. Each
  arrival goes at once. An arrival the sim refuses (a talk open, say) is said again a second later.
- **Never on offer:** like `world/trigger`, `use` and `at`, no button asks for `world/npcs-at`, so
  the session's guard on what is offered lets it through to the sim's own checks. Until the gate's
  e2e, it didn't: every stand the page sent was refused before the sim saw it, while the headless
  tests, which took actions straight, passed. Both gate tests now send through `act`, as the page.

## The stage

- **`nav.js`**, beside walk.js, holds recast's wasm and the crowd: a classic script of
  recast-navigation 0.43.1, 776 KB, 230 KB gzipped. walk.js loads it once a space with a navmesh is
  walked, by a script tag beside it or, in a single-file export, from the page's own `#eb-nav`.
  Bake navigation's worker fetches the editor's copy in runtime/ and runs it, so the editor bakes
  offline with the same Recast the walk uses.
- **The crowd:** one agent for each NPC built in the rings around the player (M5.10), stepping on the
  walk's fixed 1/60 s steps, 1.4 m/s at most. An NPC's solid follows its agent, kinematic. An NPC
  turns to face where it walks; one being talked to stops, faces the player (M6.1) and walks on after.
- **An NPC farther off** waits where it last stood, its goal kept, until its cell comes near.
- **Tap to move:** a touch that lifts within 300 ms and 10 px, not on a button, is a tap. On the
  navmesh's ground it sets the player's path, from their feet along Detour's corners, followed as if
  the stick were pushed toward the next corner; the stick, the keys or a pad end it, as does arriving
  within 0.3 m. A ring marks the target. On a computer a click still locks the pointer.
- **The hook,** `window.__ebWalk.nav()`: the navmesh's tiles and polygons, each NPC's agent (its
  place, velocity, goal, target and state), the player's tapped path, and each `world/npcs-at` sent
  with its arrivals and the sim's answer. `window.__ebWalk.screenOf(point)` says where a point of
  the space is drawn, so a test can tap it.

## The editor

- **Bake navigation** in the Scene toolbar's Navigation row, with the space open: baked in a worker,
  written as one undo step, the time it took, the tiles and the polygons said beside it. **Show
  navigation** draws the navmesh over the view.
- **W147** in the Problems panel opens the space; the Navigation row says the same in its words.
- **`pnpm bake <project> <space>`** bakes from the files in Node, through the same code
  (`apps/editor/src/nav/bakeProject.ts`): how the square's committed `.nav` was made.
- **`walk-to`'s form:** an actor, then an object of the space it stands in, picked from a list.
- **The hook,** `window.__ebViewport.nav()`: the navmesh Show navigation draws, as three has it
  (triangles, tiles and polygons), or null for none drawn.

## The gate

- **The square** (`tools/cli/test/fixtures/square`): a market square with stalls, a well and a gate.
  A carter whose talk sends them from the gate to the well, round the stalls; twelve villagers who
  walk between the square's corners, each a sheet's row on `world/npc-arrived` sending them on.
  `tools/cli/test/square.test.ts` validates it clean and builds it as format 11, its navmesh and
  thirteen actors packed, plays it through the session, and breaks it once each for W147 (a stall
  moved), E078 (a `.nav` that isn't one) and E079 (a walk-to of an object the space lacks).
  `apps/editor/src/walk/square.test.ts` walks the carter and the villagers through Recast in Node
  with the sim hearing every arrival: each arrives where it was sent and is sent on, none comes
  within two radii less 0.1 m of another (0.60 m measured) or 0.25 m of a stall or the well, and a
  fresh bake is the committed `.nav` byte for byte.
- **`square.spec.ts`** in the Play panel by keys: the carter sent by their talk, round stall 3 to
  the well, their arrival setting the flag the HUD shows; the twelve sent across by the market's
  zone, never meeting; a save while they walk back loaded with each where it stood.
- **`squarePhone.spec.ts`** at 360, 390 and sideways: the square crossed by a tap before the well,
  the stick taking over at once, the tap walked to its end; every target 44 px.
- **`navEditor.spec.ts`**: stall 1 moved in the inspector, W147 in the Problems panel and the
  Navigation row, Bake navigation pressed, a new hash in the `.nav` and W147 gone; at 1280 and 390
  wide.

## Open questions

1. Jumps and ladders as off-mesh links, between navmesh pieces a walk can't join.
2. Carving moving solids out at runtime (TileCache), declined for M6.2 (D74).
3. NPCs walking in cells far from the player, and over time while the player is elsewhere.
4. A click to walk on a computer, without losing the pointer lock that looks.
5. Whether the Scene toolbar should keep its open row (Navigation, Terrain) when a phone leaves the
   Scene panel and comes back: today the row shuts, and the spec opens it again.
