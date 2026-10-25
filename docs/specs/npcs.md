# NPCs (M6.1, D73)

People in a space, made of actor records: how they look, what they carry, which faction they are,
and their talk, opened by walking up to them. They stand where they were placed: walking is
M6.2's and M6.3's, and moving limbs are M6.5's.

## An NPC

- **An NPC is a placed actor.** A space or prefab object whose `record` is `"actor:<id>"`. It is
  placed as any record is (M5.2, [components.md](components.md)), with overrides.
- **One place each.** An actor stands in one place across the project's spaces, counted through
  each prefab's placements: a second place is **E077** at that object's line, naming the first.
  A prefab holding an actor may be placed once.
- **Its state is the actor's,** keyed by its id as every kit keys it: its stats and statuses (the
  stats kit), what it wears (gear), its bag (inventory), the party's standing with its faction
  (factions) and its talk (dialogue).

## The actor's fields

The actor type (the stats kit's, D42) gains these, each with its kit:

| Field | Kit | What it is |
| --- | --- | --- |
| `model` | stats | a model record it draws as |
| `figure` | stats | how the engine draws it without a model: `height` in metres (1.75 when left out, 0.5 to 2.5), and `clothes`, `trim` and `skin` as `#rrggbb` |
| `talk` | dialogue | the talk Interact opens |
| `faction` | factions | the faction it belongs to |
| `carries` | inventory | its bag at the start: items by count, 1 or more each |

A project's own `types/actor.json` may add fields of its own after these (D41); a name it shares
with one is E037, as before.

## The look

- **With a model:** the NPC draws as its model (M5.5): its materials, its slots, its LOD levels and
  its collider as its solid. The model faces −z, as every placed model does.
- **Without one:** the engine draws a **figure**, in the Scene panel and in play:
  - a body, a capsule 0.3 m round from the ground to three quarters of the height, in `clothes`;
  - a band at the waist in `trim`;
  - a head, a sphere at the top a fifth of the height across, in `skin`;
  - a nose, a small box on the head's −z side, so where it faces is seen;
  - its solid is a capsule 0.3 m round and its height tall, fixed.
- **Colours left out** are the engine's: a grey-blue coat, a brown trim and a mid skin.
- **Both stand still.** An NPC has no animation and doesn't move, until M6.5 and M6.2.

## Talking

- **A Talk use.** A placed actor with a `talk` is a use of the world's (M5.9): its label is
  `Talk`, and its one effect is `open-talk` of that talk. `world/use` runs it as any use: it is
  refused while the talk can't open (`dialogue` says why). Its point is the NPC's chest, at two
  thirds of its height, for Interact's 2 m and 60° (worldspaces.md).
- **An interact component** on the same object is its use instead, and the talk is the actor's
  for its own effects to open.
- **Facing.** As the player uses an NPC's Talk, the NPC turns about its own up axis to face them,
  over 0.25 s. Once the walk goes on (the talk's screen gone), it turns back to where it was placed
  over 0.5 s. The turn is the stage's: no save holds it, and its solid, a capsule, doesn't change.
- **The walk pauses under a screen.** While any screen covers the one holding the Space widget (a
  talk, an event, a shop, a hall, an inventory page), the walk stops as it does under the shell's
  pause: no fixed steps, no zones or uses sent, no stands, and keys, pad and touch dropped, held
  keys forgotten. It goes on where it stopped once the screen is gone.

## Bags

- **The inventory kit's slice is version 2:**

  | Field | What it is |
  | --- | --- |
  | `bag` | the party's items by id, as before |
  | `bags` | by actor, that actor's whole bag, once anything in it has changed |

- **An actor's bag** is `bags[actor]` when it is there, else its `carries`. The first change
  copies `carries` into `bags`, so a content update to `carries` reaches every save in which that
  bag never changed.
- **Effects:** `give-item`, `take-item` and `roll-loot` take an optional `actor`: whose bag, the
  party's when left out. An item's `max` holds for each bag. Their previews say whose.
- **The fact** `inventory.carried(actor: <actor>, item: <item>)`: how many of the item the actor's
  bag holds. `inventory.count` and `inventory.tagged` stay the party's.
- **Events:** an actor's bag raises `actor-gained`, `actor-lost` and `actor-full`, each with its
  `actor`; the party's raises `gained`, `lost` and `full` as before. They are apart because an
  event's arguments are all given or it is refused, so `actor` can't be left out of one.
- **Saves:** version 1 migrates to version 2 with `bags` empty, every NPC's bag its `carries`.
  `packages/kits/test/fixtures/saves/market-inventory-v1.json`, saved by version 1, must keep
  loading.

## Factions

- **The fact** `factions.band-of(actor: <actor>)`: the party's band with the actor's faction, as
  `factions.band` reads it; for an actor with no faction it reads as nothing, as a faction with no
  bands does.
- An actor's faction changes nothing else in M6.1: hostility is M6.3's and M6.4's.

## The pack

- **Uses:** the world's uses (format 10) gain each placed actor with a talk, resolved through
  prefabs and overrides as zones and uses are, by the object's path. A pack holding none is as
  before, its hash kept.
- **Records:** each placed actor is already among the world's records (M5.8), so the page reads its
  `model` and `figure` there.

## The stage

- **Solids:** an NPC with a model has its model's collider; one without has its figure's capsule.
- **Uses:** a use the pack has at a placed actor's path is offered at its chest.
- **The hook,** `window.__ebWalk.npcs()`: each NPC built, by path: its actor, `model` or `figure`
  as three drew it, the yaw it faces now and the yaw it was placed at; `paused` says whether the
  walk is. In the Scene panel, `window.__ebViewport.figures()`: each figure drawn, by its object, at
  its height and in its colours.

## The editor

- **Placing:** Add → Record… offers actors with the other records. The figure is drawn in the Scene
  panel, so a placed actor without a model is a figure, not a marker.
- **Forms:** the actor's new fields are its type file's, so its form has them; `figure`'s colours
  are colour fields.
- **Checks:** E077 in the Problems panel, at the second place.

## The gate

- **The ford** (`tools/cli/test/fixtures/ford`): a hamlet at a river crossing, made only of data.
  - A smith, drawn as a figure, who carries a horseshoe and whose talk gives it to the player.
  - A ferry-keeper, a figure in other colours, whose talk takes the horseshoe for the crossing.
  - A warden, drawn as the starter kit's pillar, who speaks only to friends of the ford (a faction).
  - A drover with no talk, standing in the way: solid, with no prompt.
  - It validates clean and builds as format 10. `ford.test.ts` plays it through the session: each
    talk, the horseshoe from the smith's bag to the party's and on to the ferry-keeper's, the
    warden's line held back until the standing allows it, and a save loaded with the bags as they
    were. It breaks it once for E077.
- **`ford.spec.ts`** walks it in the Play panel by keys and the mouse, and by a stand-in pad: Talk
  prompted at each NPC, its talk opened, the NPC turned to face the player and back after, the walk
  paused under the talk (keys and the pad's stick move nothing), the bags read on the HUD, and a
  save in the middle loaded with the bags kept.
- **`fordPhone.spec.ts`** by touch at 360, 390 and sideways: the prompt tapped, the talk's choices
  tapped, the stick doing nothing under the talk, every screen in reach.
- **`npcEditor.spec.ts`** makes an NPC in the editor alone: a new actor with a figure's colours, a
  talk and a carried item, placed by Add → Record…, seen as a figure in the Scene panel, and talked
  to in the Play panel; at 1280 and 390 wide.

## Open questions

1. A crowd of one actor's copies (guards, villagers) waits for M6.3, with a second key for state.
2. A figure has no arms: a rigged starter character comes with animation (M6.5).
3. Barks, lines an NPC says unasked as the player passes, wait for perception (M6.3).
4. Whether an NPC should turn back to its placed facing or keep facing where the talk left it.
