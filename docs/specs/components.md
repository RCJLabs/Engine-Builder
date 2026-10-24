# Components, placed records and overrides (M5.2, D64)

M5.2 is Phase 5's second milestone. It gives a space's objects three things M5.1's files lacked:

- **components**, each a set of fields whose kind says what they mean (a light, a trigger zone);
- **placed records**, where an object stands for a record (an actor, an item, a container) with some of its fields changed there;
- **overrides**, where a placement of a prefab changes fields of the objects inside it.

Nothing here runs in a game yet. M5.2 makes them data, checks, forms and markers in the view; M5.7 runs them. The files are still those of [viewport.md](viewport.md), which this spec extends.

## An object

M5.1's fields stay as they were. M5.2 adds four:

| Field | Holds | Left out |
| --- | --- | --- |
| `record` | a record placed here, as `type:id` | (a shape or a prefab instead) |
| `components` | the object's components, by kind: `{ "light": { "range": 8 } }` | no components |
| `overrides` | on a placed record, its fields changed here; on a placed prefab, its objects' fields changed here, by id | nothing overridden |

- **An object is one of three things:** a shape, a placed prefab, or a placed record. Exactly one of `shape`, `prefab` and `record`, or E058.
- **Field order in a file:** `id`, `name`, `shape`, `prefab`, `record`, `at`, `turn`, `scale`, `color`, `components`, `overrides`. The editor still writes one object to a line.

```json
{
  "name": "The yard",
  "objects": [
    { "id": "ground", "shape": "plane", "scale": [20, 1, 20], "color": "#7a8b5c" },
    { "id": "lamp", "prefab": "lamp-post", "at": [3, 0, 0], "overrides": { "bulb": { "components": { "light": { "range": 12 } } } } },
    { "id": "keeper", "record": "actor:keeper", "at": [0, 0, 2], "overrides": { "name": "Old Tom" } },
    { "id": "gate", "shape": "box", "scale": [4, 3, 1], "components": { "trigger": { "effects": [{ "effect": "set-flag", "flag": "at-gate", "to": true }], "once": true } } }
  ]
}
```

## Components

- **`components` maps a kind to that component's fields.** An object has at most one component of each kind.
- **A kind is a type file** ([type-files.md](type-files.md)): a title and fields, in the format of `types/<type>.json`. Its form is drawn from it as a record's is, and its fields are checked as a record's are, references, conditions and effects included.
- **The engine's kinds** are five, their ids taken:

  | Kind | Fields | Means (from M5.7) |
  | --- | --- | --- |
  | `light` | `color` (colour), `intensity` (number, 0 to 100), `range` (number, metres, above 0), all optional | a point light at the object |
  | `collider` | `shape` (`box`, `sphere` or `capsule`), `moves` (bool), both optional | something solid, the object's size; still unless it `moves` |
  | `trigger` | `when` (condition), `effects` (effects), `once` (bool); `effects` required | a zone, the object's box, whose effects run as the player comes in, when `when` holds |
  | `spawn` | `start` (bool), optional | a place the player can arrive at, facing the object's turn; `start` is where a space is entered first |
  | `sound` | `of` (a `sound` or an `ambience`), `volume` (number, 0 to 1), `range` (number, metres, above 0); `of` required | a sound heard near the object |

  Left out, a light is white, of intensity 1 and range 10 m; a collider is a box and still; a sound plays at volume 1 to 10 m. The runtime fills these in, so a file holds only what was changed.
- **A project's own kinds** are `components/<id>.json`, type files whose id is the kind's. A kind with an engine kind's id, or a file in a folder or not named by an id, is E017, as a type file in `types/` is; a file that isn't a type file is E015.
- **On a placed prefab,** a component belongs to the placement, beside the prefab's own objects; on a placed record, to the record's place.

## Placed records

- **`record` names any record** of the project, by `type:id`, as a field that allows several types does (D20). A record or a type the project lacks is E064.
- **Its `overrides` change the record's fields here,** each a field of the record's type, its value replacing the record's whole: `{ "name": "Old Tom" }`. A field the type lacks, or a value that doesn't fit the field, is E065, at the override.
- **The record with its overrides is checked as a record,** so an overridden reference must name a record that exists, and so on. The record itself stays as it is.
- **"Used by"** lists the placement beside the records that use a record: `spaces/yard.json`, object `keeper`.
- **Renames follow:** a record or a type renamed rewrites every placement of it, and a field renamed rewrites the overrides that name it, as both rewrite records (D33).

## Prefab overrides

- **A placed prefab's `overrides` are keyed by the ids of the prefab's objects.** Each holds the fields of that object changed in this placement: `{ "bulb": { "color": "#ffcc66" } }`.
- **What an override can change:** `name`, `at`, `turn`, `scale`, `shape` and `color` (on a shape), `components`, and `overrides` (on a placed record or a placed prefab inside). It can't change `id`, nor what an object is or places: `shape` for a prefab, `prefab` or `record` are E058.
- **Deeper objects** are reached by nesting: a placement of `house` overrides the knob of the `door` placed inside it with `{ "door": { "overrides": { "knob": { "color": "#c0a040" } } } }`. This is D64's path of ids.
- **How an override meets the prefab:**
  - `name`, `at`, `turn`, `scale`, `shape` and `color` replace the prefab's value whole;
  - `components` merge kind by kind, field by field: `{ "light": { "range": 12 } }` changes the range and keeps the light's colour. A kind the object lacks is added, and must then be whole;
  - `overrides` merge key by key, by these same rules.
- **An override naming an object the prefab doesn't have** is E066.
- **What the merge makes is checked as an object,** so an override that leaves a component short of a required field is E063, at the override.
- **A change to the prefab** reaches every placement, except in the fields a placement has overridden.

## Checks

| Code | When |
| --- | --- |
| E058 | (M5.1's, widened) an object isn't one of a shape, a placed prefab and a placed record; an override's field is one it can't change |
| E062 | a component's kind is neither the engine's nor in `components/` |
| E063 | a component's fields don't fit its kind, after any overrides |
| E064 | an object places a record, or a type, the project doesn't have |
| E065 | a placed record's override isn't a field of its type, or doesn't fit the field |
| E066 | an override names an object the prefab doesn't have |
| W142 | more than one spawn in a space says `start` |

`eb validate` and the Problems panel both report them, each at its line. E015 and E017 cover files under `components/` as they do files under `types/`.

## Open questions

1. Should an override be able to take a component away, as Unity's "removed component" does?
2. Should a placed record's overrides reach inside a field (one item of an inventory), rather than replace the field whole?
