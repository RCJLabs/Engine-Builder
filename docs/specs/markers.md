# Spec: quest markers and maps

How a walked game points the player at a quest's target: an objective names its target, one quest is tracked, a compass strip and a marker over the target point the way, and a map of the space, baked in the editor, shows where everything is (M6.6, [D78](../decisions.md)). It builds on the quests kit ([quests.md](quests.md)), the world module ([worldspaces.md](worldspaces.md)) and the walk ([movement.md](movement.md)); the research is [research/quest-ux.md](../research/quest-ux.md).

## Targets

An objective's `target` says where its marker points:

```json
"objectives": [
  { "id": "rope", "text": "Take a rope", "done-when": "inventory.count(item: rope) >= 1",
    "target": { "space": "glen", "object": "rope" } },
  { "id": "smith", "text": "Talk to {smith}", "count": { "event": "dialogue/opened", "args": { "talk": "ada" }, "to": 1 },
    "target": { "actor": "@smith" } },
  { "id": "shed", "text": "Reach the shed", "done-when": "world.in(space: shed)", "target": { "space": "shed" } }
]
```

| Form | Points at |
| --- | --- |
| `{ "actor": id }` | the actor where it stands: an id, or `@slot` for a slot of the `actor` type |
| `{ "space": id, "object": path }` | the object at that path in the space: its id, or `placement/inner` through a prefab |
| `{ "space": id }` | the space itself: from another space, the door toward it; inside it, nothing |

**Read from what completes it.** An objective with no `target` takes one from its `count` when the count's event names one: `world/used` with a `space` and an `object` is that object; `fighting/searched` with an `actor` is that actor. So the marker and the test are one definition ([research](../research/quest-ux.md#lessons), lesson 1). A `done-when` is not read: it can say anything, so a target it needs is written.

**Checks.**
- **E086:** a target names a space the project hasn't, an object that space hasn't (through prefabs), an actor that isn't one, a slot the quest hasn't, or a slot that isn't of the `actor` type.
- **W155:** an actor target, by id, placed in no space: its marker can't show. (A slot's record is known only in play.)

## Tracking

- **The quests kit's slice goes to version 3** with `tracked`, the quest whose targets show.
- **A quest that starts is tracked.** When the tracked quest ends, done or failed, the first active quest by id is tracked, or none.
- **`quests/track { quest }`** tracks an active quest. It takes no time, as looking at the journal doesn't, and is refused for a quest that isn't active (`not-active`).
- **`quests.tracked`** is the fact: the tracked quest's id, unknown when none is.
- **A version 2 save** migrates with the first active quest by id tracked; `dock-quests-v2.json` keeps loading.
- **The journal's entries** say which is tracked and offer Track on the others that are active.

## What the stage is told

The session works out, after each step, the **markers**: each open objective of the tracked quest with a target, its slots bound:

```ts
interface QuestMarker {
  readonly quest: string;
  readonly objective: string;
  readonly text: string;   // the objective's text, slots shown by name
  readonly target: { readonly actor: string } | { readonly space: string; readonly object?: string };
}
```

They reach the stage through the Space widget's ask, `markers()`, read each frame as `fight()` is, and the map through the view's `world.map`.

## Places and doors

The sim knows no coordinates ([D74](../decisions.md)); the page works out where things are from what the pack already carries:

- **Places** are not packed. Since format 9 the pack holds every space and prefab as written, and the walk already finds each object's place through prefabs and overrides (`objectPlaces`, M6.2's goals). The compass, the marker and the Map screen's pins all use that one function, so they agree with where the walk draws each object. An actor's space is the pack's `actors` where it has them (format 11 on), or the space whose objects place it (E077 keeps that to one).
- **Doors** are worked out from the pack, not packed: a use or a zone among whose effects is `enter-space` is a door from its space to that effect's space. `doorsOf(world)` lists them; `doorToward(doors, from, to)` finds the door out of `from` on the fewest doors to `to`, ties going to the first by path. These are plain functions in the world module, so a bot can follow the same way.

