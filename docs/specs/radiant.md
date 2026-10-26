# Spec: radiant slots

How a quest's slot finds what to be about in the world: a space by its tags, and a thing in it, so a bounty can be on "a bandit in a cave" and a fetch on "the cache in the nearest cave" (M6.7, [D79](../decisions.md)). It builds on the quests kit's slots ([quests.md](quests.md#slots), M3.10), the world module ([worldspaces.md](worldspaces.md)) and M6.6's targets and doors ([markers.md](markers.md)).

## Tags

A space and any object can carry `tags`: lowercase words joined by hyphens, each once, at most 16.

```json
{ "name": "The barrow", "tags": ["cave"], "objects": [
  { "id": "cache", "shape": "box", "tags": ["cache"], "components": { "interact": { "label": "Take the supplies", "takes": true, "effects": [] } } },
  { "id": "wick", "record": "actor:wick", "tags": ["chief"] }
] }
```

- **A space's tags** sit beside its name. A prefab has none of its own: a placement of it does.
- **An object's tags** are a field like its name or colour, so a prefab's objects carry theirs, and an override changes them as it changes any other field ([components.md](components.md#prefab-overrides)). An object's tags are its own: a placement's tags are not its inner objects'.
- **A tag means only what quests ask of it.** The engine reads none.

## Slots that find in the world

Two slot types join the record types, and an actor slot can be found in the world too:

```json
"slots": [
  { "id": "cave", "type": "space", "tags": ["cave"], "pick": "nearest" },
  { "id": "cache", "type": "object", "in": "@cave", "tags": ["cache"] },
  { "id": "chief", "type": "actor", "in": "@cave", "where": "factions.faction-of(@chief) == bandits" }
]
```

| Field | Means |
| --- | --- |
| `type` | `space`: it holds a space's id. `object`: it holds an object's path in a space. Or a record type, as before |
| `in` | for an `object` or an `actor` slot: the space it is found in, a space's id or `@slot` of an earlier `space` slot. Required for `object` |
| `tags` | for a `space`, `object` or `actor` slot: the tags a match carries, every one of them. An actor's are its placement's |
| `where` | as before, `@` and the slot's id standing for the match: a space's id, an object's path or an actor's id |
| `pick` | as before, or `nearest`: the fewest doors from the space the player is in, ties at random |

A slot that finds in the world is one of type `space` or `object`, or an `actor` slot with `in` or `tags`. It takes no `record`, and needs no `where`: its tags may be enough.

### What matches

1. **The things tried:**
   - a `space` slot: every space, by id;
   - an `object` slot: every object in its space with tags, by path, through prefabs;
   - an `actor` slot: every actor placed in a space, by id, in its space when it names one.
2. **A thing is left out** when:
   - it lacks one of the slot's tags;
   - it fills an earlier slot of this quest;
   - its Where doesn't hold (an unknown counts as not holding);
   - it is an object that was taken (`world.taken`), or an actor that has fallen (`world.npc-down`). Nothing comes back in M6.7 (D79).
   - For a slot that `goes`, it is away, as before.
3. **One is picked:**
   - **first:** by id or path;
   - **random:** from the kit's stream `quests/slots`;
   - **most or least:** by its By;
   - **nearest:** the least `world.doors` to its space. A thing no door leads to is left out, as By leaves out a thing it gives no number for. Ties are drawn from `quests/slots`, once for the tied.

### A space slot tries again

Slots fill in the order written. When a slot `in` a space slot can't be filled, the space slot's next match is tried, in the pick's order, and the slots after it are filled again. The quest doesn't start only once every match has been tried. So "the cache in the nearest cave" goes to the next cave when the nearest one's cache is taken, with no Where for the author to write.

Only a space slot tries again, and only for the slots `in` it. A random space slot's order is drawn as it goes: one from those left each time it tries again.

### A repeat goes somewhere new

A run of a quest that repeats tries each world slot's pick from the run before last, after every other match. So a fetch from "a cave" goes to the other cave next time when there is one, and back to the same one when there isn't. A record slot fills as it always has: a rule like "the most famous" means the same one.

### Names

`{cave}` in a text is the space's name. `{cache}` is the object's name, else its placed record's name, else its prefab's name, else the last id of its path. `{chief}` is the actor's name, as before.

### Bound

`@cave` binds to the space's id and `@cache` to the object's path, wherever a slot is bound ([quests.md](quests.md#slots)). So these all name what a run found:
- a target, `{ "space": "@cave", "object": "@cache" }`;
- a count, `{ "event": "world/used", "args": { "space": "@cave", "object": "@cache" } }`;
- an effect's fields, such as `walk-to`'s `to`.

M6.6's markers then point at it, through the doors toward its space.

### Gone

A world slot's thing is gone when the space or the object no longer exists, as a record's is, or when its Keeps while stops holding. An object taken or an actor fallen while the quest runs is not gone: that is usually how it is done. Content that should fail on it says so in Keeps while: `"keeps": "!world.npc-down(@chief)"`.

## Facts

- **`world.doors(space)`:** the fewest doors from the space the player is in to that space, over M6.6's doors. 0 for the same space, unknown when no door leads there.
- **`factions.faction-of(actor)`:** the actor's faction, unknown for one with none.

## The pack: format 15

A project in which any space or object has tags packs as format 15. The world gains `places`:

```json
"places": {
  "spaces": { "barrow": { "tags": ["cave"] }, "green": { "tags": [] }, "hall": { "tags": [] }, "mine": { "tags": ["cave"] } },
  "objects": { "barrow": { "cache": { "tags": ["cache"] }, "wick": { "tags": ["chief"] } },
               "mine": { "stash/chest": { "tags": ["cache"], "name": "Old chest" } } }
}
```

- **Every space is a key** of `places.spaces`, its tags sorted, none or not. The space's name is read from the space as packed.
- **Each object with tags** is in `places.objects` by its space and path, resolved through prefabs and overrides, with its name as `{slot}` shows it when it has one.
- **Format 15 keeps the actors' places** (format 11's `actors`), navmeshes or none, as formats 12 to 14 do.
- **Every pack without tags keeps its format and its hash.**

The world module's data gains the places, and the quests kit is built with them, as the time kit is with the calendar.

## Checks

- **E088:** a slot that finds in the world and can't be read. That is:
  - `space` or `object` in a project with no spaces;
  - an `object` slot with no `in` or no `tags`;
  - `in` naming no space and no earlier `space` slot;
  - `in` on a slot that isn't an `object` or an `actor`;
  - `tags` on a slot of a record type other than `actor`;
  - `record` on a slot that finds in the world;
  - `nearest` on a slot that doesn't find in the world.
- **W127**, as before for records, now also for a world slot nothing in the project can ever fill. That is:
  - no space carries a `space` slot's tags;
  - no object in its space carries an `object` slot's tags (for `in: @slot`, in any space the space slot can find);
  - no placed actor carries an `actor` slot's tags.
- **E086** takes `@slot` for a target's space and object: the space a `space` slot, and the object an `object` slot `in` it. A slot named for a space or an object that holds anything else is E086, as an actor slot that holds a non-actor is.
- **E058** for tags that aren't a list of words, or that list a word twice.

## In the editor

- **Tags** in the inspector:
  - for the open space, with nothing chosen, beside its Environment;
  - for an object, beside its name, and under an object inside a placement as an override.
  
  Each tag is a chip with a 44 px remove button. A box adds one and offers the project's tags.
- **A slot's form:**
  - Type offers `space` and `object` with the record types;
  - In offers the spaces and the space slots before it;
  - Tags offer the project's tags;
  - Pick offers Nearest.
  
  A target's Space and Object offer the space and object slots, as Actor offers the actor slots (M6.6).
- **Problems:** E088 and W127 at the slot's fields, as `eb validate` gives them.

## The gate

The hollows (`tools/cli/test/fixtures/hollows`):
- **The spaces:**
  - a green with a notice board and a bounty post;
  - the barrow, a cave one door from the green;
  - the hall, between the green and the mine;
  - the mine, a cave two doors from the green.
- **What is in them:** each cave has a cache, the mine's through a prefab, and a bandit.
- **Supplies,** read from the board, repeats: "the cache in the nearest cave".
- **The bounty,** from the post, repeats: "a bandit in the nearest cave".

It is checked four ways:

- **Headless, through the session:**
  - Supplies goes to the barrow, then the mine, then waits with both caches taken.
  - The bounty goes to the barrow's bandit, then the mine's, each felled, then waits.
  - Each run's journal names the cave.
  - A save mid-run loads to the same slots.
  - The fixture breaks once for E088, W127 and E086's slots.
- **By keys in the Play panel:** Supplies is read from the board, the compass points through the barrow's door, and the cache is taken. Read again, it points through the hall to the mine, whose cache is taken, and the board offers no third run.
- **By touch** at 360, 390 and sideways: the board read by a tap, the compass on the barrow's door, the journal naming the barrow, and the Map's pin at the door.
- **In the editor alone** at 1280 and 390, from the hollows with no tags and no Supplies:
  - the caves tagged in the space's form;
  - the mine's cache tagged through the prefab;
  - Supplies' two slots made with forms, E088 shown and gone;
  - and played to the barrow's door.

## Open questions

1. **Resetting spaces** (D79): a space's fallen and taken coming back after days away, which touches every kit's per-actor state and every save.
2. **Making a thing at a found place,** Bethesda's "create a reference": a bandit chief put in the chosen den, or an heirloom in its chest once containers come (M6.8).
3. **NPCs that travel between spaces:** an actor slot's space is where the actor is placed, which holds only while NPCs stay in their space ([ai.md](ai.md#open-questions), 1).
4. **Nearest in metres** within one space, from where the player stands: the pack would carry each tagged object's place.
