# Spec: the events kit

This is how the events kit works (M3.7, [D45](../decisions.md)): choice events, each with a few choices that cost, need or roll something; decks that say which event comes up; and consequences that land days, choices or a flag's rise later. It is a kit as [kits.md](kits.md) has them: switched on in `project.json`, a pure module in `packages/kits/src/events/`, its types, effect schemas and checks in `@eb/schema`. A port must follow it to draw, roll and land the same things from the same seed.

It follows the games that came before ([research/choice-events.md](../research/choice-events.md)):

- **Space-Wrecked's events** (`data/events.json`, `src/sim/events.js`): a title, text and up to four choices, each with what it needs and outcomes by whole-percent chances; a choice the crew can't pay for shown locked with its reason; one roll on choosing, on the saved stream.
- **Dirtbag's knocks** (`content/knocks.ts`): cooldowns, the last few passed over, those met least likelier, and a knock you helped coming back days later.
- **Wasteland's consequences** (`game.js`): debts and ambushes booked a few nodes ahead, cancelled by settling early, and a test that no term outlives a run.
- **Rule-or-Drool's queue**: a card sent for later, checked again when due and dropped if stale, landing with a receipt of what sent it.

The word "event" means two things in the engine. Here it is a **choice event**, a record. The beats rows react to, such as `events/chosen`, are events in [triggers.md](triggers.md)'s sense.

## Switching it on

```json
{ "format": 1, "id": "convoy", "name": "Convoy", "version": "0.1.0", "kits": ["inventory", "economy", "time", "events"] }
```