**Where a target is,** for a marker in the space walked:

| Target | Here | Elsewhere |
| --- | --- | --- |
| an object of this space | its place | — |
| an object of another space, or that space | — | the door toward it; none when no door leads there |
| an actor | where the stage has it: walked by the crowd, or placed | the door toward the space it is in, as the sim says |
| this space itself | no marker | — |

## The compass and the marker

- **The compass** is a strip across the top of the walk, under the safe area: the four points, north being −z, and a pip for each marker, placed by its bearing from the way the camera faces, with its distance in metres under it. A pip off the strip's 180° sits at its edge. The objective's text shows when its pip is within 10° of the middle. The strip shows only while there is a marker to point at: with nothing tracked, or the setting off, the walk is as it was.
- **The marker** is a diamond over a target that is in front of the camera and on screen, 0.5 m above an object's place and over an actor's head, with its distance. Behind the camera or off screen, only the compass shows it.
- **A door** stands in for a target elsewhere: its pip and marker are the door's, its text the objective's.
- **Neither takes a touch:** they never cover the stick, Jump or the prompt.
- **The setting** "Quest markers" in the shell's settings, on unless turned off and kept per device, hides the compass and the marker.
- **`window.__ebWalk.markers()`** says, for each marker shown: its quest, objective and text, the point it is at, the door when it stands in, the bearing and distance, and where it is on screen or null.

## The map

### Baking

**Bake map** in the Scene panel's toolbar, beside Bake navigation, draws the open space from above:

- **What it draws:** the terrain, its foliage and water, and every object as a player sees it, through an orthographic camera looking down; no grid, gizmos, labels or weather, and none of the editor's marks, zones or spawn points, nor characters, which move. Lit by a fixed light from high in the north-west, as maps are, its shadows short, so a map reads the same at any hour.
- **Its bounds:** the terrain's, or the objects' footprints with 4 m round, squared up.
- **Its size:** 1024 pixels on the longer side.
- **A space with no terrain** leaves out each mesh wholly above 2.4 m over its highest spawn point: a roof or a ceiling, so an interior shows its floor and its walls. Not a cut through everything at that height: seen from straight above, a wall cut below its top has no area. A model made as one mesh, walls and roof together, is drawn whole, roof and all.
- **The files:** `spaces/<id>.map.json` holds the bounds (`[least x, least z, most x, most z]` in metres), the image's size in pixels, the image's file and the hash of what was drawn:

  ```json
  { "bounds": [-40, -40, 40, 40], "size": [1024, 1024], "image": "glen.map.webp", "hash": "0123456789abcdef" }
  ```

  The image is `spaces/<id>.map.webp`, or `spaces/<id>.map.png` from a browser that can't write WebP. The hash (`mapInputsHash`) is over the space and the prefabs it places as written, its terrain's files, and the records it draws (its placed records, their models and materials, its foliage), as a navmesh's is. The environment is left out: a map is lit the same at any hour.

**Checks.**
- **W154:** the map is out of date: the space has changed since it was baked. Bake map again.
- **E087:** a map file that can't be read: its JSON isn't one or isn't a map's shape, its image is named for another space or is missing, or there is no space of its id.

### In play

- **The pack carries each map** (format 14): its bounds and its image.
- **The Map screen** draws the space walked: its image, and over it pins for the player (a point and the way they face), for each marker, and for the door a marker stands in at. A pin's place is its x and z within the bounds. A tap on a target's pin says its objective.
- **A space with no map** shows its pins on a plain ground.
- **The player's pin** is where the sim last heard they stood: the walk says where it stands as any screen opens over it.
- **The stock Space template** gets a Map button, and New screen offers a Map template.

## In the editor

- **An objective's target** is a field of the quest form: an actor (any, or a slot), or a space and, in it, an object chosen from the space's objects.
- **Bake map** in the Scene toolbar's Map row, with the map's state: none, baked, or out of date.

## Pack format 14

