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
  start that names no space is E075, which `readProjectFiles` gives, so the editor's catalog
  shows it too. A game whose screens name each space never needs one.
- **A new game** holds `space` from its first step: the module's init sets it to the start.
- **Version 1 saves** load with `space` the start, no `at`, and nothing taken: the migration to
  version 2 sets them. `trail-world-v1.json`, saved by M5.8's build of the trail, still loads,
  migrated, and plays on (`tools/cli/test/world.test.ts`).
- **The facts:** `world.in(space)` while the player is in it, `world.taken(space, object)` once it
  is taken, `world.fired(space, object)` once a once zone or use has run.

## enter-space

`{ "effect": "enter-space", "space": "bothy", "spawn": "door" }` moves the player to a space,
at a spawn point or at the space's start when `spawn` is left out. Any effect list can hold it:
a zone's, a use's, a talk's, an event's, a quest stage's.

- It sets `space` and `arrive` and clears `at`.
- It raises `world/arrived` with the space.
- E076: the space isn't one of the project's, or the spawn isn't a spawn point in it, in a
  record's effects and in a zone's or a use's, by `eb validate` and in the editor.
- A script's own `enter-space` that names what isn't there throws: E076 keeps them from content.

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

- **The prompt** shows for the nearest object with an interact within 2 m of the body's middle
  (0.9 m over the feet) to the object's middle, and within 60° either side of where the player
  faces (`walk/interact.ts`). It is a button, 64 px tall, left of Jump and at its height, inside
  the safe area: its label, and the key that uses it, E or the pad's X, or none after a touch.
  Tapped or clicked, it uses what it offers.
- **Using it** sends `world/at` and then `world/use` `{ space, object }`, once a press. Refused:
  `no-use`, `taken`, `spent`, `unmet`.
- **What zones and uses hold** is heard by the kits' checks as a record's effects are: a use's
  `start-quest` starts its quest (W125), and a zone's `set-stage` must name a stage the quest has
  (E043), each at the space's line.
- **A pickup** is an interact with `"takes": true` and a `give-item`.
- **A door** is an interact, or a trigger zone, whose effects hold `enter-space`.

## The Space widget

- `space` may be left out: the widget then draws the space the player is in, and starts the stage
  again as `enter-space` moves them. A project with no spaces/ gives such a widget E049. New screen's
  Space template leaves it out.
- **Starting:** in the space the player is in, the stage stands them at `at`, facing its yaw, or
  at the spawn point `arrive` names, or at the space's start; in any other space, at its start.
  Where they stand is read as the stage starts, never after: each `world/at` would start it again.
- **Between spaces** the host shows a loading screen over the box, the next space's name and
  "Loading…" as a status, until the stage has drawn its first frame; the walk runs only then.
- **What is taken** is hidden, with everything inside it, and its solids leave the physics, as the
  sim says so after each step, without drawing the space again.
- **The outbox:** the shell drops a step asked for while another is on its way, so the stage's
  `world/at`, `world/use` and the zones' `world/trigger` go one at a time (`walk/outbox.ts`). A
  dropped one is tried again 50 ms later, up to 60 times, by a timer, so a hidden page still sends
  it; a newer `world/at` takes the place of one still waiting.
- **A stage a step behind** says nothing of where the player stands in a space the sim hasn't them
  in; a `world/at` that arrives anyway is refused `elsewhere`.

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

The glen (`tools/cli/test/fixtures/glen`) is the slice: a glen with a rope to take, a bothy whose
door is an interact and whose lamp is on a table, a shed whose door is a zone, and a gate's zone
on the way to it that sets the supplies quest's last stage. `glen.test.ts` plays it through the
session; `glen.spec.ts` walks it by keys and the mouse and by a stand-in pad, and
`glenPhone.spec.ts` by touch at 360, 390 and sideways.

## Open questions

1. Moving bodies (the crate) go back to their authored place on a load. Should a save keep them?
2. A use that needs a held key or a long press, such as a lever, is later.
3. How far the prompt reaches, and its 60°, are first guesses until tried on a phone.
4. `enter-space` to the space the player is already in sets `arrive` but the widget, whose space is
   the same, doesn't start the stage again, so the player doesn't move. A ladder or a teleport in
   one space needs it.
5. `world/trigger` and `world/use` don't check the player is in their space, as `world/at` does:
   a widget that names a space the player isn't in still sends them, as M5.8's did.
