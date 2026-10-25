# Worldspaces (M5.9, D71)

A game with more than one space: doors between them with a loading screen, things to take that
stay taken, and saves that put the player back where they stood. Streamed exteriors and snapping
for modular kits are M5.10's.

## Where the player is

The world module's slice, version 2, holds:

| Field | What it is |
| --- | --- |
| `fired` | the once zones and once uses that have run, as "space/object", sorted (version 1's) |
| `space` | the space the player is in |
| `at` | where they stood and which way they faced, `{ feet: [x, y, z], yaw }`, or left out |
| `arrive` | the spawn point they arrive at, when `at` is left out |
| `taken` | the objects taken, as "space/object", sorted |

- **The start:** a game starts in project.json's `"start-space"`, or in its first space by id. A
  start that names no space is E075. A game whose screens name each space never needs one.
- **Version 1 saves** load with `space` the start, no `at`, and nothing taken.

## enter-space

`{ "effect": "enter-space", "space": "bothy", "spawn": "door" }` moves the player to a space,
at a spawn point or at the space's start when `spawn` is left out. Any effect list can hold it:
a zone's, a use's, a talk's, an event's, a quest stage's.

- It sets `space` and `arrive` and clears `at`.
- It raises `world/arrived` with the space.
- E076: the space isn't one of the project's, or the spawn isn't a spawn point in it.

## world/at

The stage tells the sim where the player stands: `{ "action": "world/at", "space", "feet", "yaw" }`.
Like `world/trigger` it is never offered and is let through from the page.

- Refused: `bad-at` (not three finite numbers and a finite yaw), `elsewhere` (not the space the
  player is in, as from a stage a step behind an `enter-space`).
- The sim keeps it to the centimetre and the tenth of a degree, the yaw turned into 0 to 360.
- The stage sends it:
  - as the shell pauses, and as the page hides;
  - before each `world/use`;
  - every 5 s while the player has moved 0.5 m since the last.
- Each is a step, so each makes a save. A load puts the player at `at`, facing `yaw`.

## Interact

A new component kind, `interact`:

| Field | What it is |
| --- | --- |
| `label` | what the prompt says: "Take", "Open", "Read" |
| `when` | a condition; the prompt shows only while it holds |
| `effects` | what using it does |
| `once` | it can be used once |
| `takes` | using it takes the object: it stops being drawn or solid, saved in `taken` |

- **The prompt** shows for the nearest object with an interact within 2 m of the feet and within 60°
  of where the player faces. It shows the label and the key: E, the pad's X, or a touch button
  beside Jump.
- **Using it** sends `world/use` `{ space, object }`. Refused: `no-use`, `taken`, `spent`, `unmet`.
- **A pickup** is an interact with `"takes": true` and a `give-item`.
- **A door** is an interact, or a trigger zone, whose effects hold `enter-space`.

## The Space widget

- `space` may be left out: the widget then draws the space the player is in.
- Between spaces it shows a loading screen: the next space's name and "Loading…" as a status, with
  the walk paused, until the stage has drawn its first frame.
- What is taken is hidden as the sim says so, without drawing the space again.

## Packs

Format 10's world adds each space's uses, resolved through prefabs and overrides as its trigger
zones are, each space's spawn points by the object's path, and the start space. A world that
format 9 holds (no uses, no spawn points, its first space by id the start) is still written as
format 9, so its hash stays; a pack without spaces keeps its format and hash too.

## The gate

A slice of one exterior and two interiors, walked in the Play panel by keys, a pad and touch:
- pickups taken into the inventory and gone after a load;
- a quest's stage set by a trigger;
- a door each way, with the loading screen between;
- a save and a load that put the player back where they stood, in the space they were in.

## Open questions

1. Moving bodies (the crate) go back to their authored place on a load. Should a save keep them?
2. A use that needs a held key or a long press, such as a lever, is later.
3. How far the prompt reaches, and its 60°, are first guesses until tried on a phone.
