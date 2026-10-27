# Tilemaps (M7.2, D84)

A tilemap is a grid of tiles in a 2D space: layers of characters drawn through a tileset, and walls, the hull, doors and hatches on the edges between tiles. The sim reads its sight and cover as facts, and the walkers it sends route round its walls. The research behind it is [research/tilemaps.md](../research/tilemaps.md); 2D spaces themselves are [2d-scenes.md](2d-scenes.md).

## A tileset

A tileset is an engine record type, as a sprite is:

```json
{
  "name": "Deck",
  "sheet": "starter-sprites/deck-tiles.png",
  "tile": [16, 16],
  "tiles": {
    "floor": { "char": ".", "frame": 0, "walk": true },
    "console": { "char": "c", "frame": 4, "cover": "half" },
    "machinery": { "char": "#", "frame": 16, "cover": "full", "blocksSight": true, "joins": true }
  },
  "edges": {
    "wall": { "across": 48, "down": 49 },
    "hull": { "across": 50, "down": 51 },
    "door": { "across": 52, "down": 53 },
    "hatch": { "across": 54, "down": 55 },
    "post": 56
  }
}
```

- **The sheet** is a PNG among the project's assets, cut into frames of `tile` pixels, numbered across and then down from 0, as a sprite's sheet is.
- **A tile** has its `char`, its `frame` and its rules:
  - `walk`: a walker can stand on it (false if left out);
  - `cover`: `"half"` or `"full"` given to whoever stands beside it (none if left out);
  - `blocksSight`: a line of sight can't cross it (false if left out);
  - `joins`: it has 16 frames from `frame`, one for each way its neighbours join it (see [Autotiling](#autotiling)).
- **`char`** is the one character the tile is written as in a tilemap's rows. A space is never one: a space is no tile. The tiles' characters are the tileset's legend. They sit on the tiles because a type file's map keys are names, and a legend's are `.` and `#`.
- **The tilemap's object** is a box, as a sprite object is (E058 asks every object to be a shape, a prefab or a record). The stage draws the tilemap and not the box.
- **`edges`** gives the frames an edge is drawn with: for each kind, `across` (an edge between a tile and the one above or below it) and `down` (between a tile and the one beside it), and `post`, drawn where edges meet. A tileset with no `edges` can't draw them, and a tilemap that has any is E093.
- **E092** is a tileset that can't be drawn as written: a sheet missing or not a PNG; a sheet not a whole number of tiles across and down; a frame past the sheet, or 16 joined frames that run past it, or an edge's or the post's frame past it; no tiles; a tile's `char` that isn't one character, is a space, or is another tile's already. The compiler reads only the PNG's header, as it does a sprite's.

## A tilemap

A tilemap is a component of an object in a 2D space:

```json
{
  "id": "deck",
  "shape": "box",
  "at": [0, 0, 0],
  "components": {
    "tilemap": {
      "tileset": "deck",
      "size": [11, 5],
      "layers": [{ "id": "deck", "rows": ["   ......", "  #......c"] }],
      "edges": ["      +=+=+=+=+=+=+", "      I           I", "..."]
    }
  }
}
```

- **`size`** is its columns and rows. Row 0 is the top one, as text is read; column 0 is on the left.
- **The object's `at`** is the map's bottom-left corner in art pixels. The tile at column `c` and row `r` covers `x` from `at.x + c·w` and `y` from `at.y + (rows − 1 − r)·h`, for a tile `w` by `h`.
- **Each layer** has an `id` and `rows`: one string a row, one character a tile, through its tiles' characters. A space is no tile. A row may stop short and leave the rest empty, and a layer may have fewer rows than `size`. Later layers draw over earlier ones.
- **`edges`** is Space-Wrecked's map text (`mapText.js`), 2 × rows + 1 lines:
  - even lines are edge rows: a tile's north edge at column `2c + 1`, a corner at `2c`;
  - odd lines hold a tile's west edge at column `2c` and the tile at `2c + 1`, which is blank here: the tiles are the layers';
  - edge characters: `-` or `|` a wall, `=` or `I` the hull, `/` a door, `o` a hatch, a space for none; a corner is `+` or a space;
  - trailing spaces may be left off, and an empty line is a row of no edges.
- **A cell's rules are its topmost layer's tile.** A cell no layer fills is empty: nobody stands on it, it gives no cover, and sight passes over it.
- **Edges are Space-Wrecked's four kinds.** A wall, the hull and a hatch block walking and sight; a door blocks sight and lets walkers through. A door's opening and shutting is M7.5's.
- **One tilemap a space.** A second is E093.
- **E093** is a tilemap that doesn't fit its tileset or its size: a size not whole numbers from 1 to 256; a row longer than `size`, or more rows; a character no tile is written as; edges of the wrong shape (more lines than 2 × rows + 1, a line longer than 2 × columns + 1, a character on a tile's place, a corner that isn't `+` or a space, an edge across that isn't `-`, `=`, `/`, `o` or a space, or one down that isn't `|`, `I`, `/`, `o` or a space); edges with a tileset that has none; two tilemaps in one space. Each is reported at its layer and row, or its edges' line. A tileset that isn't there is the tileset field's own missing reference, as any record field's is.
- **E058** is a tilemap in a 3D space, as a sprite is.
- **W157** is a walker that can't walk where it stands: an actor placed in a tilemap's space on a cell that isn't walkable, or off the map.

## Autotiling

- A tile that `joins` picks its frame by a 4-bit mask of its four neighbours in the same layer that are the same tile: north 1, east 2, south 4, west 8. Its frame is `frame + mask`. A neighbour off the map doesn't join. From 2060td's walls (`glyphs.ts:76-84`).
- **Edges** draw their `across` or `down` frame centred on the edge's line, and a `post` centred on every corner where at least one edge meets. Posts draw last.

## Sight, cover and routes

All three read the grid the compiler packs (see [The pack](#the-pack)), in the pure core, in whole numbers: the same in Node, a worker and every browser.

- **Sight** is a line from one tile's centre to another's. An edge it crosses blocks it, unless it is empty; a tile it passes over blocks it if that tile blocks sight (the two ends never do). Exactly through a corner, it gets by if either way round is clear. It is the same seen from either end. Ported from Space-Wrecked's `sight.js`.
- **Cover** for someone at a tile against someone at another is the best of the sides of their tile that face the other (north if the other is above, and so on): full from an edge on that side, else the cover of the tile beyond it. With none, they are flanked. Ported from Space-Wrecked's `cover.js`.
- **A route** is four-way steps between walkable tiles. A wall, the hull or a hatch on the edge between two tiles stands in the way; a door doesn't. Every step costs 1, and equal routes tie the same way, trying north, east, south, west. None if the goal can't be reached. Ported from Space-Wrecked's `moves.js`.

## Facts

The world module reads them, in the player's space or the one named:

- **`world.sees(space: <id>, from: <object>, to: <object>)`**: true when there is a line of sight between the two objects' tiles.
- **`world.cover(space: <id>, at: <object>, from: <object>)`**: `none`, `half` or `full`, the cover the first has against the second.
- An object is a path in the space, through prefabs, as a walker's mark is. A placed actor's object stands where its NPC last arrived, when it has arrived somewhere; otherwise where it was placed.
- An object that isn't on the map, or a space with no tilemap: `world.sees` is false and `world.cover` is `none`.

## The pack

- **Format 18** once a space has a tilemap. The world gains `tiles`, by space:
  - `at`, `tile` and `size`, as the tilemap has them;
  - `cells`: one string a row, one character a cell, the rules as a hexadecimal digit (walk 1, blocks sight 2, half cover 4, full cover 8);
  - `edges`: the map text, padded to its full width;
  - `places`: each object of the space on the map, by path, with its column and row.
- The tileset is among the world's records and its sheet among its files, as a sprite's are. The layers travel in the space's file.

## The stage

- **stage2d.js draws a tilemap** at its object's depth: its layers' tiles at whole pixels, then its edges and posts.
- **Walkers route.** In a space with a tilemap, a walker the sim sends to a mark walks the route from its tile to the mark's, tile centre to tile centre, then on to the mark's own place. With no route it stays where it is, and the sim never hears it arrive. In a space with none, it walks straight as before.
- **The hook,** `window.__ebStage2d`, says each walker's route as tiles, and the tilemap's size, tile and each cell's frames as drawn.

## The editor

- **Add → Tilemap…** in a 2D space asks for a tileset and a size, and puts a tilemap at the view's centre with one empty layer, chosen.
- **With a tilemap chosen,** the 2D view's toolbar has a Tiles row:
  - the layer to paint;
  - the tileset's tiles as buttons, each drawn with its frame and named, at least 44 px;
  - **Paint** and **Erase**: a press and a drag over cells sets or clears them in the layer; a stroke is one step of undo;
  - **Edges** with a kind (wall, hull, door, hatch, none): a press on a cell's side sets the edge nearest it; a stroke is one step of undo;
  - **Show rules**: each cell's walk, cover and sight over the map, and blocked edges;
  - **Import ASCII…**.
- **Import ASCII…** takes pasted text into the chosen layer. Text in Space-Wrecked's map text (an odd number of lines whose even lines hold only `+`, spaces and edge characters) brings its tiles into the layer and its edges into the tilemap's; any other text is one character a tile. Blank lines at the start and the end are dropped. The size grows to fit. Characters the legend lacks are listed before anything is changed. It is one step of undo.
- **The inspector** shows a tilemap's tileset, size and layers. Each layer's rows are a text box in a monospace font, edited as text; the edges are one too.
- **Above a tileset's form,** its sheet with the tile grid, each tile named with its character, and its edges.
- **The hook,** `window.__ebView2d`, gains the chosen tilemap's layers and edges.

## The starter tileset

- **In the starter sprites** (`starter-sprites/`, written by `pnpm make:starter-sprites`), in their palette of 16: deck floor, an airlock, a crate (half cover), a locker (full cover and blocks sight), a console (half cover), machinery and the hull, each with its 16 joins, and a wall, the hull, a door and a hatch for edges, with a post. Its tileset record is `deck`, with Space-Wrecked's legend (`.` `a` `h` `H` `c` `#`, and `%` the hull).
- **Dedicated by RCJLabs to CC0,** each sheet in the provenance log.

## The deck (the gate's fixture)

`tools/cli/test/fixtures/deck/`: Space-Wrecked's example ship as a boarding deck, from the starter sprites.

- **The tilemap** is `tests/golden/example-ship.map.txt` from Space-Wrecked, imported as it is: 11 by 5 tiles, its rooms, doors, hull and hatch. Its text is RCJLabs' (D62).
- **The stars** behind it in parallax.
- **Two crew** on their rounds by behaviours, 10 minutes at each end: Ines between the bridge and the engines, Oren between the quarters and the hold, each through the doors.
- **An alarm panel** at the deck's right edge sounds the alarm: its use sets the `alarm` flag, a feedback line says so, and both crew go to the airlock's two tiles.
- **The HUD** says whether each of them can see the hatch, by `world.sees`, and has a Wait button that moves the clock on.

## The gate

- **Checks:** `eb validate` finds the deck clean, and breaks once each for E092, E093, E058 (a tilemap in a 3D space) and W157.
- **The starter sprites,** with the tileset, held to their generator byte for byte, validating clean.
- **Unit tests:** map text read and written back; layers and the topmost rule; the autotile mask; sight (the same both ways, through a corner either way, blocked by an edge and by a tile); cover (from edges and tiles, flanked); routes (round walls, through doors, never through a hatch, the same tie every time, none when shut off); the pack's cells and places; the facts.
- **Headless:** the deck's crew walk their shift in Node, every step one tile north, east, south or west across an open edge, the sim hearing each arrival; after the alarm both reach the airlock.
- **The deck in play,** in the Play panel:
  - by mouse and keys at 1280: the alarm by a click and by Tab and Enter;
  - by touch at 360, 390 and sideways: the alarm by a tap, the camera dragged;
  - drawn at the scale rule's whole scale with only the palette's colours, the machinery's joins drawn as the mask says;
  - the crew's routes through doors and never across a wall, and the HUD's line on the hatch changing as they move;
  - exported as one file and played from `file://`.
- **The editor:** a deck built from the starter tileset in the Scene panel at 1280 and 390: a tilemap added, floor painted, a wall and a door set, Space-Wrecked's text imported, a walker placed, then played.
- **Budgets:** stage2d.js, the precache and the editor's start.
- **Phones:** 360, 390 and sideways, every target 44 px, nothing past the edges and nothing axe finds.

## Open questions

1. Doors opening and shutting, and welds: an edge's state in the sim (M7.5).
2. Weighted steps, such as Space-Wrecked's rubble, and walkers that block each other (M7.5).
3. Joins between different tiles, such as machinery against the hull.
4. Large maps: a 256 by 256 map routes by a full search each time; a cache or a hierarchy if a game needs more.
