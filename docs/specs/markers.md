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

- **The compass** is a strip across the top of the walk, under the safe area: the four points, north being −z, and a pip for each marker, placed by its bearing from the way the camera faces, with its distance in metres under it. A pip off the strip's 180° sits at its edge. The objective's text shows when its pip is within 10° of the middle.
- **The marker** is a diamond over a target that is in front of the camera and on screen, 0.5 m above an object's place and over an actor's head, with its distance. Behind the camera or off screen, only the compass shows it.
- **A door** stands in for a target elsewhere: its pip and marker are the door's, its text the objective's.
- **Neither takes a touch:** they never cover the stick, Jump or the prompt.
- **The setting** "Quest markers" in the shell's settings, on unless turned off and kept per device, hides the compass and the marker.
- **`window.__ebWalk.markers()`** says, for each marker shown: its quest, objective and text, the point it is at, the door when it stands in, the bearing and distance, and where it is on screen or null.

## The map

### Baking

**Bake map** in the Scene panel's toolbar, beside Bake navigation, draws the open space from above:

- **What it draws:** the terrain, its foliage and water, and every object as it is drawn, through an orthographic camera looking down; no grid, gizmos, markers, labels or weather; lit by a fixed light from above, so a map reads the same at any hour.
- **Its bounds:** the terrain's, or the objects' footprints with 4 m round, squared up.
- **Its size:** 1024 pixels on the longer side.
- **A space with no terrain** is drawn cut at 2.4 m above its highest spawn point, so an interior shows its floor and not its roof.
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

## Open questions

1. Fog over a map, or places found before they show.
2. Fast travel from the map.
3. Pins for every door and use, not only the markers'.
4. A marker for a quest's stage as a whole, not only its objectives.
5. A world map across spaces: the maps kit's node map (M4.6) is one; joining it to a space's map is not done.
