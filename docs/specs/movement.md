# Movement (M5.8, D70)

M5.8 is Phase 5's eighth milestone. It walks a game's spaces in play: a pack carries the project's spaces and what they draw from, a screen's Space widget draws one, and the player walks it in first or third person, by keys and mouse, by pad and by touch, through Rapier on the page. Settled by D70.

The sim never sees a position. The stage moves the character; the sim hears only that a trigger zone was entered, as an action it checks and runs like any other. Positions reach saves at checkpoints in M5.9.

## Spaces in the pack (format 9)

A pack whose project has spaces is format 9 and carries `world`:

```json
{
  "world": {
    "spaces": { "trailhead": { "name": "Trailhead", "terrain": { "size": 65 }, "objects": [] } },
    "prefabs": { "cairn": { "name": "Cairn", "objects": [] } },
    "triggers": { "trailhead": { "cairn-zone": { "effects": [], "once": true } } },
    "files": { "spaces/trailhead.heights.png": "iVBORw0…", "assets/models/crate.glb": "Z2xURg…" }
  }
}
```

- **`spaces` and `prefabs`** are the files as written, checked by the compiler (E058 to E074). The stage draws them as the editor's Scene panel does.
- **`triggers`** are each space's trigger zones with their prefabs and overrides resolved. They are keyed by the object's path: its id, or for an object inside a placed prefab, the placement's id and the inner object's joined by `/`, as `gate/zone`. The sim reads only this.
- **`files`** are the files the spaces draw from, as base64 by their path in the project. That means each space's terrain PNGs, and the GLB of every model record a space places, directly, through a prefab or as a terrain's foliage.
- **A pack without spaces keeps its format,** so every pack written before M5.8 keeps its hash.
- **Compiler problems:** a Space widget naming a space there isn't is E049, as a widget naming any missing thing is.

## The sim: `world/trigger`

The `world` module is the engine's own, on whenever a pack has spaces.

- **Action:** `{ "type": "world/trigger", "space": "trailhead", "object": "cairn-zone" }`.
- **Check:**
  - the zone exists in `world.triggers`;
  - its `when` holds, if it has one;
  - a `once` zone has not fired.
- **Reduce:** the zone's effects run as a trigger sheet's row runs them. A `once` zone is remembered as fired.
- **State:** `{ fired: string[] }`, sorted `space/object` keys, slice version 1.
- **Replay:** a trigger action replays like any other, so the game's state is replayable. The walk that reached the zone is not.

## The stage

All of it is in `apps/editor/src/walk/`, loaded the first time a Space widget draws.

- **The view** draws the space as the Scene panel does: its objects, prefabs, models, terrain, environment and foliage, at the quality tier the shell's settings give (D69). It has no grid, gizmo or labels.
- **Rapier** is the compat build, loaded with the view.
  - **The terrain** is a heightfield, its cells split as the drawn mesh's are.
  - **A collider component** makes its object solid: its shape (box, sphere or capsule) sized by the object's scale.
  - **A placed model** is solid by its record's own collider (box, sphere, capsule or hull).
  - **`moves`** makes a body that falls and is pushed.
  - **Not solid:** water and foliage.
- **The character** is a capsule 1.8 m tall and 0.35 m wide, moved by Rapier's kinematic character controller.

  | Setting | Value |
  | --- | --- |
  | Walk | 2.5 m/s |
  | Run | 5 m/s |
  | Gravity | 18 m/s² |
  | Jump | 6 m/s (about 1 m) |
  | Steepest slope climbed | 40° |
  | Step | 0.35 m |
  | Snap to ground | 0.4 m |

  - It steps at a fixed 60 Hz, at most 5 steps a frame.
  - Below the terrain's low by 50 m, it is put back at its spawn.
- **Spawn:** the space's spawn point with `start`, else its first spawn point, else the space's origin on the ground.
  - It faces the way the object is turned.
  - The spawn point's new `view` field is `third` (the default) or `first`.
- **Cameras:**
  - **Third person:** 4 m behind and 1.6 m above the feet, pitched −15°, between −60° and 60°. A ray from the head pulls the camera in to 0.2 m short of anything solid, never nearer than 0.6 m.
  - **First person:** at the eyes, 1.65 m, between −85° and 85°.
- **Trigger zones** are the size of their object: a ball for a sphere, otherwise a box. Each fixed step, a zone the capsule is in that it wasn't in the step before sends `world/trigger`. One the sim refuses (its `when` not holding, or spent) is not sent again until the character leaves and comes back.

## Controls

