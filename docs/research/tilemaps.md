# Tilemaps: what Evan's games already do (M7.2)

How space-wrecked, 2060td and landnam lay out grids, read on 2026-10-27 to design M7.2's tilemaps. The decisions it led to are D84; the design is [specs/tilemaps.md](../specs/tilemaps.md). Facts carry their file and line; opinions are marked as such.

## What none of them has

- **No tile images.** All three draw their grids in code: Space-Wrecked's battle maps as 3D in its own renderer, 2060td as vector glyphs and a baked ground, landnam as SVG. So M7.2 defines the tileset format, and it comes from no game.
- **No 47-tile blob autotiling.** The only joins in any of them are 2060td's four neighbours (`src/game/glyphs.ts:76-84`).

## space-wrecked: the battle maps

The fullest grid rules, and the map Proof #3 rebuilds (M7.10, D87).

- **The text format** (`src/sim/mapText.js:1-40`): two characters a tile each way. Even lines are edge rows: a tile's north edge at odd columns (`-` a wall, `=` the hull, `/` a door, `o` a hatch), `+` where edges meet. Odd lines hold a tile's west edge at even columns (`|` a wall, `I` the hull, `/`, `o`) and the tile itself at odd columns. Trailing spaces may be left off; a map is 2 × height + 1 lines, its width the widest line's half.
- **Tiles by character.** The ship's interiors (`data/modules.json`, `tiles`: `.` floor, `h` half cover, `H` full cover, `#` machinery, `c` console, `a` airlock) and the planet sites (`src/sim/gen/site.js:21-34`, adding `%` rock and marks for entries, spawns and loot). A blank tile is space.
- **Tile rules** (`data/tiles.json`): `walk`, `cover` (`half` or `full`) and `blocksSight`, nothing else.
- **Edges** (`src/sim/terrain.js:22-41`): a wall, the hull or a hatch always stands in the way; a door does while closed, and walking through opens it unless welded.
- **Moves** (`src/sim/moves.js:1-30`): four-way steps between tiles units stand on, each costing 1 (more onto rubble); a door is no obstacle; equal paths tie the same way, trying north, east, south, west. A bucket queue per cost.
- **Sight** (`src/sim/sight.js:1-60`): a line from tile centre to tile centre in whole-number arithmetic (crossings scaled by 2·nx·ny), blocked by an edge it crosses or a tile that blocks sight; exactly through a corner it gets by if either way round is clear. The same from either end.
- **Cover** (`src/sim/cover.js:1-45`): on each side of the unit's tile facing the attacker, full from an edge, else the tile beyond's own cover; the best counts, and none means flanked.
- **The example ship's battle map** is a golden file in this format (`tests/golden/example-ship.map.txt`): 11 by 5 tiles, rooms joined by doors, the hull round it and a hatch on the airlock. M7.2's deck is that file, imported.

## 2060td

- **Grid:** cells of one size, each buildable or not (`isBuildable`, `src/sim/engine.ts:699`); a tower-defence board, not rooms.
- **Joins:** `wallJoins` reads the four neighbours as booleans (`src/game/glyphs.ts:76-84`); the glyph drawn depends on them. A 4-bit mask in all but name.
- **Paths:** weighted A* where a wall costs the time to break it (`src/sim/pathfinding.ts:4-20`): right for sieges, more than walkers on a deck need.
- **Ground:** marching squares at finer than the grid for smooth edges (`src/game/ground.ts:50-81`). Opinion: a look, not a rule, and out of M7.2's scope.

## landnam

- **Raid fields** are hand-drawn ASCII, nine rows of seven (`src/data/raidFields.ts:1-36`): `.` open, `,` rough, `#` blocked, `~` water, `=` the palisade line, `G` the gate, `H` the hall. One character a cell, no edges.
- **The legend lives beside the maps** and a test lints every map against the game's promises (room to deploy, one gate, a way in). Opinion: the engine's checks should do the same for any tilemap (E093).

## What M7.2 takes

- **Space-Wrecked's map text** as the edges' format, and one character a tile in each layer, so its maps import as they are and landnam's style of map can be pasted in with no edges.
- **Its tile rules** (walk, cover, blocks sight), **its edge kinds** and **its moves, sight and cover**, ported to the pure core.
- **2060td's four-neighbour joins** as the autotile rule.

## Open questions

1. Doors that open and shut, and welds: the edge's state in the sim, for M7.5.
2. Rubble's extra cost and other weighted steps (Space-Wrecked's `rubbleMoveCost`), for M7.5.
3. Joins between different tiles (machinery against the hull), if a tileset wants them.
