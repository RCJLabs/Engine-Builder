# Spec: the roster kit

This is how the roster kit works (M3.6, [D44](../decisions.md)): the party's members, the recruits a game makes in play from templates, the halls that offer them, ranks on a ladder, bonds between pairs, and members who leave. It is a kit as [kits.md](kits.md) has them: switched on in `project.json`, a pure module in `packages/kits/src/roster/`, its types, effect schemas and checks in `@eb/schema`. A port must follow it to make the same recruits from the same seed.

It follows the games that came before ([research/kits-ii.md](../research/kits-ii.md#rosters)):

- **Space-Wrecked's crew** (`src/sim/recruits.js`): each station offers two recruits worked out from the seed, the sector, the station and the slot, so it offers the same people on every visit and only who was hired is saved. Backgrounds set a job and up to two traits; a fee of 30, more for each trait; ranks at 3 and 8 fights.
- **Ludus's gladiators** (`src/ludus.jsx`): a market of men rolled from origins and name lists, traits by chance, injuries that heal over weeks, brothers and rivals with a strength from 1 to 100, and the fallen kept in the annals.
- **Landnam's people** (`src/sim/joining.ts`, `src/sim/people.ts`): joiners who arrive by a daily chance, injuries that stack, kin, and the dead kept with how they died.
- **Wasteland's squad** (`game.js`): bonds counted in fights together, at 4, 10 and 18.

## Switching it on

```json
{ "format": 1, "id": "crew", "name": "Crew", "version": "0.1.0", "kits": ["inventory", "economy", "stats", "roster"] }
```

- **The kit** is `roster`. It needs `stats`: members are actors, with stats and statuses.
- Everything [kits.md](kits.md#switching-kits-on) says of a kit holds for it: E033, E034, the types, facts, events and effects, the module's place in a game, format 3 packs.
- **With the economy kit on,** a recruit's fee is paid in its resources. Without it nothing can charge one (W117).
- **With the gear kit on,** a recruit has its actor's slots and starts wearing what the actor wears.

## Numbers

- **Whole numbers** throughout, as in [kits.md](kits.md#numbers). A trait's chance is a whole percent.
- **Bonds are saved only where they differ from the start,** as standing is ([factions.md](factions.md#numbers)).

## Members made in play

A recruit is an **actor record made in play**: the kernel's content, as every module reads it, holds the records a module makes from its slice beside the records content lists ([sim.md](sim.md#made-records)). So the stats kit works out a recruit's values, the gear kit dresses it, conditions name it and events carry its id exactly as for a written actor.

- **Its record** is its template's actor, with what was rolled laid over it:
  - `name`: the rolled name;
  - `stats`: the actor's bases, with each rolled stat in place of the actor's;
  - `statuses`: the actor's statuses, then the traits drawn, each once.
  - Everything else (`description`, and with gear `slots` and `wears`) is the actor's, read from content each time.
- **Its id** is its template's id, a hyphen and a number: `deckhand-4`. The number comes from one counter for the whole game, which counts every recruit made and never goes back, so an id is never used twice.
- **It stays a record after it leaves,** so its bonds, its rank and what it was can still be read.
- **Outside an action** the stage reads it from `game.content(state, sim)`, which holds the made records beside the pack's ([sim.md](sim.md#facts-and-effects-outside-reduce)): how "Ketil Ash joined" finds its name.

## Records

### recruit

A template for recruits. `records/recruit/<id>.json`:

| Field | Means |
| --- | --- |
| `name`, `description` | the template's own words: "Deckhand" |
| `actor` | the written actor a recruit copies. Required |
| `names` | first names, at least one. Required |
| `bynames` | second names: a recruit is then called a first name, a space and a byname |
| `stats` | `{ "aim": { "min": 2, "max": 5 } }`: each rolled between `min` and `max`, both included, in place of the actor's base. `max` is `min` when left out |
| `traits` | `[{ "status": "steady", "chance": 30, "fee": { "credits": 20 } }]`: each drawn in turn with its chance, a whole percent, until `most` are drawn. A trait's `fee` adds to the recruit's |
| `most` | the most traits a recruit draws: no limit when left out |
| `fee` | `{ "credits": 30 }`: what hiring a recruit from it costs, before its traits' fees. Nothing when left out |

### hall

A place that offers recruits: a station, a market, a tavern. `records/hall/<id>.json`:

| Field | Means |
| --- | --- |
| `name`, `description` | its words |
| `offers` | how many recruits it offers a round: 1 when left out |
| `recruits` | `[{ "recruit": "deckhand", "weight": 3 }]`: the templates each offer is drawn from, by weight, 1 when left out. At least one |

### roster

The roster's settings. A game has at most one roster record; without one, the roster has no cap, starts empty, has no ranks, and bonds start at 0 with no bounds and no bands. `records/roster/<id>.json`:

| Field | Means |
| --- | --- |
| `name`, `description` | its words: "The crew" |
| `cap` | the most members at once: no limit when left out |
| `cap-flag` | a number flag whose value is the cap, so rows raise it as berths or beds are built. It wins over `cap` |
| `start` | written actors on the roster when the game starts, in order |
| `ranks` | `{ "stat": "fights", "bands": [{ "id": "green" }, { "id": "veteran", "from": 3, "status": "steady" }] }`: the ladder, lowest first, as a faction's bands. A rank's `status` is what a member at that rank has |
| `bonds` | `{ "min": 0, "max": 20, "start": 0, "bands": [{ "id": "strangers" }, { "id": "mates", "from": 4 }] }`: the range of every pair's bond, where it starts, and its bands |

## State

```json
{
  "salt": 1432761,
  "next": 3,
  "members": ["ana", "deckhand-1", "medic-2"],
  "made": { "deckhand-0": { "recruit": "deckhand", "name": "Ketil Ash", "stats": { "aim": 4 }, "traits": ["steady"] } },
  "gone": { "deckhand-0": "dead" },
  "halls": { "dock": { "round": 2, "hired": [1] } },
  "bonds": { "ana|deckhand-1": 5 },
  "ranks": { "ana": "veteran", "deckhand-1": "green" }
}
```

- **`salt`** is drawn once, as the game starts, from the kit's stream `roster/salt`. Offers are worked out from it.
- **`next`** is the counter: the number the next recruit gets.
- **`members`** are those on the roster now, in the order they joined.
- **`made`** holds what was rolled for every recruit ever made, gone ones too. A made record is worked out from it and the template's actor.
- **`gone`** holds why each actor who left did: a name such as `dead`, `dismissed` or `sold`. An actor who rejoins is taken out of it.
- **`halls`** holds a hall only once it has been refreshed or hired from: its round, and the slots hired this round.
- **`bonds`** holds a pair only while it differs from the start, keyed by the two ids sorted and joined by `|`.
- **`ranks`** holds the rank each member was last given, so a move takes the old rank's status off. A member who leaves keeps its entry, so one whose rank moved while it was away has the old status taken off as it rejoins. With no ladder it stays empty.

## Offers

- **Where an offer comes from.** A hall's offer in slot `s` of round `r` is drawn from the stream `Rng.create("<salt>/<hall>/<r>/<s>")`, made afresh each time the offer is read and never saved. So the offer is the same each time it is asked for, in any session, and only hires are saved (Space-Wrecked's stations). A port must make it the same way.
- **What is drawn, in order** (the order is part of the save contract):
  1. the template, by `weightedIndex` of the hall's weights;
  2. the name: a first name by `int(0, names − 1)`, then a byname the same way. A name worn by a member now is drawn again, up to 20 draws, then kept;
  3. each rolled stat in id order, by `int(min, max)`: id order, not the file's, since a pack's keys are sorted and a compiled record's are as written;
  4. each trait in turn by `chance(chance, 100)`, stopping once `most` are drawn.
- **A recruit made by the `recruit` effect** is drawn the same way, without step 1, from `Rng.create("<salt>/recruit/<n>")`, `n` being its number.
- **The fee** is the template's fee and each drawn trait's, added by resource.
- **Rounds.** A hall starts in round 0. `refresh-hall` starts the next round: new offers, none of them hired.

## Effects

| Effect | Does | Preview |
| --- | --- | --- |
| `{ "effect": "recruit", "recruit": "deckhand" }` | Makes a recruit from the template and puts it on the roster, with no fee. Refused (`roster-full`) when the roster is full | `{ actor, name, stats, traits }`: who would join |
| `{ "effect": "join", "actor": "ana" }` | An actor joins, a written one or a recruit who left. Nothing for one on the roster already. Refused (`roster-full`) when the roster is full | as written |
| `{ "effect": "leave", "actor": "ana", "why": "dead" }` | A member leaves, kept in `gone` with why, any text. Nothing for one not on the roster | as written |
| `{ "effect": "change-bond", "actor": "ana", "with": "bo", "by": 2 }` | Adds `by` to the pair's bond, within the bounds. Raises `bond-changed` with how much it moved, then `bond-band-changed` if its band changed | `{ actor, with, from, to }`, and `band: { from, to }` when bonds have bands |
| `{ "effect": "change-bonds", "by": 1 }` | Every pair of members now, in id order, as change-bond does: Wasteland's fight won together, Ludus's week | as written |
| `{ "effect": "open-hall", "hall": "dock" }` | Opens the hall: its offers in the mode `hiring`, where hiring is an action. Refused (`already-in-hall`) when a hall is open | as written |
| `{ "effect": "refresh-hall", "hall": "dock" }` | Starts the hall's next round | as written |

A recruit, a join, a leave and a bond change each say what they did as events; a rank change follows from them ([ranks](#ranks)). An actor that is neither written nor made throws, as a missing record does everywhere.

## Actions

In the mode `hiring`, whose data is `{ "hall": "dock" }`:

| Action | Does | Offered |
| --- | --- | --- |
| `roster/hire` `{ slot }` | The offer in that slot joins, once its fee is paid (pay-cost); its slot is hired for the round | for each slot not hired this round, while the roster has room and the fee can be paid |
| `roster/leave-hall` | Leaves the hall | always |

The options and the action share one check, so what is offered is what a hire accepts. A hire is refused with:

- `no-such-slot`: not a whole number from 0 to the hall's `offers` less one;
- `hired`: hired already this round;
- `roster-full`;
- `cant-afford`, with `resource`, `have` and `need`, the first resource of the fee the party is short of, in id order, as pay-cost finds it;
- `not-hiring`, for either action outside a hall.

## Facts

| Fact | Domain | In words |
| --- | --- | --- |
| `roster.count` | int from 0: members now | "the roster's size" |
| `roster.room` | int from 0: places left; no value with no cap | "room on the roster" |
| `roster.member(actor)` | bool | "ana is on the roster" |
| `roster.left(actor)` | text: why it left; no value for an actor that hasn't | "why ana left is dead" |
| `roster.rank(actor)` | text: its rank's id; no value with no ladder | "ana’s rank is veteran" |
| `roster.reached(actor, rank)` | bool: its ladder stat is at or past where the rank begins | "ana is at least veteran" |
| `roster.ranked(rank)` | int from 0: members who have reached the rank | "the number of members at least veteran is at least 2" |
| `roster.bond(actor, with)` | int. An actor's bond with itself throws | "the bond of ana and bo is at least 4" |
| `roster.bond-band(actor, with)` | text: the band's id; no value with no bands | "the bond of ana and bo is mates" |

A rank or a band the roster doesn't have throws, and validation stops it in content (E040).

## Events

| Event | Arguments |
| --- | --- |
| `roster/joined` | `actor` |
| `roster/left` | `actor`, `why` |
| `roster/hired` | `hall`, `slot`, `actor`: after `joined` |
| `roster/rank-changed` | `actor`, `from`, `to` (rank ids) |
| `roster/bond-changed` | `actor`, `with`, `by` (the change that held), `to` |
| `roster/bond-band-changed` | `actor`, `with`, `from`, `to` (band ids) |
| `roster/hall-opened` | `hall` |
| `roster/hall-left` | `hall` |

## Ranks

- **A member's rank** is the last band of the ladder whose `from` its ladder stat's value has reached, the first holding everything below, as a faction's band ([factions.md](factions.md#factions)).
- **Joining** gives a member its rank's status, and so does the game's start for those who start on the roster ([sim.md](sim.md#modules)).
- **After any `stats/*` or `gear/*` event about a member,** its rank is worked out again. When it moved, the old rank's status comes off, the new one's goes on (the stats kit's `remove-status` and `add-status`), and `rank-changed` is raised.
- **A rank's status never ends** and doesn't change the ladder's own stat (E035): one that did could move the rank that gave it.
- **A member who leaves** keeps the status its rank gave it.

## Bonds

- **A bond** belongs to a pair of actors, members or not, gone or not. It is a whole number within the roster's `bonds.min` and `bonds.max`, from `bonds.start` (0 kept within the bounds when left out), in the last band it has reached.
- **change-bond** moves it as change-standing moves a standing ([factions.md](factions.md#effects)). An actor's bond with itself is refused when content names one (E035) and throws in a game's own code.

## Checks

- **E035** (a kit's record that doesn't hold together):
  - a recruit: a stat whose `min` is above its `max`; a trait named twice; a written actor whose id is a template's id, a hyphen and a number, which a recruit's id could be;
  - a hall: a recruit named twice;
  - a roster: a second roster record; a member who starts twice; a rank ladder or bond bands that don't run lowest first, or begin outside the bonds' bounds, or name a band twice; a rank's status that lasts, or that changes the ladder's stat; a bond's start outside its bounds; both `cap` and `cap-flag`, or a `cap-flag` that isn't a number flag;
  - a change-bond naming the same actor twice.
- **E040:** a condition naming a rank or a bond band the roster doesn't have, in `roster.reached(actor: …, rank: …)`, `roster.ranked(…)`, or compared with `roster.rank(…)` or `roster.bond-band(…)`.
- **W117:** a fee, a recruit's or a trait's, in a game without the economy kit: nothing charges it.

## Proof

- **Unit tests** (`packages/kits/src/roster/`, with the muster game in `packages/kits/test/muster.ts`): offers equal to the draws made by hand in this spec's order; offers worked out twice the same, in any order of asking, and from a save; names drawn again while worn; traits stopping at `most`; recruits' ids never reused across leaving; the cap, from a number and from a flag; hiring paying the fee and refused when short; ranks moving with the ladder stat and their statuses with them; bonds within bounds, in bands, and every pair by change-bonds; members kept as gone.
- **Kernel tests:** made records read, checked and named like content's, and in `game.content`; a clash with a content id throws; a made record seen by later effects in the same action; `start` run once after every init.
- **Schema tests:** every E035 rule at its bound; E040 in each kind of condition; W117.
- **The crew fixture** (`tools/cli/test/fixtures/crew`), a slice of Space-Wrecked: stations offering recruits from backgrounds, fees by trait, ranks at 3 and 8 fights, wounds that last days, bonds that grow with fights won, and the dead kept. Its golden runs, and a test that every recruit hired in 30 seeds' runs is the offer worked out again from its hall, round and slot.

## Open questions

1. **Rows naming the member an event is about.** A row on `roster/joined` can't give that member a status: content can't name a recruit before it is made. Aliases come with missions (M3.9).
2. **A fee by a hall's faction,** as Space-Wrecked's station price share does a recruit's fee.
3. **Offers on screen.** The stage will show a hall's offers; it can work them out as the kit does, or read them from facts the kit doesn't have yet.
4. **Kin made together** (Landnam's pairs), and **positions in a line** (Wasteland's bench, Landnam's shield wall).
5. **Bonds that decay,** which no game surveyed has but Landnam's grudges do on good days.
