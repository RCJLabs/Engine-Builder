# Spaces, prefabs and the Scene panel (M5.1, D63)

M5.1 is Phase 5's first milestone: the 3D viewport in the editor, and the two files it edits. A space is one place in a 3D world, an exterior or an interior. A prefab is a group of objects that spaces and other prefabs place by reference. M5.2 adds components to objects and overrides to placements; M5.3 terrain; M5.8 joins spaces with load doors. Nothing here runs in a game yet: the runtime draws spaces from M5.7.

## The files

### `spaces/<id>.json`

```json
{
  "name": "The yard",
  "objects": [
    { "id": "ground", "shape": "plane", "scale": [20, 1, 20], "color": "#7a8b5c" },
    { "id": "crate-1", "prefab": "crate", "at": [2, 0, -1], "turn": [0, 30, 0] },
    { "id": "lamp", "shape": "cylinder", "at": [-3, 1, 0], "scale": [0.2, 2, 0.2], "color": "#333333" }
  ]
}
```

- **`name`** is what the Scene panel and the outliner show.
- **`objects`** are the space's placed objects, in outliner order.

### `prefabs/<id>.json`

The same shape: a name and objects. A prefab's objects sit around its own origin. Placing it puts that origin at the placement's `at`, turned and scaled by the placement's own.

### An object

| Field | Holds | Left out |
| --- | --- | --- |
| `id` | kebab-case, unique in its file | never |
| `name` | what the outliner shows | the id |
| `at` | its place, `[x, y, z]` in metres; y is up | `[0, 0, 0]` |
| `turn` | its turn, `[x, y, z]` in degrees, applied as yaw (y), then pitch (x), then roll (z) | `[0, 0, 0]` |
| `scale` | `[x, y, z]`, each above 0 | `[1, 1, 1]` |
| `shape` | `box`, `sphere`, `cylinder` or `plane`, each a metre across and standing on its origin | (a prefab instead) |
| `color` | `#rrggbb` for a shape | `#b0b0b0` |
| `prefab` | a prefab's id, placed here | (a shape instead) |

- An object is a shape or a placed prefab, never both.
- Fields at their defaults are left out of the file, so a moved object changes one line.
- The editor writes a file one object to a line, its fields in the order above, and keeps the file's own line ends, indent, byte order mark and last newline. A file laid out another way by hand takes this layout at its first edit.
- Turns are degrees and order YXZ so a person can read and edit them. Quaternions never reach a file.
- Numbers are kept to the thousandth: a millimetre, a thousandth of a degree.

### Checks

| Code | When |
| --- | --- |
| E058 | A space or prefab file isn't JSON of the shape above: a field missing, unknown or of the wrong kind, a scale of 0 or less, a shape and a prefab both or neither. |
| E059 | Two objects in one file share an id. |
| E060 | An object places a prefab that `prefabs/` doesn't have. |
| E061 | A prefab places itself, directly or through others. |

`eb validate` and the Problems panel both report them, each at its object's line. A file under `spaces/` or `prefabs/` that sits in a folder, or whose name isn't an id, is W141, and one that isn't JSON is E007. A problem opens its file in the Scene panel with its object chosen.

## The Scene panel

- **The list.** With no space open, the panel lists the project's spaces and prefabs, each with its name, its count of objects and its problems, under New space and New prefab. A new one asks for a name, and its id comes from the name.
- **The viewport** fills the panel once a space or a prefab is open. On a phone the panel sits behind More and fills the screen (D63). On a short screen, such as a phone held sideways, the view is never taller than the screen has room for under its bars (`100dvh − 190px`), so it can be seen whole.
- **The renderer** is three.js's `WebGPURenderer`, which uses WebGPU where the browser has it and WebGL2 otherwise (D8). three loads with the panel's first space, never with the editor's start. The offline cache holds it.
- **Drawing on demand.** The view is drawn when something changes: the camera, the file, the selection or the size. A still editor draws nothing, which spares a phone's battery.
- **Light and ground.** The editor lights every space the same: a hemisphere light and a sun from above and behind the camera's start. A grid 60 m across marks the ground plane at 1 m; wider, its far lines shimmer into a band. These are the editor's, never saved.
- **What draws what.** A shape is three's box, sphere, cylinder or plane, a metre across, its geometry shared by shape and its material by colour. A placed prefab is a group of the prefab's objects, drawn 8 placements deep at most, so a loop (E061) stops. A placement of a prefab `prefabs/` lacks is a red wire box.

