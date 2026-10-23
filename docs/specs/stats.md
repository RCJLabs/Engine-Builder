# Spec: the stats and gear kits

This is how the stats kit (actors, stats, statuses) and the gear kit (slots, and items worn in them) work (M3.4, [D41](../decisions.md), [D42](../decisions.md)). They are kits as [kits.md](kits.md) has them: switched on in `project.json`, pure modules in `packages/kits`, their types, effect schemas and checks in `@eb/schema`. A port must follow it to hold the same state and read the same values.

It follows the games that came before ([research/stats.md](../research/stats.md)):

- **Bethesda's actor values:** a value worked out from a base and modifiers, and damage kept apart from it, so a maximum that rises raises what is left by the same. Every stat can take damage.
- **Space-Wrecked's traits and odds:** flat points from data, and a number shown as the parts that make it up, the same parts the game adds.
- **Ludus's gear:** four slots, each piece adding a percentage, totals kept within bounds.
- **Wasteland Protocol's statuses and stash:** a status applied again takes the longer duration; equipping moves an item out of the stash and the old one back.
- **Spliceworld's stacks:** a status that stacks to a cap, each stack counting.

## Switching them on

```json
{ "format": 1, "id": "arena", "name": "Arena", "version": "0.1.0", "kits": ["inventory", "economy", "stats", "gear"] }
```

