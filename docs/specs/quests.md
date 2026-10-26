# Spec: the quests kit

This is how the quests kit works (M3.9, [D47](../decisions.md); M3.10, [D48](../decisions.md)): quests of stages, whose objectives check themselves as the game runs, which fail on a condition or a deadline, and whose journal is a log of the stages reached and the objectives still open; slots the quest fills as it starts, quests that repeat, and timed jobs sealed as they begin. It is a kit as [kits.md](kits.md) has them: switched on in `project.json`, a pure module in `packages/kits/src/quests/`, its type, effect schemas and checks in `@eb/schema`. A port must follow it to start, move, count and fail the same quests from the same game.

It follows the games that came before ([research/missions.md](../research/missions.md)):

- **Space-Wrecked's quests:** steps that go done or cold, saved as a step and a state, and its validator.
- **Dirtbag's goals,** "checked after everything you do", and Wasteland's bounties, counters ticked by what happens.
- **Bethesda's stages and journal:** each stage reached adds its line to the quest's log.

M3.10 adds [slots](#slots) (Bethesda's aliases), [repeats](#repeats) and [jobs](#jobs), after Ludus's targets picked by rule and Spliceworld's operations sealed at launch ([research/aliases.md](../research/aliases.md)).

## Switching it on

```json
{ "format": 1, "id": "yard", "name": "The yard", "version": "0.1.0", "kits": ["inventory", "economy", "time", "quests"] }
```

- **The kit** is `quests`. It needs no other kit.
- Everything [kits.md](kits.md#switching-kits-on) says of a kit holds for it: E033, E034, the types, facts, events and effects, the module's place in a game, format 3 packs.
- **Deadlines** count the days that start, `time/day-started`, which the time kit or a game's own time module raises. A stage with days in a game without one is warned of (W120).

## Numbers

Whole numbers throughout, as in [kits.md](kits.md#numbers): a count's target and a stage's days are whole numbers from 1.

## Records

### quest

`records/quest/<id>.json`:

| Field | Means |
| --- | --- |
| `name` | its title in the journal: "The miner's debt". Required |
| `at-start` | true: it starts with the game |
| `starts-when` | a condition: it starts once this holds, read as each event is heard. It can name no slot: it is read before they are filled |
| `repeats` | true: it can run again once it has ended ([repeats](#repeats)) |
| `slots` | records it picks as it starts ([slots](#slots)) |
| `stages` | at least one, in the order written. The first is where it starts |

Each stage:

| Field | Means |
| --- | --- |
| `id` | what Then, an objective's Leads to, `set-stage` and conditions call it: lowercase words joined by hyphens, once in the quest. Required |
| `log` | the journal's line for it, added as it is reached |
| `effects` | what reaching it does, in order |
| `objectives` | what the player is to do, in the order shown |
| `next` | the stage the quest goes to once its objectives are done (Then). The quest is done when there is none |
| `fails` | true: reaching it ends the quest, failed, its log the reason |
| `fail-when` | a condition: while the stage is current, the quest fails once this holds |
| `days` | a deadline: the quest fails once this many days have started while the stage is current |
| `why` | what the journal says when the stage fails by its `fail-when` or `days`. "It failed." when left out |
| `job` | a timed job ([jobs](#jobs)) |

Each objective:

| Field | Means |
| --- | --- |
| `id` | what conditions call it: lowercase words joined by hyphens, once in the quest. Required |
| `text` | what the journal shows: "Pay the miner 30 credits". Required |
| `done-when` | a condition: the objective is done once this holds |
| `count` | `{ "event": "yard/salvaged", "args": { … }, "to": 5 }`: done once the event, with those argument values, has been heard `to` times while the stage is current |
| `next` | a stage it leads to: once it is done, the quest goes there at once (Leads to) |

An objective has `done-when` or `count`, not both. A `count`'s event and arguments are checked as a row's When is (E022, E023). Its argument values are text, the ids an event names: a count matches an argument by `===`, so one of a number kind can't be counted on; a `done-when` reading a fact can.

```json
{
  "name": "The miner's debt",
  "stages": [
    {
      "id": "owed",
      "log": "A miner wants 30 credits back within five days.",
      "objectives": [
        { "id": "pay", "text": "Pay the miner 30 credits", "done-when": "flag.on(paid-miner)", "next": "square" },
        { "id": "refuse", "text": "Or tell him no", "done-when": "flag.on(refused-miner)", "next": "hunted" }
      ],
      "days": 5,
      "why": "The miner came for it."
    },
    { "id": "square", "log": "The miner shook your hand." },
    { "id": "hunted", "log": "You refused, and his friends found you.", "fails": true }
  ]
}
```

Both of `owed`'s objectives lead somewhere, so the stage moves only by one of them, or fails when five days have started. `square` has no objectives and no Then: reaching it, the quest is done.

## State

```json
{
  "quests": {
    "debt": { "state": "active", "stage": "owed", "log": ["owed"], "done": [], "counts": {}, "days": 2 },
    "bounty": { "state": "active", "stage": "hunt", "log": ["hunt"], "done": [], "counts": { "scrap": 2 }, "days": 0 }
  }
}
```

- **A quest not yet started** has no entry.
- **`state`** is `active`, `done` or `failed`; **`stage`** the stage it is at, or ended at; **`log`** the stages reached, each once, in the order last reached: a stage reached again moves to the end, so a quest that loops can't grow its save.
- **`done`** holds the current stage's objectives done, sorted; **`counts`** its count objectives' counts; **`days`** the days started while it has been current. All three start empty as a stage is reached.
- **`why`** is the reason, once the quest has failed, its `{slot}`s named as they were then.
- **`slots`** (M3.10) holds each slot's record by the slot's id, while the quest runs and after it ends; **`lost`** the slots whose records have gone this run, sorted, so each is gone once.
- **`times`** holds, for a quest that repeats, its runs before this one that ended `done` and `failed`; **`again`**, on one that has ended, is true once its `starts-when` has stopped holding.
- **The kit's slice is version 2** (M3.10), its migration from version 1 leaving every entry as it was: version 1's entries have none of M3.10's fields. A save of the dock made by version 1 is a test fixture that must keep loading and playing on.

## Running

### Starting

A quest starts:

- by the effect `start-quest`;
- by `set-stage`, at that stage;
- with the game, when `at-start` is true, in the kit's start;
- once its `starts-when` holds: read in the kit's start, after the `at-start` quests, and as each event is heard.

Starting: its [slots](#slots) are filled, the entry is made `active`, `quests/started` is raised, and the quest reaches its first stage (or `set-stage`'s). A quest whose slots can't be filled doesn't start. A quest that has started, whether active, done or failed, doesn't start again, `start-quest` doing nothing to it, unless it [repeats](#repeats) and has ended.

### Reaching a stage

A [job](#jobs) at the stage it leaves is called off. The stage becomes `stage`, it is added to `log`, `done`, `counts` and `days` start empty, `quests/staged` is raised, the stage's `effects` apply, in order, and then its job, if it has one, is rolled. A stage that `fails` then ends the quest, failed, its `log` the reason, unless its effects moved the quest on or ended it. Otherwise the quest is checked at once, since its objectives may be met already.

- **The effects are one attempt,** as a consequence the events kit lands ([events.md](events.md)): one that refuses, such as a cost the party can't meet, undoes them all, `quests/refused` says why, and the stage is still reached. A quest never refuses the action that moved it.
- **The events the effects raise are heard before reaching the stage is done,** by every listener and by the kit itself. A stage that `fails` is failed by any check, so such an event can't finish it first.

### Checking

As each event is heard, each quest active when it was raised is checked, in the order of the quests' ids; waiting quests with `starts-when` are checked first, and start when it holds. The kit hears every event, as the events kit does, its own included, so a quest can wait on another: `"starts-when": "quests.state(bounty) == done"`. A quest is also checked as it starts and as it reaches a stage.

For a quest at a stage:

1. **Days.** The event is `time/day-started`: the stage's `days` is counted.
2. **Counts.** Each count objective not yet done whose event this is, with every argument it gives equal, is counted.
3. **Objectives.** Each objective not yet done, in the order written, is done once its `done-when` holds or its count reaches `to`: it joins `done` and `quests/objective-done` is raised. An objective once done stays done while the stage is current.
4. **Leads to.** The first objective done in this check that has a `next` moves the quest to that stage, and the check goes on there.
5. **Then.** The stage is done when it has no objectives, or when it has objectives without a `next` and every one of those is done. A stage whose objectives all have a `next` moves only by one of them, and a stage with a job only as the job ends. A done stage moves the quest to its `next`; with no `next`, the quest is done: `state` is `done`, and `quests/done` is raised.
6. **Gone.** Otherwise, the first slot whose record is [gone](#gone) moves the quest to the slot's `gone` stage, or fails it.
7. **Failing.** Otherwise, when `fail-when` holds or `days` has reached the stage's days, the quest fails: `state` is `failed`, `why` is the stage's, and `quests/failed` is raised.

Success comes before failure: a stage whose objectives are done in the check its deadline comes due is done. A slot's record gone comes before the stage's own failing, since a target lost makes the deadline moot, and the journal then says who is gone. A check moves a quest at most as many stages as it has, so every check ends. The next check comes at once, though, as the kit hears the stages it raised: a quest whose objectives are always met round a loop keeps moving until the kernel stops the action, 64 events deep, with an error that names `quests/staged` or `quests/objective-done`. E035 stops the loops content can show: stages that lead round to each other with nothing to wait on.

## Slots

A quest's slots (Bethesda's aliases) are records it picks as it starts, so one quest can be about a different member, item or place each time it runs (M3.10, [D48](../decisions.md)). In the quest's own fields, `@mark` stands for the record in the slot `mark` wherever a record's id goes: a fact's argument or the value it is compared with (`roster.member(@mark)`), an effect's field (`{ "effect": "leave", "actor": "@mark", "why": "dead" }`), a count's argument. `{mark}` in a stage's `log` or `why`, an objective's `text`, a job outcome's `text` or a slot's `why` shows the record's name, read as the journal is: the record's `name`, or its id when it has none. A `{x}` naming no slot is left as written (W128).

Since M6.7 a slot can also find a space by its tags, and an object or a placed actor in it, taking the nearest by doors: [radiant.md](radiant.md) ([D79](../decisions.md)).

```json
"slots": [
  {
    "id": "man", "type": "actor", "where": "roster.member(@man)", "pick": "random",
    "goes": true, "keeps": "roster.member(@man)", "gone": "forfeit"
  },
  {
    "id": "champ", "type": "actor", "where": "roster.member(@champ)",
    "pick": "most", "by": { "fact": "stats.value", "args": { "actor": "@champ", "stat": "fame" } }
  },
  { "id": "foe", "type": "actor", "record": "crixus" }
]
```

| Field | Means |
| --- | --- |
| `id` | what `@` and `{}` call it: lowercase words joined by hyphens, once in the quest. Required |
| `type` | the type of record it holds: `actor`, `item`, or a project's own. Required |
| `record` | the one record it holds, by id |
| `where` | a condition each record of the type is tried against, `@` and the slot's own id standing for the record tried. It may name the slots before it, never one after |
| `pick` | among the records that match: `first` by id (when left out), `random`, `most` or `least` |
| `by` | for `most` and `least`: `{ "fact": …, "args": { … } }`, a fact whose number ranks them. A record it gives no number for is left out; ties go to the first by id |
| `goes` | true: the record is sent, and away until the quest ends |
| `keeps` | a condition: while the quest is active, the slot keeps its record only while this holds |
| `gone` | the stage the quest goes to when the slot's record is gone; it fails when left out |
| `why` | what the journal says when the quest fails because the record is gone: "{id} is gone." when left out |

A slot has `record` or `where`, not both.

### Filling

As the quest starts, before it reaches its first stage, its slots are filled in the order written:

1. **The records tried** are every record of the slot's type by id, those modules make in play among them, such as the roster's recruits; for `record`, that one, if it exists.
2. **A record is left out** when it fills an earlier slot of this quest, or, for a slot that `goes`, when it is [away](#away).
3. **It matches** when `where` holds with `@` and the slot's id standing for it; an unknown counts as not holding.
4. **One is picked:** the first; one drawn from the kit's stream `quests/slots`, once for each slot filled at random; or the most or the least by `by`.

**When a slot can't be filled,** the quest doesn't start. `start-quest`, and `set-stage` on a quest that hasn't started, refuse the action (`unfilled`, with the quest and the slot), so a choice that would start it is refused and says why. A quest that starts with the game or by `starts-when` stays waiting and is tried again as each event is heard.

### Gone

While the quest is active, each check asks of each slot, in order, whether its record is gone: it no longer exists, or the slot's `keeps` doesn't hold. The first one gone joins `lost`, `quests/gone` is raised with the quest, the slot and the record, and the quest goes to the slot's `gone` stage, or fails with the slot's `why`. A slot is gone once a run: the record stays gone at the stage it led to. A record that leaves the roster stays a record ([roster.md](roster.md)), so only `keeps` sees it go: `"keeps": "roster.member(@man)"`.

### Away

A record is away while it fills a slot that `goes` of an active quest, from the quest's start to its end: `quests.away(record)` says so, and no other slot that goes takes it. Other kits don't ask: content that should send no one away reads `quests.away`.

## Repeats

`"repeats": true` lets a quest run again once it has ended, done or failed:

- **It starts again** by `start-quest` or `set-stage`, as a waiting quest does, or by its `starts-when`, once that has stopped holding and holds again, read as each event is heard. A `starts-when` that always holds starts it once and not again as soon as it ends, so a quest done at once can't loop; a run a week is `time.weekday == mon`.
- **A new run** fills its slots again and starts afresh. Its entry is made anew, its `times` the past runs counted: one more `done` or `failed` for the run that ended.
- A quest that doesn't repeat runs once, as before.

## Jobs

A stage with a `job` is a timed job, sealed as it is reached, as Spliceworld's operations are:

```json
{
  "id": "games",
  "log": "{man} fights at the games.",
  "job": {
    "takes": { "days": 2 },
    "outcomes": [
      { "chance": 60, "text": "{man} wins the crowd", "next": "won" },
      { "chance": 30, "text": "{man} is beaten", "next": "beaten" },
      { "chance": 10, "text": "{man} dies on the sand", "next": "killed" }
    ]
  }
}
```

| Field | Means |
| --- | --- |
| `takes` | how long, in the calendar's units, as a timer's `after` is: `{ "days": 2 }`, at least a tick |
| `outcomes` | each a `chance` in whole percents, the chances adding up to 100 as a `roll`'s do; a `text` for the journal; and `next`, the stage it leads to |

- **Rolled as it is reached,** after the stage's effects, from the kit's stream `quests/jobs` with `roll`'s table, so the odds the journal shows are the odds rolled. The outcome is kept as the time module's timer `quests-<quest>`, which moves the quest to the outcome's stage when it fires. Nothing a player does after, another draw or another order of actions, can roll it again.
- **While it runs** the stage waits. A stage with a job has no objectives, Then, `fails`, `fail-when` or days (E035). Its slots can still be gone.
- **Calling it off** is moving the quest off the stage: by `set-stage`, `fail-quest` or a slot's record gone, the timer is cancelled and its outcome with it.
- **Time passed while the game was closed** is the time module's: a game whose clock follows real time settles it as it loads, and the job's timer fires at its tick, not at the time the player looked.
- **A job needs a time module** (E045): without one the timer can't be set.

## What a quest shows

`game.preview(state, [{ "effect": "start-quest", "quest": id }], sim)` gives the quest's journal entry, from the state the kit keeps, so the journal says what the sim holds ([CLAUDE.md](../../CLAUDE.md)'s odds rule):

```json
{
  "effect": "start-quest",
  "quest": "debt",
  "name": "The miner's debt",
  "state": "active",
  "log": ["A miner wants 30 credits back within five days."],
  "objectives": [
    { "id": "pay", "text": "Pay the miner 30 credits", "done": false },
    { "id": "refuse", "text": "Or tell him no", "done": false }
  ],
  "days-left": 3
}
```

A count objective shows its count and target too: `{ "id": "scrap", "text": "Salvage five times", "done": false, "count": 2, "to": 5 }`.

- **`log`** is each reached stage's line, in order; a stage with no `log` adds none.
- **`objectives`** are the current stage's, while the quest is active; **`days-left`** is there when the stage has days.
- **`why`** is there once the quest has failed.
- **`slots`** (M3.10): each slot's record, `{ "man": { "id": "murmillo-3", "name": "Spurius" } }`; the `log` and the objectives' `text` show `{slot}` as its record's name.
- **`job`**, at a job's stage: its outcomes' chances and texts, and `left`, the ticks until it ends, as `time.left` says. Never which outcome was rolled.
- **`times`**, for a quest that repeats: its runs done and failed, this one counted once it has ended.
- A quest not yet started shows `"state": "waiting"`, with no log and no objectives, and `unfilled`, the first slot no record fills now, when its slots couldn't be filled.

## Effects

| Effect | Does | Preview |
| --- | --- | --- |
| `{ "effect": "start-quest", "quest": "debt" }` | Starts it ([starting](#starting)); nothing when it has started, unless it repeats and has ended. Refused (`unfilled`) when its slots can't be filled | [what a quest shows](#what-a-quest-shows) |
| `{ "effect": "set-stage", "quest": "debt", "stage": "hunted" }` | Moves an active quest to the stage, or starts a waiting one there, or one that repeats and has ended; nothing to a quest that has ended for good. Refused (`unfilled`) as start-quest is | `{ quest, stage, from }`: the stage it would leave, if any |
| `{ "effect": "fail-quest", "quest": "debt", "why": "…" }` | Fails an active quest, `why` its reason ("It was given up." when left out); nothing to another | `{ quest, why }` |

## Facts

| Fact | Domain | In words |
| --- | --- | --- |
| `quests.state(quest)` | `waiting`, `active`, `done` or `failed` | "debt is active" |
| `quests.stage(quest)` | text: the stage it is at, or ended at; no value while waiting | "debt is at its stage owed" |
| `quests.reached(quest, stage)` | bool: the stage is in its log | "debt has reached square" |
| `quests.objective(quest, objective)` | bool: done at the current stage | "pay of debt is done" |
| `quests.count(quest, objective)` | int from 0: a count objective's count at the current stage | "the count of dig of debt is at least 2" |
| `quests.tally(state)` | int from 0: how many quests are in that state | "the number of quests done is at least 3" |
| `quests.slot(quest, slot)` | text: the record in the slot; no value before the quest has started | "the man of booking is varro" |
| `quests.away(record)` | bool: the record is in a slot that goes of an active quest | "varro is away" |
| `quests.times(quest, state)` | int from 0: the runs that ended `done`, or `failed`, this one included once it has | "the times booking was done is at least 2" |

A stage or an objective its quest doesn't have, named in a fact, throws; validation stops it in content (E043). So does a slot (E044).

## Events

| Event | Arguments |
| --- | --- |
| `quests/started` | `quest`, `stage`: the stage it starts at |
| `quests/staged` | `quest`, `stage` |
| `quests/objective-done` | `quest`, `stage`, `objective` |
| `quests/done` | `quest` |
| `quests/failed` | `quest`, `why` |
| `quests/refused` | `quest`, `stage`, `reason`: the stage's effects refused, and were undone |
| `quests/gone` | `quest`, `slot`, `record`: the slot's record is gone (M3.10) |

## Checks

- **E035** (a kit's record that doesn't hold together), in a quest: a stage id twice, or one a condition can't write; an objective id twice in the quest, or one a condition can't write; a Then or a Leads to naming no stage of the quest; an objective with both or neither of `done-when` and `count`; a stage that `fails` and also has objectives, a Then, `fail-when` or days; stages that lead round to each other with nothing to wait on, which would never stop: by the Then of a stage with no objectives, or by a `set-stage` of the same quest among a stage's effects.
- **E022, E023** for a count's event and its arguments, as for a row's When.
- **E043:** a condition, or a `set-stage`, naming a stage or an objective its quest doesn't have: in `quests.reached`, `quests.objective`, `quests.count` and `quests.stage(…) == stage`. `quests.count` naming an objective done by `done-when` is E043 too, since its count is always 0.
- **W120:** days in a game without a time module.
- **W124:** a stage that neither the first stage reaches, by Then, Leads to and the `set-stage`s among its stages' effects, nor any `set-stage` names: nothing can bring the quest there. A Then counts only from a stage that can be done: one whose objectives all lead elsewhere never takes it.
- **W125:** a quest nothing starts: not `at-start`, no `starts-when`, and no `start-quest` or `set-stage` names it. One a game's scripts start is still warned of, as a talk is (W123).
- **E035** (M3.10), in a quest's slots and jobs: a slot's id twice, or one `@` can't write; a slot with both or neither of `record` and `where`; `most` or `least` without `by`, or `by` without them; a `by` whose fact isn't a number; a `gone` naming no stage, or given with no `keeps`; a stage with a job and objectives, a Then, `fails`, `fail-when` or days; an outcome naming no stage; chances not adding up to 100; a `takes` in units the calendar lacks, or of no tick; and anywhere, a `schedule` or `cancel-timer` naming a timer `quests-…`, which are the kit's.
- **E044:** `@x` naming no slot of its quest, in `starts-when`, which is read before the slots are filled, or anywhere outside a quest; `@x` where its slot's type isn't wanted; a `where` or `by` naming a slot after its own; `quests.slot` naming a slot the quest lacks; a `record` naming no record of the slot's type.
- **E045:** a job in a game whose events have no time module.
- **W127:** a slot no record can ever fill: none of its type is written, and no kit on makes them. A game's own module that makes them isn't seen.
- **W128:** `{x}` in a text naming no slot of its quest.
- **W126:** a stage the quest can reach from which it can never end: no path by Then and Leads to reaches a stage that is done with no Then, that fails, or that can fail by `fail-when` or days. A lead naming a stage the quest doesn't have is E035's, not W126's too. A job leads by its outcomes; a slot's `gone` stage is reached from every stage, and a slot with `keeps` and no `gone` can fail the quest at every stage. The kits' `quests/graph.ts` works these paths out for the checks and for the map alike.

## The map

The editor draws each quest as a map above its form, as it draws a talk ([editor-kits.md](editor-kits.md#the-quests-kit-m39)): a box for each stage, in rows by the fewest steps from the first, saying where its objectives, Then and job's outcomes lead, and whether it can fail. Above the rows, a line for each slot that keeps its record says where the quest goes when it is gone. A stage the first doesn't reach is in a last row. Tapping a box opens its stage's form.

## The bots

`eb sim` and the editor's Run report each quest's state at the runs' end, as a share of the runs: a quest no run finishes shows as never done, and one left `active` as started too late to finish, or stuck (Space-Wrecked's last-sector chains). A game's `game.ts` needn't list them: with the kit on, they are added after its own metrics. A quest that repeats adds its runs done and failed, as numbers.

## Proof

- **Unit tests** (`packages/kits/src/quests/`, with the dock, a test game in `packages/kits/test/dock.ts`): each way to start; reaching a stage, its log and effects; count and condition objectives, done once; Leads to before Then; done and failed quests, by `fails`, `fail-when`, days and `fail-quest`; success before failure in one check; a loop stopped by the kernel, not held; the journal equal to the state; the facts; ids called `constructor`.
- **Schema tests:** every E035 rule, E022 and E023 for counts, E043, W120, W124, W125 and W126.
- **The yard fixture** (`tools/cli/test/fixtures/yard`): a debt with a deadline and two ways out, a bounty counted, a ladder of goals. Its golden runs, and a test over 30 seeds' runs that every quest is done in some run and failed where it can fail, and that each journal entry agrees with the state.
- **M3.10's unit tests** (with the board, `packages/kits/test/board.ts`: the dock and a crew of number flags with names): each way to fill and pick, `@slot` bound in conditions, effects and counts, `{slot}` named, a quest unfilled, away, gone once and after success; repeats by each way, edge-triggered, counted; jobs sealed against other draws, ending near their odds over 400 seeds, shown without their outcome, called off three ways; and the version 1 save loading and playing on. Schema tests for every E035 rule, E044, E045, W127 and W128.
- **The school fixture** (`tools/cli/test/fixtures/school`, M3.10): a slice of Ludus with a booking that repeats all season for a gladiator picked at random, sent and kept while on the roster, its bout a job; and a rival's challenge to the school's most famous man. Its golden runs, and a test over 30 seeds that each quest is done, failed and lost to a gone record in some run, that made gladiators fill slots, that the bouts end near their odds, and that at every step the journal agrees with the state, the booked man is away, and a job's timer is pending only at its stage.

## Open questions

1. **Have and need for conditions:** a count shows "2 of 3"; a condition such as `economy.amount(credits) >= 50` could show "30 of 50" too, read from the fact it compares.
2. **Optional objectives,** shown but not needed for the stage, as Bethesda has.
3. **A journal screen** is the stage's, in Phase 4; the preview is what it will read.
4. **A cooldown between a repeat's runs,** as Spliceworld's board has; content's own flag and timer do it now.
5. **Fields a quest never reads:** a Then from a stage whose objectives all lead elsewhere, and Fails when or Days on a stage with no objectives, which is done at once. The map says so of the first; a warning could say both, as a field the engine never reads.
6. **The player picking who fills a slot,** Spliceworld's crew picker, which matters once odds move by stats (D48).
7. **Other records naming a quest's slot:** a talk about the booked man can compare `quests.slot(booking, man)` with an id, but can't name him as `@man`.
8. **A job's roll inside its outcome's stage:** the outcome is sealed, but a `roll` or a loot draw among the stage's effects is drawn as the stage is reached.