### The camera

- **Orbit** around a point:
  - by mouse, drag with the left button to orbit, the right to pan, and the wheel to zoom;
  - by touch, one finger orbits, and two fingers pan and pinch.
- **Fly**, on desktop: hold the right button and use W, A, S, D, Q and E, 6 m a second, three times that with Shift.
- **Frame** puts the selection, or the whole space, in view. A space opens framed.
- **Keys**, with the view focused: arrows orbit, + and − zoom, F frames, Delete deletes what is chosen, Escape lets it go.
- The camera isn't saved. It is the editor's own plain functions (`orbit.ts`): three's OrbitControls would bring three's WebGL renderer into the chunk beside its WebGPU one.

### Picking and selection

- A tap or click on an object selects it. On empty ground it selects nothing. A press that moves more than 4 px (10 px for a finger) is a drag, not a tap.
- **Many at once:** Shift or Ctrl with a click adds or takes away. On touch, the toolbar's Select more does the same for each tap until it's turned off.
- A placed prefab selects as one object. Its own objects are edited in the prefab.
- The selection is outlined in the view by its box, in the accent colour, and marked the same in the outliner.

### The gizmo

- **Three modes,** chosen in the toolbar:
  - **Move:** an arrow on each axis, and a square on each plane between two;
  - **Turn:** a ring around each axis;
  - **Scale:** a block on each axis, and one at the centre for all three.
- **Its size stays the same on screen** however far the camera is: its arms are a fifth of the view's short side, between 72 and 120 px. Every handle's hit area is at least 44 px across, larger than it looks: hits are measured on the screen, 22 px either side of a handle's line or point, and the nearest handle wins where two reach (`handles.ts`).
- **Dragging** follows the pointer: along an axis, the closest point on the axis to the pointer's ray; on a plane, where the ray meets it; on a ring, the angle around it.
- **With many selected,** the gizmo sits at their centre, the middle of their places' bounds, and moves, turns or scales them all about it.
- **Axes:** moving and turning go along the world's axes. Scaling one object goes along its own, the gizmo turned with it; scaling several grows each on its own axis of that number and spreads their places from the centre along the world's.
- **A ring's turn** is the angle from where it was taken hold of. Past half way round it reads as the same turn the other way: 225° is −135°.
- **The centre block** grows all three axes as the pointer rises, doubling every 150 px.
- **One drag is one step** of the editor's undo, written when the pointer lifts. Until then the view shows the drag and the file waits.
- **Snapping** is on by default and turned off in the toolbar: moves in 0.5 m, turns in 15°, scales in 0.1. Holding Ctrl or ⌘ while dragging snaps the other way. One object moved lands on the steps; several move by whole steps, so each keeps its place beside the others. Turns go by whole steps. A scale lands on the steps, never below 0.1.

### The toolbar

Move, Turn, Scale, Snap, Add (box, sphere, cylinder, plane, or a prefab), Select more, Group into prefab, Delete, Frame, and Back to the list. Every button is at least 44 px. On a phone the toolbar wraps onto two rows rather than scroll.

- **Add** puts the new object in front of the camera, on the ground, selected; where something already stands there, 1.5 m along x, and again, until a spot is free. A prefab that places the prefab open, itself or through others, isn't offered (E061).
- **Group into prefab** asks for a name, makes `prefabs/<id>.json` from the selected objects around their centre (the middle of their places on x and z, the lowest on y, so it stands on the ground), and puts one placement of it where they were, in the place of the first of them, its id the prefab's or the next free one. It is one step of undo.
- **Delete** removes the selected objects, one step of undo.

### The outliner