- **The kits** are, in the engine's order, `inventory`, `economy`, `stats` and `gear`. `stats` needs no other kit; `gear` needs `stats` and `inventory`.
- Everything [kits.md](kits.md#switching-kits-on) says of a kit holds for these: E033, E034, the types, facts, events and effects, the modules' place in a game, format 3 packs.
- **The stats module is built knowing whether gear is on,** and then reads the gear kit's sums for each value. A module can't ask whether another's fact exists, so the kit list decides it.

## Numbers

- **Whole numbers** throughout, as in [kits.md](kits.md#numbers). Percents are whole percents.
- **A value is worked out, never saved:** from content (an actor's base, a status's modifiers, an item's), and the few things the state holds (base raised, damage taken, statuses, what is worn). A content update to any of them reaches every save.
- **Exact.** A value is worked out as a fraction in BigInt and rounded once.

## The stats kit

**Records.**

```jsonc
// records/stat/<id>.json
{ "name": "Health", "min": 0, "max": 999, "start": 10 }
// records/actor/<id>.json
{ "name": "Ana", "stats": { "health": 12, "aim": 70 }, "statuses": ["steady"] }
// records/status/<id>.json
{
  "name": "Bleeding",
  "modifiers": [{ "stat": "aim", "add": -10 }, { "stat": "speed", "percent": -20 }],
  "lasts": { "days": 3 },
  "stacks": 3,
  "tags": ["injury"]
}
```

- **A stat:** `min` (0 when left out), `max` (no limit when left out), and `start`, the base of an actor whose record leaves the stat out (`min` when left out).
- **An actor:** `stats`, its base for each stat it gives; `statuses`, those it starts with, a stack each, until removed.
- **A status:** `modifiers`, each naming a stat and an `add`, a `percent` or both, for each stack; `lasts`, `{ "days": n }` or `{ "ticks": n }`, or left out for until removed; `stacks`, the most it can have (1 when left out); `tags`, words conditions count statuses by.

**State.** The `stats` slice holds only what differs from content:

```jsonc
{ "actors": { "ana": {
  "raised": { "aim": 5 },
  "damage": { "health": 3 },
  "statuses": { "bleeding": { "stacks": 2, "until": { "day": 7 } }, "steady": { "stacks": 0 } }
} } }
```

- `raised`: what `add-to-stat` added to a base, by stat; none at 0.
- `damage`: the damage taken, by stat, more than 0.
- `statuses`: a status whose stacks differ from the actor's record (1 for one it lists, 0 otherwise), or that has an `until`.
- An actor with nothing in it is left out.

**A value.** For an actor and a stat:

```
base     = the actor's stats[stat] ?? stat.start ?? stat.min ?? 0, plus raised[stat]
adds     = for each status with stacks: stacks × each of its modifiers' add for the stat; plus gear.add
percents = the same with percent; plus gear.percent
value    = (base + adds) × (100 + percents) ÷ 100, to the nearest whole number, halves up (toward +∞),
           then kept within the stat's min and max
current  = value − damage[stat], and never below min
```

Base 10 with a status of +2 and an item of +20% is (10 + 2) × 120 ÷ 100 = 14.4, so 14, whatever order they come in. A value's **parts** (the base, then each status and each worn item with its add and percent) come from the same function as the value (`statParts`), for a screen to show as they are added.

**Damage** is kept apart from the value. A maximum that rises raises the current amount by as much (D41); one that falls takes it down, but never below `min`, and the damage stays, so it comes back as the maximum does.

**Facts.**

| Fact | Arguments | Domain | Reads |
| --- | --- | --- | --- |
| `stats.value` | actor, stat | whole number | the value: for a pool, its maximum |
| `stats.current` | actor, stat | whole number | the value less the damage taken |
| `stats.has` | actor, status | 0 or more | its stacks |
| `stats.tagged` | actor, tag | 0 or more | the stacks of its statuses with the tag |

**Effects.**

| Effect | Fields | Does |
| --- | --- | --- |
| `add-to-stat` | actor, stat, by | adds `by` to the base (below 0 takes away); raises `stats/base-changed` |
| `damage-stat` | actor, stat, by (1 or more) | adds to the damage, no further than the current amount down to `min`; raises `stats/damaged` by what it really took, and `stats/emptied` when the current amount reaches `min` |
| `heal-stat` | actor, stat, by (1 or more, or left out for all) | takes from the damage; raises `stats/healed` by what it really gave |
| `add-status` | actor, status, stacks (1 when left out) | adds stacks up to the status's cap, and sets its time (below); raises `stats/status-added` with the stacks it now has |
| `remove-status` | actor, status, stacks (all when left out) | takes stacks off; nothing when it has none; raises `stats/status-removed` with the stacks left |

Each has a preview: the value, current amount or stacks before and after.

**Time.** A status that `lasts` gets an `until`: the day it ends (`time.day` + days) or the tick (`time.tick` + ticks).

- **Applied again,** it takes the later of its `until` and the new one. A status that has stacks and no `until` lasts until removed, which outlasts any time.
- **The kit hears time pass** (through a `*` listener, since it can't name an event a game may not have): as each day starts (`time/day-started`, M3.5), and once an advance is done (`time/passed`), for a status that ends on a tick within a day. Then every status whose `until` has come loses all its stacks, raising `stats/status-removed` with 0 left. Ending as the day starts, a status that ran out during a wait doesn't stack with one applied after the wait in the same action, and the rows of the days after it don't see it ([time.md](time.md#start-of-events)).
- **A status the actor's record lists** lasts until removed, whatever its `lasts`: it was never applied, so it has no time.
- **A timed status needs the time module.** Without one, `add-status` throws reading `time.day` or `time.tick`; W114 says so first.

**Events.** `stats/base-changed` (actor, stat, by), `stats/damaged` (actor, stat, by), `stats/healed` (actor, stat, by), `stats/emptied` (actor, stat), `stats/status-added` (actor, status, stacks), `stats/status-removed` (actor, status, stacks).

## The gear kit

**Records.**

```jsonc
// records/slot/<id>.json
{ "name": "Hand" }
{ "name": "Engine bay 1", "takes": ["engine"] }
// an item, with the gear kit on, gains two fields
{ "name": "Rifle", "value": 120, "slot": "hand", "modifiers": [{ "stat": "aim", "add": 10 }] }
// an actor, with the gear kit on, gains two fields
{ "name": "Ana", "stats": { "aim": 70 }, "slots": ["hand", "body"], "wears": { "hand": "rifle" } }
```

- **A slot's** `takes` lists item tags it can wear (M4.12): an item with no `slot` of its own fits any slot that takes one of its tags, so a ship's engines fit any of its engine bays.
- **An item's** `slot` is where it is worn. Left out, it is worn in a slot that takes one of its tags, and with none it can't be. Its `modifiers` count while it is worn, as a status's do.
- **An actor's** `slots` are the slots it has (left out, every slot); `wears` is what it starts wearing, which comes from no bag.

**State.** The `gear` slice holds what differs from the actors' records: `{ "worn": { "ana": { "hand": "pistol", "body": null } } }`, an item or `null` for a slot emptied.

**Facts.** `gear.wearing` (actor, item): how many of its slots wear the item. `gear.add` and `gear.percent` (actor, stat): the sums of what its worn items add and take a percent of, which the stats kit's values read.

**Effects.**

| Effect | Fields | Does |
| --- | --- | --- |
| `equip` | actor, item, slot (optional) | takes one of the item from the party's bag and wears it in its slot: the one `slot` names, else the first of those it fits that is free, else the first. The slot's old item goes back to the bag; nothing when the slot wears it already |
| `unequip` | actor, slot | puts the slot's item back in the bag |

They refuse, changing nothing: `not-wearable` (the item fits no slot), `wrong-slot` (`slot` doesn't take it), `no-such-slot` (the actor lacks it), `not-carried` (the bag has none), `empty` (nothing to take off), `no-room` (the bag can't hold the item coming back). They raise `gear/equipped` and `gear/unequipped` (actor, slot, item).

## Checks

| Code | When |
| --- | --- |
| E035 | as in [kits.md](kits.md#checks), and: a stat whose `max` is below its `min`, or `start` outside them; an actor's base outside its stat's bounds; a modifier with neither `add` nor `percent`; `lasts` with both `days` and `ticks`, or neither; an actor wearing an item in a slot that isn't the item's, or one its `slots` leave out |
| W114 | a status that lasts days or ticks in a game without `time.day` |

## Proof

- **The arena fixture** (`tools/cli/test/fixtures/arena/`) is a slice of Ludus: gladiators with stats, traits and a health pool, injuries that last days and stack, an armoury selling gear for four slots, and bouts whose odds read the stats. Its game is a script; `eb sim` plays it to a golden file with no offer refused.
- A value equals the sum of its parts, rounded once, for every actor and stat the fixture's runs reach.
- **The gate** is in the editor: the kits turned on, records made with forms, a row that hurts and adds a status, an item worn, exported and checked clean by `eb validate`.

## Open questions

1. **Effects over time** (venom, bleeding, regeneration): the kit doesn't go through actors each day; a row on time passing can name one actor, not all.
2. **Who may wear what:** a requirement ("strength 6") needs a condition about the actor wearing it, which conditions can't name: their facts take fixed arguments.
3. **Two-handed items** block nothing yet.
4. **Turns** are not a duration until Phase 6's combat.
