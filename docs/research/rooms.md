# Side-view rooms: what Evan's games already do (M7.3)

How afterglass, dirtbag and space-wrecked lay out rooms and floors, read on 2026-10-27 to design M7.3's side-view rooms. The decisions it led to are D85; the design is [specs/rooms.md](../specs/rooms.md). Facts carry their file and line; opinions are marked as such. Nothing of afterglass's art or text is copied: the keep M7.3 builds is drawn fresh.

## afterglass: the keep

The only side view with floors and stairs in any of them, and the one M7.3 follows.

- **The layout is part of the save** (`prototype/src/slice/geo.js:1-5`): floors listed top to bottom, two rooms each, a room `{ id, type }` and `type: 'empty'` a bare hall (`geo.js:17-25`). Building a floor adds a new floor 0 at the top, so every floor's index shifts by one.
- **Two slots a floor, the same on every floor** (`geo.js:24`, `slice/data.js:965-1000`): 48 art pixels each, a 4 px wall between them, in a world 112 px wide. A room is 20 px tall and floors are 22 px apart, the slab under the room included (`geo.js:12`).
- **A room's type** gives it a capacity of up to three workers (`data.js:297`, `sim.js:631-634`), the furniture drawn in it and what may hang there.
- **Stairs are not rooms** (`geo.js:27-33`): each pair of floors gets two ladders at x positions from a table per level, taking no slot. The keep tops out at eleven floors.
- **Routes** (`geo.js:155-199`): Dijkstra by linear scan over a few points, the start, each goal and both ends of every stair. Walking along a floor costs |dx|; a climb costs 9 (6 for a Creeper). Several goals may be given and the nearest wins. A creature may be kept off warded or lit stairs, and light may add a cost. A step is `{ f, x }` to walk to, or `{ f, x, climb }`.
- **Movement** (`sim.js:2429-2460`): walking at a speed in pixels a second; a climb takes a fixed time, 1 s or 0.5 s (`data.js:139-140, 222-223`), and the renderer slides the climber between floors (`geo.js:283-293`).
- **Building happens in play, by day** (`sim.js:4240-4350`): raising a room into a bare hall or a new floor on top, at a cost in stone that grows above the seventh floor; tearing down gives half back; two rooms swap for a price. Some rooms have floors of their own (the Gatehouse only at the ground, the Lampworks from floor 8 up). No support rule; neighbours matter only to fire, which spreads along a floor or straight up and down (`sim.js:1802-1806`).
- **Drawing** (`slice/draw.js:22-35, 353-379`; `px/kit.js:125-131`): Canvas with smoothing off; each room a flat wall colour with specks and a 2 px floor, tinted by type, its furniture drawn in code clear of the ladders; the keep painted once into a layer. The largest whole scale that fits the width.

## dirtbag

- **Scenes are one ground line** (`app/src/view/layout.ts:16-22, 49-70`): a scene is a place, a width, a spawn and hot spots, each with where to stand and which way to face. Movement is along x only (`game/game.ts:761-785`). No floors and no stairs.
- Opinion: nothing to port for rooms; its strangers fitted into the gaps between hot spots (`layout.ts:486-512`) is a one-dimensional fit that a room's stations might use later.

## space-wrecked: the ship builder

- **Top-down, not a side view** (`src/sim/builder.js:2-4`): modules with a size, a rotation and tags placed on a frame's grid.
- **Its placement checks** (`builder.js:65-91, 376-474`): an error with its rule, a message and the modules involved, for a bad type, a cap, bounds or overlap; then whole-ship checks, everything connected to the bridge among them. Doorways are worked out, one in the middle of each shared wall.
- Opinion: a room's checks should read the same way (which rule, which rooms), and M7.6's builder (D87) can take its plan-then-apply and its "connected to a root" check.

## What M7.3 takes

- **afterglass's model:** floors of equal slots, ladders that take no slot, and routes through the stairs by walking distance and a climb cost. Evan chose rooms that span one slot or more, stairs placed by the author, and building in the editor only (D85).
- **Floors counted from the ground up,** not afterglass's top down, so adding a floor renumbers nothing a save holds.
- **Whole numbers and a stated tie-break** for routes, where afterglass uses floats and breaks ties by the order of its stairs.

## Open questions

1. Doors between rooms on a floor: afterglass's walkers pass freely; a locked room is M7.6's builder's (D87).
2. Routes that avoid a stair (afterglass's wards and light): a per-walker filter belongs with the kit that needs it.
