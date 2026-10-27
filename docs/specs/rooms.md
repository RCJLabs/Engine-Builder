# Side-view rooms (M7.3, D85)

A building is a stack of floors seen side on in a 2D space: each floor a row of equal slots, rooms that take one slot or more, and stairs between floors that take none. Walkers the sim sends to a mark in the building walk along a floor and climb the stairs to reach it, and the sim reads which room each one is in. The research behind it is [research/rooms.md](../research/rooms.md); 2D spaces are [2d-scenes.md](2d-scenes.md), and tilemaps, the other ground a walker can follow, are [tilemaps.md](tilemaps.md).

## A room

A room is an engine record type, as a sprite and a tileset are:

```json
{ "name": "Hall", "sprite": "room-hall" }
```

- **`sprite`** is drawn across the room from its bottom-left, its frame repeated as many times as the room's width needs and cut at its right edge. A frame one slot wide and one floor high draws a room exactly.
- **What a room does** (who works there, what it costs, what may be built beside it) is the kits'. M7.3's room is a name and a look.

## A building

A building is a component of an object in a 2D space:

```json
{
  "id": "keep",
  "shape": "box",
  "at": [32, 8, 0],
  "components": {
    "building": {
      "slot": [48, 24],
      "slots": 2,
      "floors": 4,
      "rooms": [
        { "id": "crypt", "room": "crypt", "floor": 0, "slot": 0 },
        { "id": "store", "room": "store", "floor": 0, "slot": 1 },
        { "id": "hall", "room": "hall", "floor": 1, "slot": 0, "span": 2 }
      ],
      "stairs": [{ "floor": 0, "x": 12 }, { "floor": 1, "x": 84 }],
      "stair": "stair-ladder"
    }
  }
}
```

- **`slot`** is a slot's width and a floor's height in art pixels, the slab under the room included. Every floor has the same slots.
- **`slots`** is how many slots a floor has, from 1 to 32; **`floors`** how many floors, from 1 to 64. Floor 0 is the ground, and floors are counted up from it, so adding a floor on top renumbers nothing.
- **The object's `at`** is the building's bottom-left. Floor `f`'s foot, where walkers stand, is at `y = at.y + f · h`; slot `s` runs from `x = at.x + s · w`, for a slot `w` by `h`.
- **A room** has an `id` (unique in the building), its `room` record, its `floor` and first `slot`, and `span`, the slots it takes (1 if left out). A slot no room takes is bare: walkers cross it, and nothing is drawn there.
- **A stair** joins floor `floor` to the floor above at `x`, art pixels from the building's left. It takes no slot. Walkers climb it straight up and down. **`stair`** is the sprite every stair is drawn with, repeated up from the lower floor's foot to the upper's.
- **`climb`** is what a climb costs a route, in art pixels of walking: a floor's height if left out.
- **The building's object is a box,** as a tilemap's is; the stage draws the building and not the box.
- **One building a space, and no tilemap beside it:** a walker follows one ground.
- **E094** is a building that doesn't fit itself: a slot that isn't two whole sizes from 1; `slots` or `floors` out of range; a room past the last slot or floor; two rooms on one slot; a room's id twice; a stair from the top floor or with its `x` outside the building; `climb` not a whole number from 1; a second building in a space, or one beside a tilemap. Each is reported at its room, its stair or its field.
- **E058** is a building in a 3D space, as a sprite is.
- **W158** is a floor no stair reaches from the ground: its rooms can't be walked to.

## Routes

All in the pure core, in whole numbers: the same in Node, a worker and every browser.

- **A place in a building** is a floor and an `x`. An object stands on the floor whose band its feet are in, at its own `x`.
- **A route** from one place to another is the cheapest way along floors and up and down stairs. Walking along a floor costs the distance; a climb costs `climb`. Dijkstra over the start, both ends of every stair and the goal, in that order: the cheapest point next, the lowest-numbered of equal ones, a cost replacing another only when strictly lower. The same route every time.
- **None** if the goal's floor can't be reached. The walker stays where it is, and the sim never hears it arrive.
- Ported from afterglass's `route` (`slice/geo.js:155-199`), without its lights and wards, in whole numbers and with the tie-break stated.

## Facts

- **`world.room(space: <id>, of: <object>)`**: the id of the room the object stands in, or `""` on a bare slot, off the building or in a space with none. An actor's object stands where its NPC last arrived, as for `world.sees`.

