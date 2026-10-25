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
- **The flags' lint counts zones and screens** (W108 to W110): a flag a trigger zone sets or reads, or a screen's shows-when or binding reads, is used as a record's use is. Before M5.8 a flag set only by a zone and shown only on a screen was W110. The editor's record index lints them the same way, checking only the flags again when what the zones and screens use changes.

## The sim: `world/trigger`

The `world` module is the engine's own, joined to a game whenever its project has spaces, after the kits and before the game's own modules. A game's module may not take its id then (E031). A project without spaces has no world module, so its state and its goldens are as they were.

- **Action:** `{ "type": "world/trigger", "space": "trailhead", "object": "cairn/zone" }`.
- **Modes:** it runs only in a mode that allows it, as any action: a game lists `world/*` in the modes where walking into a zone counts. In a mode that doesn't (a game over, a talk), the sim refuses it with `mode`.
- **Check**, each a refusal's reason:
  - `bad-trigger`: the action doesn't name its space and object as text;
  - `no-zone`: the zone isn't in `world.triggers` (own keys only);
  - `spent`: a `once` zone has fired;
  - `unmet`: its `when` doesn't hold.
- **Reduce:** `world/entered` is raised with the space and object, so a sheet's row can hear it; then the zone's effects run in order. An effect that refuses refuses the whole action: nothing it did stays and a `once` zone isn't spent. A `once` zone is remembered as fired.
- **Never offered:** `options` is empty, so bots and Run's sweeps never send it (open question 2). A play's session refuses any action the game doesn't offer before the sim sees it, as a button can ask only for what is offered; the stage's `world/trigger` is the one it lets through, for the sim's own checks to decide.
- **Fact:** `world.fired(space, object)`, whether a once zone has run.
- **State:** `{ fired: string[] }`, sorted `space/object` keys, slice version 1.
- **Replay:** a trigger action replays like any other, so the game's state is replayable. The walk that reached the zone is not.

## The stage

All of it is in `apps/editor/src/walk/`, built into `walk.js` and loaded the first time a Space widget draws (see Exports). `stage.ts` is the loop; `surface.ts` the canvas, its view at a tier and the keys, mouse and pad read through it; `sender.ts` the zones' triggers; `physics.ts` Rapier; `view.ts` three.

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

  - It steps at a fixed 60 Hz, at most 5 steps a frame. A jump pressed on a frame too short for a step waits for the next frame that has one.
  - Below the terrain's low by 50 m, or 50 m below 0 in a space without a terrain, it is put back at its spawn.
- **Not drawn in play:** an object with a trigger zone or a spawn point; the editor draws both.
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
- **Keys move the character while the space has focus.** The screen's buttons stay reachable by Tab and by the pad's spatial focus on its d-pad, and Escape opens the shell's pause as before. A key tapped between two frames still counts once, as does a tap of the jump button.
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

- **A second runtime file:** a game's runtime is still `game.js` and `game.css`. A game with spaces also gets `walk.js`: three, Rapier, the models' Draco and Basis decoders and the stage, built apart by `vite.walk.config.ts` as one classic script into `dist-game/` beside the runtime, whose `files.json` names it (`"walk": "walk.js"`). It leaves the stage on `window.__ebWalkStage`. `eb export --runtime` takes the same folder.
- **The editor walks with the same file:** its build serves the runtime at `runtime/`, `walk.js` with it, and the Play panel and the player page load `runtime/walk.js` the first time a Space widget draws. Its service worker precaches it (Workbox's limit for a file raised to 10 MB), and `pnpm budgets` fails if it doesn't.
- **Web and itch.io:** the page loads `walk.<hash>.js` the first time a Space widget draws, and the web build's service worker precaches it. The boot JSON names it.
- **One file:** the page holds walk.js as text in `<script type="text/plain" id="eb-walk">`, its `</script` broken as the runtime's is, and runs it through a blob URL the first time a space draws. The boot JSON names `#eb-walk`.
- **Repository:** the same as web.
- **A game with spaces needs a runtime with walk.js:** an export without one stops and says so.
- **A game without spaces** exports exactly as before.
- **The leak check** takes walk.js out with the rest of the engine's own text before it reads.

## The hook

`window.__ebWalk`, set while a space is drawn:
- `character()`: where it stands, its velocity, whether it is on the ground, its view, and its yaw and pitch;
- `camera()`: the camera's position and its distance from the head;
- `zones()`: the zones it is in;
- `sent()`: the trigger actions sent and the sim's answer to each, `waiting` until it comes;
- `moving()`: where each solid that moves is;
- `frames`: a count of the frames drawn; `paused`; and `perf()`, the view's tier and frame times as the Scene panel's hook gives them.

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
- **Exports:** the trail exported to the web and as one file, walked to the cairn from each, offline (`walkExport.spec.ts`).
- **Unit tests:** controls, the stick, the cameras, zones entered and left, `world/trigger`'s checks, format 9 read and written, the compiler's triggers through prefabs and overrides; the trail walked headless in Node through Rapier (`walk.test.ts`); the session taking the stage's trigger; the targets' walk.js; the editor's script check and flag lint with spaces.
- **Budgets:** `walk.js` and the trail's web export get size budgets of their own. The precache's budget rises by walk.js, with its reading. The trail's web build is deployed at `/games/trail/` for a phone to walk.
- **Untested for feel:** every number above, until a phone has walked the trail.

As built (2026-10-25): every step above passes. The desktop walk also taps Space in the bothy, down and up within a frame, and the phone walk taps the jump button: each must jump.

## Open questions

1. **Positions in saves:** checkpoints are M5.9's. Until then a reload starts at the spawn.
2. **Bots that walk:** Rapier in Node for headless runs (Phase 6's gate).
3. **Swimming, ladders and doors** are later: water is not solid, and doors are M5.9's.
4. **Look sensitivity and invert** in the shell's settings, if players ask.
5. **A separate `.wasm`** for Rapier (the spike's question 1) for the web export, about 30% smaller; one-file exports need the compat build either way.
6. **Plants that block** (foliage.md question 2) and colliders on foliage models.
7. **Resolved (2026-10-25):** the editor's record index lints flags with the zones' and screens' uses, as `eb validate` does.
8. **walk.js's decoders:** Draco and Basis are inside it, about 0.37 MB at gzip, for the few games whose models need them; a file of their own each, fetched when a model does, would spare the rest (the single file aside).
9. **The editor's Play panel sideways** shows part of the view at 844×390 and scrolls to the rest; a Play panel that gives the game the whole screen would suit walking better.