| | Keys and mouse | Pad | Touch |
| --- | --- | --- | --- |
| Move | WASD or the arrows | left stick | a stick where the left thumb lands |
| Run | Shift held | the stick pushed past 0.9 | the stick past 85% of its reach |
| Look | drag, or the mouse locked after a click (Escape lets it go) | right stick, 150°/s | drag on the right half |
| Jump | Space | A | a 64 px button at the bottom right, inside the safe area |

- **The stick** is 112 px across, with a dead zone of 12%. It shows only while a thumb holds it.
- **Mouse look** turns 0.25° a pixel; a touch drag 0.3°.
- **Keys move the character while the space has focus.** The screen's buttons stay reachable by Tab and by the pad's spatial focus on its d-pad, and Escape opens the shell's pause as before.
- **Pause stops the walk:** no input, no steps, the frame held.
- **Pure functions with tests:**
  - `controls.ts`: inputs to a move intent;
  - `stick.ts`: the floating stick's vector from its touch points;
  - `cameras.ts`: where each camera stands;
  - `zones.ts`: zones entered from the inside sets of two steps.

## The Space widget

```json
{ "widget": "space", "space": "trailhead", "label": "The trailhead" }
```

- **Layout:** it fills the region it sits in, and the screen's other widgets in that region stack over it. `label` names it for assistive tech; the space's name when left out.
- **Hosts:** packages/ui draws a box and asks its host to draw the space into it.
  - The editor's Play panel, the player page and an exported game are the hosts.
  - Without a host, the box says where the space can be walked.
- **The designer** offers it with a picker of the project's spaces, and draws it as a box with the space's name.
- **New screen** gains a Space template: the space filling the screen, the HUD's facts at the top and the actions on offer at the bottom.

## Exports

- **A second runtime file:** a game's runtime is still `game.js` and `game.css`. A game with spaces also gets `walk.js`: three, Rapier and the stage, built apart by `vite.walk.config.ts` into `dist-walk/` as one classic script.
- **Web and itch.io:** the page loads `walk.<hash>.js` the first time a Space widget draws, and the service worker precaches it.
- **One file:** the export holds it inline.
- **Repository:** the same as web.
- **A game without spaces** exports exactly as before.

## The hook

`window.__ebWalk`, set while a space is drawn:
- `character()`: where it stands, its velocity, whether it is on the ground, its view, and its yaw and pitch;
- `camera()`: the camera's position and its distance from the head;
- `zones()`: the zones it is in;
- `sent()`: the trigger actions sent and the sim's answer to each;
- `frames`: a count of the frames drawn.

## The gate

- **The trail fixture** (`tools/cli/test/fixtures/trail/`) is a game made only of data. `eb validate` finds it clean, and `world.test.ts` breaks it once for each check.
  - **The trailhead:** a terrain with a gentle path and a bank too steep to climb, the starter kit's crate and a still box, a crate that `moves`, and a cairn whose trigger zone sets a flag the HUD shows. Third person.
  - **The bothy:** a room of boxes walked in first person, opened by a HUD button.
- **`walk.spec.ts`** on desktop, by keys and the mouse, in the Play panel:
  - walk the path;
  - stop at the box's face;
  - fail to climb the bank;
  - jump onto a step;
  - push the moving crate;
  - reach the cairn, whose flag the HUD then shows, the trigger sent once;
  - open the bothy and look around in first person;
  - the third-person camera pulled in against a wall;
  - all through `window.__ebWalk` and the HUD.
- **By pad:** the same walk with a stand-in gamepad, both sticks and A.
- **`walkPhone.spec.ts`** by touch at 360×740, 390×844 and 844×390:
  - the floating stick walks the path;
  - a drag on the right half looks;
  - the jump button jumps;
  - the cairn is reached;
  - every screen is in reach (overflow, 44 px targets, axe).
- **Exports:** the trail exported to the web and as one file, walked to the cairn from each, offline.
- **Unit tests:** controls, the stick, the cameras, zones entered and left, `world/trigger`'s checks, format 9 read and written, the compiler's triggers through prefabs and overrides.
- **Budgets:** `walk.js` and the trail's web export get size budgets of their own. The precache's budget rises by Rapier, with its reading.
- **Untested for feel:** every number above, until a phone has walked the trail.

## Open questions

1. **Positions in saves:** checkpoints are M5.9's. Until then a reload starts at the spawn.
2. **Bots that walk:** Rapier in Node for headless runs (Phase 6's gate).
3. **Swimming, ladders and doors** are later: water is not solid, and doors are M5.9's.
4. **Look sensitivity and invert** in the shell's settings, if players ask.
5. **A separate `.wasm`** for Rapier (the spike's question 1) for the web export, about 30% smaller; one-file exports need the compat build either way.
6. **Plants that block** (foliage.md question 2) and colliders on foliage models.
