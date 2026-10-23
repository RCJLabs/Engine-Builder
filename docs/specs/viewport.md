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
- Turns are degrees and order YXZ so a person can read and edit them. Quaternions never reach a file.

### Checks

| Code | When |
| --- | --- |
| E058 | A space or prefab file isn't JSON of the shape above: a field missing, unknown or of the wrong kind, a scale of 0 or less, a shape and a prefab both or neither. |
| E059 | Two objects in one file share an id. |
| E060 | An object places a prefab that `prefabs/` doesn't have. |
| E061 | A prefab places itself, directly or through others. |

`eb validate` and the Problems panel both report them, each at its object's line.

## The Scene panel

- **The list.** With no space open, the panel lists the project's spaces and prefabs, each with New space and New prefab. A new one asks for a name, and its id comes from the name.
- **The viewport** fills the panel once a space or a prefab is open. On a phone the panel sits behind More and fills the screen (D63).
- **The renderer** is three.js's `WebGPURenderer`, which uses WebGPU where the browser has it and WebGL2 otherwise (D8). three loads with the panel's first space, never with the editor's start. The offline cache holds it.
- **Drawing on demand.** The view is drawn when something changes: the camera, the file, the selection or the size. A still editor draws nothing, which spares a phone's battery.
- **Light and ground.** The editor lights every space the same: a hemisphere light and a sun from above and behind the camera's start. A grid marks the ground plane at 1 m. These are the editor's, never saved.

### The camera

- **Orbit** around a point:
  - by mouse, drag with the left button to orbit, the right to pan, and the wheel to zoom;
  - by touch, one finger orbits, and two fingers pan and pinch.
- **Fly**, on desktop: hold the right button and use W, A, S, D, Q and E.
- **Frame** puts the selection, or the whole space, in view.
- The camera isn't saved.

### Picking and selection

- A tap or click on an object selects it. On empty ground it selects nothing.
- **Many at once:** Shift or Ctrl with a click adds or takes away. On touch, the toolbar's Select more does the same for each tap until it's turned off.
- A placed prefab selects as one object. Its own objects are edited in the prefab.
- The selection is outlined in the view, and the same in the outliner.

### The gizmo

- **Three modes,** chosen in the toolbar:
  - **Move:** an arrow on each axis, and a square on each plane between two;
  - **Turn:** a ring around each axis;
  - **Scale:** a block on each axis, and one at the centre for all three.
- **Its size stays the same on screen** however far the camera is. Every handle's hit area is at least 44 px across, larger than it looks.
- **Dragging** follows the pointer: along an axis, the closest point on the axis to the pointer's ray; on a plane, where the ray meets it; on a ring, the angle around it.
- **With many selected,** the gizmo sits at their centre and moves, turns or scales them all about it.
- **One drag is one step** of the editor's undo, written when the pointer lifts. Until then the view shows the drag and the file waits.
- **Snapping** is on by default and turned off in the toolbar: moves in 0.5 m, turns in 15°, scales in 0.1. Holding Ctrl or ⌘ while dragging snaps the other way.

### The toolbar

Move, Turn, Scale, Snap, Add (box, sphere, cylinder, plane, or a prefab), Select more, Group into prefab, Delete, Frame, and Back to the list. Every button is at least 44 px. On a phone the toolbar wraps onto two rows rather than scroll.

- **Add** puts the new object in front of the camera, on the ground, selected.
- **Group into prefab** asks for a name, makes `prefabs/<id>.json` from the selected objects around their centre, and puts one placement of it where they were. It is one step of undo.
- **Delete** removes the selected objects, one step of undo.

### The outliner

- **Every object of the open file, in order,** by name, a placed prefab marked with its prefab's name.
- **Choosing a row selects the object,** with Shift or Ctrl for many, as in the view.
- **Rename** edits the object's name in place. The id stays, as a record's does until it is renamed.
- **On desktop and tablets** it is a panel of its own. On a phone it is a tab of the inspector sheet, beside the object's form (D63).

### The inspector

- **One object:** its name, place, turn and scale as number fields, and either its shape and colour or its prefab, with Open prefab. Typing joins into one step, as the record form's fields do.
- **Several objects:** how many, with Group into prefab and Delete.

## Where it lives

- `packages/schema/src/spaceSchema.ts` and `spaceCheck.ts`: the shape and E058 to E061.
- `packages/compiler/src/spaces.ts` and `spaceFiles.ts`: the files read and checked for `eb validate`. Not packed yet: the runtime needs them from M5.7.
- `apps/editor/src/scene/`:
  - plain functions: `spaceFile.ts` (reading a file, defaults, ids), `spaceEdits.ts` (adding, moving, deleting, renaming, grouping), `snap.ts`, `gizmoMath.ts`;
  - three.js: `build.ts` (a space as a three scene), `viewport.ts` (the renderer, the camera and picking), `gizmo.ts`;
  - components: `ScenePanel`, the lazy `SceneBrowser`, `SceneView`, `SceneToolbar`, `Outliner` and `ObjectForm`.
- `window.__ebViewport`, a hook for the e2e: where each handle is on screen, and the camera's place.

## The gate (D63)

- **An e2e builds a space in the editor,** on desktop by mouse and keys, and at 360×740, 390×844 and 844×390 by touch:
  - a prefab made with a box in it;
  - a space with three placements of it;
  - one moved, turned and scaled by gizmo drags, each landing on the snap steps;
  - two picked together and grouped into a new prefab;
  - that placement renamed in the outliner;
  - the page reloaded, and everything as it was.
- **Each screen it shows** passes the checks every page gets: nothing past the edges, 44 px targets, axe at every impact.
- **CI has no WebGPU adapter,** so the e2e runs on WebGL2 in software. The WebGPU path is first seen on Evan's phone.

## Open questions

1. Should a placed prefab be openable in place, edited inside the space, as well as in its own file?
2. Is 0.5 m the right default move step for both interiors and exteriors, or should a space set its own?
3. Does fly mode need a touch form, such as a stick, before M5.7's movement controls?