- **Every object of the open file, in order,** by name, a placed prefab marked with its prefab's name.
- **Choosing a row selects the object,** with Shift or Ctrl for many, as in the view.
- **Rename** edits the object's name in place. The id stays, as a record's does until it is renamed. A name typed as nothing, or as the id, is taken away.
- **On desktop** it is a panel of its own, docked above the Inspector; **on a tablet** a tab beside it. On a phone it is a tab of the inspector sheet, beside the object's form, while a space is open (D63).

### The inspector

- **One object:** its name, place, turn and scale as number fields, and either its shape and colour or its prefab, with Open prefab. Typing joins into one step, as the record form's fields do.
- **Several objects:** how many, with Group into prefab and Delete.

## Where it lives

- `packages/compiler/src/spaces.ts`: the shape (strict zod) and E058 to E061, the files read for `eb validate`; `spaceFiles.ts`: where spaces and prefabs sit and W141, apart so the editor places them without the checks. Not packed yet: the runtime needs them from M5.7.
- `apps/editor/src/spaces/` (the ink scenes have `scenes/`):
  - in the editor's start, a few lines: `state.ts` (the file open, the objects chosen, the toolbar's settings), `load.ts`, `open.ts` (from a problem), and the two panels' shells, `ScenePanel` and `OutlinerPanel`;
  - loaded with a project, without three: `SceneBrowser` (the list, or the file open), `SpaceList`, `SceneToolbar`, `Outliner`, `ObjectForm` (the inspector's), `live.ts` (the open file and every prefab, read again after each change), `actions.ts` (the edits as steps of undo);
  - plain functions with tests: `vec.ts` (vectors and turns, held to three's own Euler and Quaternion), `snap.ts`, `gizmoMath.ts` (rays against axes, planes and rings; moves, turns and scales), `handles.ts` (where handles are and which a pointer is on), `drag.ts` (one drag), `orbit.ts` (the camera), `spaceFile.ts` (defaults, ids, the writer), `spaceEdits.ts` (add, place, change, rename, delete, group, and their file changes);
  - loaded with the first file opened, with three: `SceneView`, `viewport.ts` (the renderer, light, grid, picking, drawing on demand), `build.ts`, `gizmoView.ts`, `gestures.ts` (pointers and keys).
- The panels: `scene` docks beside Play and `outliner` above the Inspector on desktop (`DOCK_ABOVE`); both are tabs on a tablet; on a phone the Scene panel is behind More and the outliner a tab of the sheet (`SHEET_TABS`).
- `window.__ebViewport`, a hook for the e2e: the backend, how many frames were drawn, where to take hold of each handle (`grips`, the spot along it farthest from the others, on screen), a point on an object clear of every handle (`objectAt`), and the camera.

## The gate (D63)

- **An e2e builds a space in the editor** (`spaces.spec.ts`, `spacesPhone.spec.ts`), on desktop by mouse and keys, and at 360×740, 390×844 and 844×390 by touch:
  - a prefab made with a box in it;
  - a space with three placements of it;
  - one moved, turned and scaled by gizmo drags, each landing on the snap steps;
  - two picked together and grouped into a new prefab;
  - that placement renamed in the outliner;
  - the camera flown with the right button and W, zoomed by the wheel, and pinched by two fingers;
  - nothing drawn while the editor is still;
  - the page reloaded, and everything as it was.
- **Each screen it shows** passes the checks every page gets: nothing past the edges, 44 px targets, axe at every impact.
- **CI has no WebGPU adapter,** so the e2e runs on WebGL2 in software. The WebGPU path is first seen on Evan's phone.

## Open questions

1. Should a placed prefab be openable in place, edited inside the space, as well as in its own file?
2. Is 0.5 m the right default move step for both interiors and exteriors, or should a space set its own?
3. Does fly mode need a touch form, such as a stick, before M5.7's movement controls?
4. A phone held sideways leaves the view about 200 px tall, under the toolbar's two rows. Should the toolbar sit beside the view there, as a column?
5. The grid is 60 m across whatever the space. Should it follow the space's size, or the camera?
