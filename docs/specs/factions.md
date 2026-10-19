# Spec: the factions kit

This is how the factions kit works (M3.5, [D43](../decisions.md)): the factions a game has, the party's standing with each, the bands a standing falls in, the share of a shop's prices a band sets, and drift. It is a kit as [kits.md](kits.md) has them: switched on in `project.json`, a pure module in `packages/kits/src/factions/`, its type, effect schema and checks in `@eb/schema`. A port must follow it to hold the same standings and charge the same prices.

It follows the games that came before ([research/kits-ii.md](../research/kits-ii.md)):

- **Space-Wrecked's sides** (`src/sim/standing.js`): a whole number from −10 to 10 for each side, five levels by where each begins, and a station charging its side's level's share of its prices, from 150 percent when hostile to 75 when trusted.
- **Landnam's neighbours** (`src/data/clans.ts`, `src/sim/neighbours.ts`): −100 to 100, bands with words of their own, and standing that drifts back toward indifference.
- **Dirtbag's crowds and chooser-of-the-dead's gods:** moves written in content, often in opposed pairs, never spread by the engine.

## Switching it on

```json
{ "format": 1, "id": "steading", "name": "Steading", "version": "0.1.0", "kits": ["inventory", "economy", "factions", "time"] }
```

- **The kit** is `factions`. It needs no other kit.
- Everything [kits.md](kits.md#switching-kits-on) says of a kit holds for it: E033, E034, the types, facts, events and effects, the module's place in a game, format 3 packs.
- **With the economy kit on,** a shop gains a `faction` field, and the faction's band sets a share of what the shop charges ([prices](#prices)).
- **Drift** counts the time module's days: the time kit's ([time.md](time.md#the-time-kit)), or a game's own time module. Without one, a faction never drifts (W115).

## Numbers

- **Whole numbers** throughout, as in [kits.md](kits.md#numbers). A price share is a whole percent.
- **Standing is saved only where it differs from the faction's start,** so a content update to a start reaches every save in which that faction never moved.

## Factions

A `faction` record:

| Field | Means |
| --- | --- |
| `name`, `description` | What it is called and what it is. |
| `min`, `max` | The lowest and highest standing, whole numbers. Left out, there is no bound that way. |
| `start` | Where standing begins: 0 when left out, or the nearer bound when 0 is outside them. |
| `bands` | The bands, lowest first. Each has an `id`, words (`name`, `description`), `from` (where it begins) and `price` (a share of a shop's prices, percent, 100 when left out). The first band's `from` can be left out. |
| `drift` | `every` (days, 1 or more) and `toward` (the resting value, the start when left out). |

Space-Wrecked's sides, as a record:

```json
{
  "name": "The Free Traders",
  "min": -10, "max": 10,
  "bands": [
    { "id": "hostile", "price": 150 },
    { "id": "cold", "from": -5, "price": 125 },
    { "id": "neutral", "from": -1 },
    { "id": "friendly", "from": 2, "price": 90 },
    { "id": "trusted", "from": 6, "price": 75 }
  ]
}
```

- **A standing is kept within** `min` and `max`.
- **Its band** is the last whose `from` is at or below it. The first band holds everything below the second's `from`, whatever its own says. A faction with no bands has no band, and its price share is 100.

## State

```json
{ "standing": { "pursuers": -10, "free-traders": 3 } }
```

The slice holds a standing only when it differs from the faction's start, and drops it when it comes back.

## Effects

| Effect | Does | Preview |
| --- | --- | --- |
| `{ "effect": "change-standing", "faction": "free-traders", "by": 2 }` | Adds `by`, a whole number (below 0 takes away; 0 does nothing), kept within the faction's bounds. Raises `standing-changed` with how much it moved, if it moved, then `band-changed` if the band changed. | `{ faction, from, to }`, and `band: { from, to }` when the faction has bands |

A gain with one faction and a loss with another are two effects, as in every game the kit follows (D43). Nothing spreads to allies or rivals by itself.

## Facts

| Fact | Domain |
| --- | --- |
| `factions.standing(faction)` | int |
| `factions.band(faction)` | text: the band's id; no value for a faction with no bands |
| `factions.reached(faction, band)` | bool: standing is at or above where the band begins |
| `factions.price(faction)` | int from 0: the band's price share, 100 with no bands |

`factions.reached(faction: guild, band: friendly)` reads "friendly or better", which a comparison of the band can't. With two arguments, a condition names them; with one, it needn't: `factions.band(guild) == friendly`. A band the faction doesn't have throws, and validation stops it in content (E039).

In words, each fact names the faction by its id, as a flag's do ([conditions.md](conditions.md)): "guild is at least friendly", "guild’s band is not hostile", "guild’s standing is at least 10", "guild’s price share is less than 100".

## Events

| Event | Arguments |
| --- | --- |
| `factions/standing-changed` | `faction`, `by` (the change that held, after the bounds), `to` |
| `factions/band-changed` | `faction`, `from`, `to` (band ids) |

## Drift

- **When:** on each `time/day-started` ([time.md](time.md#start-of-events)) whose `day` is a multiple of `every`, a faction with `drift` moves one point toward `toward`, and stops there. Days count from the game's first, day 0, so a drift every 8 days moves on days 8, 16, 24 and on.
- **Order:** factions in id order, each raising `standing-changed` and `band-changed` as an effect would.
- **After the rows.** Listeners hear in module order, and the engine's sheet module comes before the kits, so a row on `time/day-started` reads the standing from before that day's drift (D43).
- **Whole points:** Landnam's 0.12 a day is a point every 8 days.

## Prices

With the economy kit on, a shop may name a faction:

```json
{ "name": "Trading post", "currency": "silver", "faction": "free-traders", "sells-at": 100 }
```

- **What the shop charges** is the quote of [kits.md](kits.md#the-economy-kit) with the faction's price share as one more percent in its product: value × sells-at × share × each rule's percent, over 100 for each, rounded once to the currency's step. The order of the percents can't change a price.
- **What the shop pays** stays as it was, and never more than it charges, as before: a trusted faction's 75 percent can't make buying cheaper than selling back.
- **A shop with no faction** charges as before, so every price in the hangar fixture is unchanged.

## Checks

- **E035** (a kit's record that doesn't hold together):
  - `min` above `max`; a `start` or a drift's `toward` outside them;
  - a band after the first with no `from`; bands whose `from` doesn't rise; a band beginning outside the bounds;
  - a band id twice.
- **E039:** a condition naming a band its faction doesn't have, in `factions.reached(faction: …, band: …)` or compared with `factions.band(faction)`, with the faction's bands listed.
- **W115:** a faction that drifts in a game without `time/day-started`.

## Proof

- **Unit tests** (`packages/kits/src/factions/`): bounds and the start's default; bands read from their starts, the first holding everything below; change-standing's events and previews; drift on its days, toward its resting value and stopping there, in id order, after the rows; prices with and without a faction, selling held below buying.
- **Schema tests:** every E035 rule at its bound; E039 in both kinds of condition; W115.
- **The editor** ([editor-kits.md](editor-kits.md#the-factions-and-time-kits-m35)): a faction made with its form, a shop naming it, a row reading its band; the export clean for `eb validate`.
- **The steading fixture** (`tools/cli/test/fixtures/steading`), a slice of Landnam: four neighbours with Landnam's bands and drift, trading posts priced by band, raids and tribute that move standing, in a calendar of 24-day seasons. Its golden runs, and a test that every price paid in 30 seeds' runs is the quote worked out another way.

## Open questions

1. **Relations.** Allies and rivals that a change spreads to, as no game the kit follows does by itself.
2. **Fractional drift.** Landnam's 0.12 a day and Ludus's 0.35 a week are below the engine's whole numbers.
3. **Setting a standing,** as Space-Wrecked's quest lifts the pursuer's side to a band's floor, rather than changing it by an amount.
4. **Prices when selling,** and a job's pay by band (Space-Wrecked's +10 and +20 percent), which come with missions (M3.9).
5. **Membership and ranks** for actors, as Space-Wrecked's companions belong to sides, with the roster (M3.6).