- **The kit** is `events`. It needs no other kit.
- Everything [kits.md](kits.md#switching-kits-on) says of a kit holds for it: E033, E034, the types, facts, events and effects, the module's place in a game, format 3 packs.
- **With the economy kit on,** a choice's cost is paid in its resources. Without it nothing charges one (W119).
- **With a time module** (the time kit, or a game's own), a consequence can count days. Without one, nothing says a day has started (W120).

## Numbers

- **Whole numbers** throughout, as in [kits.md](kits.md#numbers). A chance is a whole percent, and a choice's chances add up to 100.
- **A deck's weights** are whole numbers from 1 to 1,000, and its boost for events never seen from 1 to 10, so a draw over a deck's thousand events stays well under the 2^32 a weighted draw can add up to.

## Records

### event

A choice event. `records/event/<id>.json`:

| Field | Means |
| --- | --- |
| `name` | its title: "Raiders" |
| `text` | the situation, shown with its choices |
| `show-odds` | true: each choice shows its outcomes, their chances and what they do before it is chosen. Hidden when left out (D45) |
| `choices` | at least one, in the order shown |

Each choice:

| Field | Means |
| --- | --- |
| `id` | what conditions and events call it: lowercase words joined by hyphens, once in the event. Required |
| `label` | what the player taps: "Pay the toll". Required |
| `if` | a condition: while it doesn't hold, the choice isn't shown |
| `needs` | a condition: while it doesn't hold, the choice is shown locked, with the condition in words |
| `cost` | `{ "scrap": 30 }`: resources paid as it is chosen. While the party is short, the choice is shown locked, with what it lacks |
| `result` | what the player reads once it is chosen |
| `effects` | what it does for sure, in order, after the cost |
| `outcomes` | `[{ "chance": 60, "result": "They scatter.", "effects": [...] }]`: one is rolled after `effects`, by whole-percent chances that add up to 100 |

### deck

The events that can come up somewhere: a road, a sector, a night. `records/deck/<id>.json`:

| Field | Means |
| --- | --- |
| `name`, `description` | its words |
| `events` | `[{ "event": "raiders", "weight": 2, "if": "...", "once": true }]`, at least one. `weight` is 1 when left out; `if` is a condition while which the event can be drawn; `once` keeps an event that has been seen from being drawn again |
| `recent` | an event among the deck's last `recent` draws is passed over: 0 when left out (Dirtbag's last 3 knocks, Wasteland's last 4) |
| `unseen` | an event never seen has its weight times this: 1 when left out (Ludus's 3) |

## State

```json
{
  "salt": 90142133,
  "open": "raiders",
  "waiting": ["debt-due"],
  "seen": { "raiders": 2, "trader": 1 },
  "chose": { "raiders": ["fight"], "trader": ["buy-fuel"] },
  "choices": 3,
  "decks": { "road": { "draws": 3, "recent": ["trader", "raiders"] } },
  "laters": [
    {
      "id": "debt",
      "seq": 0,
      "due": { "flag": "nodes", "at": 5 },
      "do": [{ "effect": "open-event", "event": "debt-due" }],
      "from": { "event": "loan-shark", "choice": "borrow" }
    }
  ],
  "next": 1
}
```

- **`salt`** is drawn once, as the game starts, from the kit's stream `events/salt`, below 2^31. Decks draw from it.
- **`open`** is the event open now, left out when none is. **`waiting`** are those opened while it was, to open in turn.
- **`seen`** counts how many times each event has opened. **`chose`** holds each choice ever made at an event, sorted. **`choices`** counts every choice made.
- **`decks`** holds a deck once it has drawn: how many draws it has made, and its last `recent` draws, oldest first.
- **`laters`** are the consequences still to land, in the order booked. Each keeps its effects and condition as they were booked, as a timer does ([time.md](time.md#timers)), and `from` when a choice booked it.
- **`next`** is the number the next consequence booked gets, as `seq`, and as its id when content doesn't name it (`#4`).

## Choosing

An open event puts the game in the mode `choosing`, whose data is `{ "event": "raiders" }`. Its one action is `events/choose`.

### What each choice shows

`game.preview(state, [{ "effect": "open-event", "event": id }], sim)` gives the open event's choices as the player should see them, from the same verdict choosing makes, so what is shown is what is allowed ([CLAUDE.md](../../CLAUDE.md)'s odds rule):

```json
{
  "effect": "open-event",
  "event": "raiders",
  "choices": [
    { "id": "pay", "label": "Pay the toll", "cost": { "scrap": 30 }, "open": false, "short": { "resource": "scrap", "have": 12, "need": 30 } },
    { "id": "flee", "label": "Flee", "open": false, "needs": { "fact": "economy.amount", "args": { "resource": "fuel" }, "op": ">=", "value": 2 } },
    { "id": "fight", "label": "Fight", "open": true }
  ]
}
```

- **A choice whose `if` doesn't hold** is left out.
- **`open`** is whether it can be chosen now. A locked choice says why: `needs`, its condition, when that doesn't hold; `short`, the first resource of its cost the party is short of, in id order, as pay-cost finds it.
- **`cost`** is on every choice that has one, open or locked.
- **With `show-odds`,** each choice also carries `effects`, its sure effects' previews, and `outcomes`, each with its `chance`, `result` and its effects' previews. Without it, neither is there (D45).

### The action

`events/choose` `{ choice }`, offered for each choice the view has open, in the event's order. It is refused with:

- `not-choosing`: no event is open in the mode `choosing`, as in a game that starts in it once its events are done;
- `no-such-choice`: the event has no such choice, or its `if` doesn't hold;
- `locked`: its `needs` doesn't hold;
- `cant-afford`, with `resource`, `have` and `need`.

Choosing, in this order:

1. its cost is paid, with pay-cost;
2. the event closes: the mode `choosing` comes off, the choice is counted and kept in `chose`, and `chosen` is raised;
3. its `effects` apply, in order;
4. with `outcomes`, one is rolled: one draw of `int(1, 100)` from the kit's stream `events/outcome`, the outcome being the first whose running total of chances reaches it (`rollTable`, as the `roll` effect's), then `rolled` is raised and its effects apply;
5. the consequences counting choices that are now due land ([consequences](#consequences));
6. when no event is open, the first one waiting opens.

An effect of the choice that refuses refuses the choice: nothing it did is kept, and the event stays open. Content stops it with `needs`; the runner counts it as an offer refused, which is how `eb sim` finds one missing.

A game made only of events can start in the mode `choosing`, a module's `start` opening its first event ([sim.md](sim.md#modules)). Once no event is open or waiting, nothing is offered, and the game is over.

## Decks

`draw-event` draws one event from a deck and opens it, as `open-event` does.

- **The events that can come** are those of the deck, in its order, that aren't open or waiting, that aren't `once` and seen, that aren't among its last `recent` draws, and whose `if` holds.
- **Each one's weight** is its `weight`, times `unseen` for an event never seen.
- **The draw** is `weightedIndex` of those weights, from the stream `Rng.create("<salt>/<deck>/<n>")`, `n` being the deck's draws so far, made afresh for that draw and never saved. So a deck's draws never shift another's, or a roll's (Afterglass's visitors). A port must make it the same way.
- **When no event can come,** nothing is drawn, the deck's count stays, and `nothing-drawn` is raised.
- **After a draw,** the deck's count goes up by one, the event joins its recent draws (the last `recent` kept), and `drawn` is raised before it opens or waits.

## Consequences

`later` books effects to apply after so many days, choices or points of a number flag:

```json
{ "effect": "later", "after": { "flag": "nodes", "by": 3 }, "if": "economy.amount(resource: scrap) < 50", "do": [{ "effect": "open-event", "event": "debt-due" }], "id": "debt" }
```

| `after` | Lands |
| --- | --- |
| `{ "days": 3 }` | as the third day from today starts: when `time/day-started` is raised for today's day plus 3 |
| `{ "choices": 2 }` | once two more choices have been made, after the second's effects |
| `{ "flag": "nodes", "by": 3 }` | once the number flag is at least 3 above what it was when booked, as `flag/changed` says it is. `by` is 1 when left out |

- **`id`** names it, for `cancel-later` and the facts. Booking an id again replaces the consequence it names, as scheduling a timer's name again does. One content doesn't name gets `#` and its number.
- **`if`** is checked as it comes due. When it doesn't hold, the consequence is dropped, and `dropped` is raised (Rule-or-Drool's stale cards).
- **Landing** runs its effects as one attempt: `landed` is raised, then the effects apply. One that refuses is undone and dropped, with the beat `refused` and why, as a timer's is ([time.md](time.md#timers)). Several due at once land in the order booked.
- **The receipt.** A consequence booked by a choice's effects or outcome keeps the event and choice that booked it, and `landed` carries them, so the stage can say "Because you borrowed from the loan shark". `landed` carries empty text for both when a row or a game's code booked it.
- **An event a consequence opens while another is open** waits its turn, as any does.
- **A flag kept below where a consequence waits** by its highest, or a game that ends first, leaves it pending. Nothing drops it: a test that none outlives a run is how a game finds them (Wasteland's).

## Effects

| Effect | Does | Preview |
| --- | --- | --- |
| `{ "effect": "open-event", "event": "raiders" }` | Opens it: the mode `choosing`, `seen` counted, `opened` raised. While another is open, it waits its turn | `{ event, choices }`: [what each choice shows](#what-each-choice-shows) |
| `{ "effect": "draw-event", "deck": "road" }` | Draws an event from the deck and opens it ([decks](#decks)) | as written |
| `{ "effect": "later", "after": { "days": 3 }, "do": [...] }` | Books a consequence ([consequences](#consequences)); `booked` raised | `{ due }`: `{ day }`, `{ choices }` or `{ flag, at }`, as it would be booked |
| `{ "effect": "cancel-later", "id": "debt" }` | Cancels the consequence of that id, raising `cancelled`. Nothing for one not pending | as written |

## Facts

| Fact | Domain | In words |
| --- | --- | --- |
| `events.open` | ref to an event: the open one; no value when none is | "the open event is raiders" |
| `events.seen(event)` | int from 0: times it has opened | "the times raiders has been seen is at least 2" |
| `events.chose(event, choice)` | bool: chosen there at least once | "pay was chosen at raiders" |
| `events.choices` | int from 0: choices made | "the choices made" |
| `events.booked` | int from 0: consequences still to land | "the consequences still to land" |
| `events.pending(later)` | bool | "debt is still to land" |
| `events.left(later)` | int from 0: days, choices or points before it is due; no value when it isn't pending | "debt’s countdown is at most 1" |

A choice its event doesn't have, named in `events.chose`, throws; validation stops it in content (E041).

## Events

| Event | Arguments |
| --- | --- |
| `events/opened` | `event` |
| `events/chosen` | `event`, `choice` |
| `events/rolled` | `event`, `choice`, `outcome` (its place in the list, from 0), `roll` (1 to 100) |
| `events/drawn` | `deck`, `event` |
| `events/nothing-drawn` | `deck` |
| `events/booked` | `later` (its id) |
| `events/landed` | `later`, `event`, `choice`: what booked it, empty when no choice did |
| `events/dropped` | `later` |
| `events/cancelled` | `later` |

## Checks

- **E035** (a kit's record that doesn't hold together):
  - an event: a choice id twice, or one a condition can't write; outcomes whose chances don't add up to 100;
  - a deck: an event named twice, or passing over as many of its last draws as it has events, since once each had come none could;
  - a `later`: an `after` giving none, or more than one, of days, choices and a flag; `by` without a flag; a flag that isn't a number flag; an id, a later's or a cancel-later's, that isn't lowercase words joined by hyphens.
- **E041:** a condition naming a choice its event doesn't have, in `events.chose(event: …, choice: …)`.
- **W118:** an event none of whose choices is free of `if`, `needs` and `cost`: a party that can't meet any of them is stuck, as Space-Wrecked's validator warns. A warning, since choices whose conditions cover every case between them are fine.
- **W119:** a cost in a game without the economy kit: nothing charges it.
- **W120:** a consequence counting days in a game without a time module.

## Proof

- **Unit tests** (`packages/kits/src/events/`, with the caravan game in `packages/kits/test/caravan.ts`): the view equal to the action's verdicts, in every lock; costs paid once, and refused when short; outcomes rolled by the table the view shows; decks' draws equal to draws made by hand in this spec's order; `once`, `recent`, `unseen` and `if`; events waiting their turn; consequences by days, choices and a flag, dropped by `if`, cancelled, replaced by id, with their receipts; a game that starts in the mode `choosing`.
- **Schema tests:** every E035 rule at its bound; E041; W118, W119 and W120.
- **The convoy fixture** (`tools/cli/test/fixtures/convoy`), a slice of Wasteland Protocol: a convoy crossing eight nodes kept in a flag, a road deck, raiders, traders and a loan shark, a debt due three nodes on, a pursuit two days behind and a survivor who returns two choices later. Its golden runs, and tests over 30 seeds' runs that no consequence outlives its run, that no run ends inside an event, and that every choice made was open in the view at that state, its cost paid exactly.

## Open questions

1. **Odds moved by stats** (Landnam's 2d6 checks, Spliceworld's reasons). A chance is a whole percent written in content.
2. **A timed choice** (Afterglass's visitor, who takes the last answer once a quarter day passes): time doesn't pass while an event is open.
3. **A delay drawn from a range** (Dirtbag's 14 to 28 days).
4. **Naming a consequence nothing books.** A `cancel-later` or a condition naming an id no `later` books never matches; a lint across records, as the flag lint's W108 and W109, would find it.
5. **Showing a deck's chances** in the editor, for an author to see what a deck's weights and rules come to.
6. **An event's text filled in from state** (Dirtbag's `{ who }`), which waits on Phase 4's string tables.