The world gains `maps`: each baked space's bounds, size and image, the image among the world's `files` by its path. A pack is format 14 only when a space has a map; otherwise it keeps the format and hash it had. Format 14 keeps format 11's `navmeshes` and `actors`, none or not, as 12 and 13 do. Markers need no new format: targets are records, and places come from the spaces.

## The gate

- **Headless:** targets bound and read from counts; tracking, its action and its migration; `doorsOf` and `doorToward` over the glen's spaces; a marker's point against the walk's own places; pack format 14; E086, E087, W154 and W155 each broken once.
- **By keys and by touch at 360, 390 and sideways:** the glen's supplies quest followed by its compass and marker, read through `window.__ebWalk.markers()`: the rope; the bothy's door, then the lamp inside; the way to the shed; a second quest tracked from the journal moving the compass; the setting hiding it; the Map screen's pins where the player and the targets stand.
- **In the editor at 1280 and 390:** the glen's maps baked and W154 after a move; an objective's target set with forms.

## As built (2026-10-26)

- **Where it lives.**
  - *The sim:* the quests kit's `tracked`, `quests/track` and migration 3; `doorsOf` and `doorToward` in core; targets checked by `packages/schema`'s `targetCheck.ts`.
  - *The session:* `packages/ui`'s `markersOf` turns the tracked quest's preview into markers after each step.
  - *The stage:* `apps/editor/src/walk/markers.ts` (points, bearings, the strip's arithmetic) and `markerStage.ts` and `markerView.ts` (the compass and the markers, a layer of the page's own DOM that takes no touch and is hidden from assistive tech, the journal saying the same). The pins are `mapPins.ts`, run in walk.js as the Map screen opens.
  - *The bake:* `apps/editor/src/spaceMaps/` (the shot, the files, the Map row) and `spaces/fromAbove.ts`. It draws on the Scene view's own canvas at 1024 px and pixel ratio 1, copies the frame out in the same task, then puts the view back.
- **A save from before an at-start quest** loads with that quest started as its steps replay, and so tracked, being the last started: the glen's version 2 save does this once Find your feet is added.
- **The glen** is the gate's fixture, gaining:
  - Find your feet, an at-start quest whose rope is read from its `world/used` count and whose gate is written;
  - targets on the supplies quest;
  - Map and Journal screens.
- **What the gate found.**
  - `withScreens` dropped the spaces' objects on the way to the record index. So in the editor a target's Object had no choices, and E086 never checked an object. `targetChecks.test.ts` now holds the editor to `eb validate`.
  - The first bake drew the editor's own marks. A collider's wire box laid a diagonal across the glen's ground, and the spawn points' arrows and the zones showed too. `build.ts` flags them, and characters, as left off the map.
  - The cut at 2.4 m took the top off every wall, so the glen's buildings showed only as their shadows. Roofs are now left out mesh by mesh.
  - The sun's shadow camera stood 15.6 m from the origin with its near plane in front of it. In any space wider than that, a line crossed the ground where the near plane cut it, and with no bias every broad floor shadowed itself. Both are fixed for the editor's view and the walk alike.
  - At 60% of the screen's height, the Map widget pushed the screen's bar off a 1280 by 800 screen. It is now 50%.
  - Outside M6.6's own code, CI found an object's x, y and z, typed faster than the form redrew, each writing the whole triple from the last render, so an axis whose edit hadn't drawn was put back. The object's form now sets each axis against the file as the edit lands (`setAxis`). A placement's override inside a prefab still writes the whole triple from its form; it waits for the next change there.
- **Untested for feel:**
  - the strip's 320 px and its 180°;
  - the 10° for the text;
  - the marker's size and its heights over an object and a head;
  - the north-west light.

## Open questions

1. Fog over a map, or places found before they show.
2. Fast travel from the map.
3. Pins for every door and use, not only the markers'.
4. A marker for a quest's stage as a whole, not only its objectives.
5. A world map across spaces: the maps kit's node map (M4.6) is one; joining it to a space's map is not done.