## The pack

- **Format 19** once a space has a building. The world gains `buildings`, by space:
  - `object`, `at`, `slot`, `slots`, `floors` and `climb`, as the building has them;
  - `rooms`: by id, each `[floor, slot, span]`;
  - `stairs`: each `[floor, x]`, in the file's order;
  - `places`: each object of the space on the building, by path, with its floor and `x`.
- The room records and their sprites, and the stair's sprite and its sheet, are among the world's records and files.

## The stage

- **stage2d.js draws a building** at its object's depth: each room's sprite across it, then the stairs.
- **Walkers climb.** A walker the sim sends to a mark walks the route from its place to the mark's when both are on the building: along a floor, then up or down a stair at the walker's speed, and so on, then on to the mark's own place. With no route it stays. Elsewhere it walks straight, as before.
- **The hook,** `window.__ebStage2d`, says each walker's route as floor and `x` steps, and the building's rooms as drawn.

## The editor

- **Add → Building…** in a 2D space asks for the slot's size, the slots and the floors, and puts an empty building at the view's centre, chosen.
- **With a building chosen,** the 2D view's toolbar has a Rooms row:
  - the project's room records as buttons, each drawn with its sprite and named, at least 44 px;
  - **Place**: a press on a slot puts the chosen room there, and a drag along a floor spans it over the slots it crosses; a room in the way is replaced. One step of undo;
  - **Erase**: a press on a room takes it out;
  - **Stairs**: a press on a floor adds a stair up from it at that `x`, or takes out the stair under the press;
  - **Add floor** and **Remove top floor** (refused while a room or stair is on it).
- **The inspector** shows the building's fields, its rooms and its stairs as forms.
- **The hook,** `window.__ebView2d`, gains the chosen building.

## The starter rooms

- **In the starter sprites,** in their palette of 16: the keep's interior seen side on, a slot 48 by 24 art pixels: a hall, a crypt, a store, barracks, a chapel and a watch room, and a ladder for the stairs. Each room's record is in `records/room/`.
- **Dedicated by RCJLabs to CC0,** drawn fresh, each sheet in the provenance log.

## The tower (the gate's fixture)

`tools/cli/test/fixtures/tower/`: the keep at night seen side on, from the starter sprites.

- **The tower:** four floors of two slots, a hall spanning a whole floor, stairs on alternate sides, the night sky behind in parallax.
- **Its folk** on their rounds by behaviours: a warden between the chapel and the crypt, two guards between the barracks and the watch.
- **A bell** whose use sends all three to the hall.
- **The HUD** says which room the warden is in, by `world.room`.

## The gate

- **Checks:** `eb validate` finds the tower clean, and breaks once each for E094, E058 (a building in a 3D space) and W158.
- **The starter sprites,** with the rooms, held to their generator byte for byte, validating clean.
- **Unit tests:** a place's floor and room; routes (along a floor, up and down, the cheaper of two stairs, ties the same way every time, none to a floor no stair reaches); the pack's rooms, stairs and places; `world.room`.
- **Headless:** the tower's folk walk their night in Node, never leaving a floor but by a stair, the sim hearing each arrival; at the bell all three reach the hall, and `world.room` follows the warden.
- **The tower in play,** in the Play panel:
  - by mouse and keys at 1280: the bell by a click and by Tab and Enter;
  - by touch at 360, 390 and sideways: the bell by a tap, the camera dragged;
  - drawn at the scale rule's whole scale with only the palette's colours;
  - the folk climbing the stairs and never crossing a floor elsewhere, the HUD's line following the warden;
  - exported as one file and played from `file://`.
- **The editor:** a tower built from the starter rooms in the Scene panel at 1280 and 390: a building added, rooms placed, one spanning two slots, stairs set, a floor added, a walker placed, then played.
- **Budgets:** stage2d.js, the precache and the editor's start.
- **Phones:** 360, 390 and sideways, every target 44 px, nothing past the edges and nothing axe finds.

## Open questions

1. Building in play, with costs and placement rules as data (M7.5's base builder).
2. Doors between rooms on a floor, and a room a walker may not enter.
3. Routes that avoid a stair for some walkers (afterglass's wards and light).
4. Lifts and stairs with a run, rather than straight ladders.
