# Spec: kits

This is how kits work: the engine's own modules for what most games share, with their record types, facts, events and effects (M3.3, [D41](../decisions.md)). The modules are in `packages/kits`, pure; their types, effect schemas and checks are in `@eb/schema`. A port must follow it to hold the same state, draw the same numbers and charge the same prices.

M3.3 builds the economy half of Kits I: the inventory kit (items, the party's bag, loot tables) and the economy kit (resources, shops). M3.4 adds the stats kit (actors, stats, statuses) and the gear kit (slots, worn items): [stats.md](stats.md). M3.5 adds the factions kit (standing, bands, drift, prices by band): [factions.md](factions.md), and the time kit (the calendar as data): [time.md](time.md#the-time-kit). M3.6 adds the roster kit (members, recruits made in play, halls, ranks, bonds): [roster.md](roster.md). M3.7 adds the events kit (choice events, decks, consequences): [events.md](events.md). M3.8 adds the dialogue kit (speakers, talks): [dialogue.md](dialogue.md).

It follows the games that came before:

- **Space-Wrecked's shop** (`src/sim/economy.js`, `drops.js`): a stock of different parts picked by weight, prices in steps of 5 credits, and a dealer who buys back for half, rounded down, so selling never pays more than buying. Its numbers are the hangar fixture's.
- **Ludus's three prices** (`src/ludus.jsx`): the price checked, the price shown and the price charged came from different code, and 140 of 210 buys a player could afford were refused. Here one quote gives all of them.
- **Dirtbag's derived numbers** (`app/src/sim/perks.ts`): nothing that can be worked out from content is saved, so a content update reaches every save.
- **Minecraft's and Diablo II's loot tables**: picks over weighted entries, a weight for nothing, tables inside tables, and conditions that take an entry out.

## Switching kits on

A project lists its kits in `project.json`:

```json
{ "format": 1, "id": "hangar", "name": "Hangar", "version": "0.1.0", "kits": ["inventory", "economy"] }
```

- **The kits** are, in the engine's order, `inventory`, `economy`, `stats`, `gear`, `factions`, `time`, `roster`, `events` and `dialogue`. `economy` needs `inventory`; `gear` needs `inventory` and `stats`; `roster` needs `stats`; the rest need none. Each id is listed once, in any order.
- **E033:** a kit the engine doesn't have, or one listed twice. **E034:** a kit whose need is left out. Neither stops `project.json` being read: the kit in question is off, and its records are of a type the project doesn't have (E002).
- **A kit that is on:**
  - its record types are the engine's own for the project, as `flag` and `sheet` are (D36);
  - its facts, events and effects join the engine's in what conditions, rows and effect fields are checked against, and in the editor's pickers;
  - its module joins the game after the engine's own modules and before the game's, unless the game names a module of the kit's id itself ([scripts.md](scripts.md)). A game's module that has a kit's id but isn't the kit's is E031.
- **A kit that is off** reserves nothing: a project may have a type named `item` of its own, as the format-1 fixture has.
- **Packs.** A pack whose project lists kits is format 3: `project.kits` holds the list, in the engine's order, and scripts are optional. A pack without kits is written as before, format 1 or 2, so every golden hash stays what it was ([project-format.md](project-format.md)).

## Fields of a project's own

A kit's type can carry fields a project adds (D41): `types/item.json`, in the type file format ([type-files.md](type-files.md)), with the inventory kit on.

- **The kit's fields come first,** in the kit's order, then the file's own. The file's `title`, `description` and `nameField` replace the kit's, so a project can call its items "Parts".
- **E037:** a field of the file's has the name of one of the kit's.
- **The kit reads only its own fields.** Conditions, scripts and the stage can read the rest.
- With the kit off, the same file is a type of the project's own, as before.

## Numbers

- **Every number is a whole number,** in content and in state: counts, weights, values, prices, amounts. Percents are whole percents.
- **Exact arithmetic.** A price is worked out as a fraction with BigInt and rounded once, so the order of the factors can't change it. A result past `Number.MAX_SAFE_INTEGER` throws.
- **Streams.** Each loot table draws from a stream of its own, `inventory/loot-<table>`, and each shop's stock from `economy/stock-<shop>`, so new content shifts only its own rolls.
- **Nothing derived is saved.** Prices, what a shop buys, an item's value: all are read from content each time.

## The inventory kit

**Records.**

```jsonc
// records/item/<id>.json
{ "name": "Reactor", "value": 200, "max": 2, "tags": ["part", "power"] }
// records/loot-table/<id>.json
{
  "picks": { "min": 1, "max": 1 },
  "nothing": 60,
  "unique": false,
  "entries": [
    { "table": "scrap-parts", "weight": 40 },
    { "resource": "credits", "weight": 10, "count": { "min": 5, "max": 15 }, "if": "flag.on(met-trader)" }
  ]
}
```

- **item:** `name`, `description`; `value`, what it is worth, 0 when left out; `max`, the most the party can carry, no limit when left out; `tags`, words shops and conditions choose items by.
- **loot-table:** `name`, `description`;
  - `picks`, how many draws a roll makes: `min` (1 when left out) to `max` (`min` when left out);
  - `nothing`, the weight of drawing nothing, 0 when left out;
  - `unique`, an entry drawn at most once a roll;
  - `entries`, at least one: exactly one of `item`, `table` or `resource` (the last with the economy kit on); a `weight`, 1 or more; a `count`, `min` (1) to `max` (`min`), of the item, of the resource, or of rolls of the table; and `if`, a condition that takes the entry out of a roll while it isn't true.

**State.** The slice is `{ bag: { <item>: <count> } }`, version 1: the party's items, each count 1 or more.

**Facts.**

| Fact | Arguments | Domain |
| --- | --- | --- |
| `inventory.count` | `item` (ref item) | int ≥ 0: how many the party carries |
| `inventory.tagged` | `tag` (text) | int ≥ 0: how many items carried have the tag, counting each one |

**Effects.**

| Effect | Fields | Does |
| --- | --- | --- |
| `give-item` | `item`, `count` (1) | adds the count, up to the item's `max`: what doesn't fit is lost |
| `take-item` | `item`, `count` (1) | takes the count away; refuses `not-enough` (`item`, `have`, `need`) when the bag holds fewer |
| `roll-loot` | `table` | rolls the table and gives what it draws |

**Rolling a table.**

1. The entries whose `if` is true now are in the roll, in the order written. An `if` that is false or unknown takes its entry out.
2. One draw from the table's stream gives the number of picks, from `min` to `max`, even when they are the same, so later draws don't shift when content changes.
3. Each pick draws `weightedIndex` over the weight of nothing followed by each entry's weight. When those are all 0, the roll stops.
4. A drawn entry draws its count, from `min` to `max`, again even when they are the same, then gives it: `give-item` for an item, `add-resource` for a resource, and that many rolls of a table, each from the table's own stream. With `unique`, the entry leaves the roll.
5. Tables nest at most 16 deep at run time; validation stops a loop (E036).

**Previews.**
- `give-item`: `{ item, from, to, lost }`.
- `take-item`: `{ item, from, to }`, with `refused: "not-enough"` when it would refuse.
- `roll-loot`: `{ table, picks, nothing, total, entries }`, the entries now in the roll with their weights and counts, and a table's own preview inside it. The odds a player is shown are the weights the roll reads, from the same list.

**Events.**

| Event | Arguments | Raised |
| --- | --- | --- |
| `inventory/gained` | `item` (ref item), `count` (int ≥ 1) | when items go into the bag |
| `inventory/lost` | `item`, `count` | when items leave it |
| `inventory/full` | `item`, `lost` (int ≥ 1) | when what was given didn't all fit |

## The economy kit

**Records.**

```jsonc
// records/resource/<id>.json
{ "name": "Credits", "start": 60, "min": 0, "step": 5 }
// records/shop/<id>.json
{
  "name": "Dutch's yard",
  "currency": "credits",
  "sells-at": 100,
  "buys-at": 50,
  "buys": {},
  "stock": { "table": "dutch-stock", "every": { "days": 2 } },
  "rules": [{ "if": "flag.on(owes-dutch)", "percent": 120 }]
}
```

- **resource:** `name`, `description`; `start` (0), `min` (0) and `max` (no limit), with the start within them; `step` (1), which the shop's prices in it are rounded to.
- **shop:** `name`, `description`;
  - `currency`, the resource it charges and pays in;
  - `sells-at`, the whole percent of an item's value it charges, 100 when left out, and `buys-at`, what it pays, 50 when left out and never above `sells-at`;
  - `buys`: left out, the shop buys nothing; `{}`, anything; `{ "tags": [...] }`, items with one of the tags;
  - `stock`: `items`, a list of an `item` and a `count` (1), always put on the shelf; `table`, a loot table rolled for the rest; `every`, `{ "days": n }`, how often the shelf is stocked again. A shop with no stock only buys.
  - `rules`: each an `if` and a whole `percent`, applied to what the shop charges while the `if` is true.

**State.** The slice is `{ amounts: { <resource>: <n> }, shops: { <shop>: { shelf: [{ item, left }], day? } } }`, version 1.
- `amounts` holds only the resources whose amount isn't their start, and an amount is read within today's bounds, as flags are.
- A shop's entry appears when it is first opened. Its `shelf` lists what is for sale and how many are left, in order: the stock's `items` as written, then what the table drew, in the order drawn, with a second draw of an item adding to the first. An item sold out leaves the shelf. `day` is `time.day` when the shelf was stocked, kept only for a shop that stocks again.

**The quote.** Every price a player sees, every option offered, every refusal and every charge comes from one function:

- **To buy:** `value × sells-at × r1 × … × rk / 100^(1+k)`, where `r1…rk` are the percents of the rules whose `if` is true, in the order written, rounded to the nearest multiple of the currency's `step`, halves up.
- **To sell:** `value × buys-at / 100`, rounded down to a multiple of `step`, and never more than the price to buy the same item now, so no rule can make selling pay more than buying.
- With Space-Wrecked's numbers (step 5, 100 and 50): a reactor of value 200 costs 200 and sells for 100; an airlock of 45 costs 45 and sells for 20.

**Facts.**

| Fact | Arguments | Domain |
| --- | --- | --- |
| `economy.amount` | `resource` (ref resource) | int |
| `economy.price` | `shop` (ref shop), `item` (ref item) | int ≥ 0: what one costs now; no value when it isn't on the shelf |
| `economy.offer` | `shop`, `item` | int ≥ 0: what the shop pays for one now; no value when it won't buy it |
| `economy.stock` | `shop`, `item` | int ≥ 0: how many are on the shelf |

**Effects.**

| Effect | Fields | Does |
| --- | --- | --- |
| `add-resource` | `resource`, `by` | adds `by`, which may be below 0; above `max`, the rest is lost; below `min`, it refuses `not-enough` (`resource`, `have`, `need`) |
| `pay-cost` | `cost`, `{ <resource>: n }`, each 1 or more | pays all of it or none: refuses `cant-afford` (`resource`, `have`, `need`) for the first resource short, by id |
| `open-shop` | `shop` | stocks the shelf if it is the first time or `every` has passed, then pushes the mode `shopping` with `{ shop }` |

**Actions,** in the mode `shopping`, for the shop in the mode's data. Each offers only what it would accept.

| Action | Refuses | Does |
| --- | --- | --- |
| `economy/buy` `{ item }` | `sold-out`, `cant-afford`, `no-room` (past the item's `max`) | pays the quote, gives the item, takes one off the shelf |
| `economy/sell` `{ item }` | `wont-buy`, `none-to-sell`, `purse-full` (the payment past the currency's `max`) | takes the item, pays the offer |
| `economy/leave` | | pops the mode |

**Previews.** `add-resource`: `{ resource, from, to }`, with `refused: "not-enough"`. `pay-cost`: `{ cost, afford }`. `open-shop`: `{ shop }`.

**Events.**

| Event | Arguments | Raised |
| --- | --- | --- |
| `economy/changed` | `resource` (ref resource), `by` (int) | when an amount changes, by how much it did |
| `economy/opened` | `shop` (ref shop) | when a shop opens |
| `economy/bought` | `shop`, `item` (ref item), `price` (int ≥ 0) | after a buy |
| `economy/sold` | `shop`, `item`, `price` | after a sale |
| `economy/left` | `shop` | when the player leaves |

## Checks

| Code | When |
| --- | --- |
| E033 | `project.json` names a kit the engine doesn't have, or one twice |
| E034 | a kit needs another that `project.json` leaves out |
| E035 | a record of a kit's type doesn't hold together: an entry with none or two of `item`, `table` and `resource`; a `min` above its `max`; a start outside its bounds; `buys-at` above `sells-at`; a shop's stock table that gives a resource |
| E036 | loot tables that nest in a loop, with the loop's path |
| E037 | a project's fields for a kit's type name one of the kit's own |
| W113 | a shop that stocks again every few days in a game without `time.day` |

## Proof

- **The hangar fixture** (`tools/cli/test/fixtures/hangar/`) is a slice of Space-Wrecked's hangar: its parts at their values, its credits in steps of 5, Dutch's yard stocked with 4 different parts by weight, and jobs that pay credits and drop parts. Its game is a script that takes jobs, shops and launches once the ship has what it needs.
- `eb sim` plays it for 500 seeds with no refused offer, and every price a buy charged equals what `economy.price` read just before.
- Loot odds: over many rolls, each entry comes up within a 99.9% interval of its weight's share of the preview's total.

## Open questions

1. **Rules on selling.** A shop's rules change what it charges, not what it pays. A friend's better offer would need rules of its own on selling.
2. **Selling to the shelf.** What the party sells is gone, as in Space-Wrecked; Bethesda's merchants put it on the shelf to buy back. Answered for a shop with an actor by M6.8 ([barter.md](barter.md), D80): it goes into their bag.
3. **Bags of other actors** and containers (Phase 6, D41): actors' bags came with M6.1 (D73), containers and purses with M6.8 ([barter.md](barter.md), D80).
4. **`eb` exporting the kits,** so a game.ts can place a kit's module among its own.
