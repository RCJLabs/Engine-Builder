# Spec: the quests kit

This is how the quests kit works (M3.9, [D47](../decisions.md)): quests of stages, whose objectives check themselves as the game runs, which fail on a condition or a deadline, and whose journal is a log of the stages reached and the objectives still open. It is a kit as [kits.md](kits.md) has them: switched on in `project.json`, a pure module in `packages/kits/src/quests/`, its type, effect schemas and checks in `@eb/schema`. A port must follow it to start, move, count and fail the same quests from the same game.

It follows the games that came before ([research/missions.md](../research/missions.md)):

- **Space-Wrecked's quests:** steps that go done or cold, saved as a step and a state, and its validator.
- **Dirtbag's goals,** "checked after everything you do", and Wasteland's bounties, counters ticked by what happens.
- **Bethesda's stages and journal:** each stage reached adds its line to the quest's log.

Aliases, quests that repeat with new targets, and timed jobs sealed at launch are M3.10's.

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
| `starts-when` | a condition: it starts once this holds, read as each event is heard |
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
- **`why`** is the reason, once the quest has failed.

## Running

### Starting

A quest starts:

- by the effect `start-quest`;
- by `set-stage`, at that stage;
- with the game, when `at-start` is true, in the kit's start;
- once its `starts-when` holds: read in the kit's start, after the `at-start` quests, and as each event is heard.

Starting: the entry is made `active`, `quests/started` is raised, and the quest reaches its first stage (or `set-stage`'s). A quest that has started, whether active, done or failed, doesn't start again: `start-quest` does nothing to it.

### Reaching a stage

The stage becomes `stage`, it is added to `log`, `done`, `counts` and `days` start empty, `quests/staged` is raised, and the stage's `effects` apply, in order. A stage that `fails` then ends the quest, failed, its `log` the reason, unless its effects moved the quest on or ended it. Otherwise the quest is checked at once, since its objectives may be met already.

### Checking

As each event is heard, each quest active when it was raised is checked, in the order of the quests' ids; waiting quests with `starts-when` are checked first, and start when it holds. The kit hears every event, as the events kit does, its own included, so a quest can wait on another: `"starts-when": "quests.state(bounty) == done"`. A quest is also checked as it starts and as it reaches a stage.

For a quest at a stage:

1. **Days.** The event is `time/day-started`: the stage's `days` is counted.
2. **Counts.** Each count objective not yet done whose event this is, with every argument it gives equal, is counted.
3. **Objectives.** Each objective not yet done, in the order written, is done once its `done-when` holds or its count reaches `to`: it joins `done` and `quests/objective-done` is raised. An objective once done stays done while the stage is current.
4. **Leads to.** The first objective done in this check that has a `next` moves the quest to that stage, and the check goes on there.
5. **Then.** The stage is done when it has no objectives, or when it has objectives without a `next` and every one of those is done. A stage whose objectives all have a `next` moves only by one of them. A done stage moves the quest to its `next`; with no `next`, the quest is done: `state` is `done`, and `quests/done` is raised.
6. **Failing.** Otherwise, when `fail-when` holds or `days` has reached the stage's days, the quest fails: `state` is `failed`, `why` is the stage's, and `quests/failed` is raised.

Success comes before failure: a stage whose objectives are done in the check its deadline comes due is done. A check moves a quest at most as many stages as it has, so every check ends. The next check comes at once, though, as the kit hears the stages it raised: a quest whose objectives are always met round a loop keeps moving until the kernel stops the action, 64 events deep, with an error that names `quests/staged` or `quests/objective-done`. E035 stops the loops content can show: stages that lead round to each other with nothing to wait on.

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
- A quest not yet started shows `"state": "waiting"`, with no log and no objectives.

## Effects

| Effect | Does | Preview |
| --- | --- | --- |
| `{ "effect": "start-quest", "quest": "debt" }` | Starts it ([starting](#starting)); nothing when it has started | [what a quest shows](#what-a-quest-shows) |
| `{ "effect": "set-stage", "quest": "debt", "stage": "hunted" }` | Moves an active quest to the stage, or starts a waiting one there; nothing to a quest that has ended | `{ quest, stage, from }`: the stage it would leave, if any |
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

A stage or an objective its quest doesn't have, named in a fact, throws; validation stops it in content (E043).

## Events

| Event | Arguments |
| --- | --- |
| `quests/started` | `quest`, `stage`: the stage it starts at |
| `quests/staged` | `quest`, `stage` |
| `quests/objective-done` | `quest`, `stage`, `objective` |
| `quests/done` | `quest` |
| `quests/failed` | `quest`, `why` |

## Checks

- **E035** (a kit's record that doesn't hold together), in a quest: a stage id twice, or one a condition can't write; an objective id twice in the quest, or one a condition can't write; a Then or a Leads to naming no stage of the quest; an objective with both or neither of `done-when` and `count`; a stage that `fails` and also has objectives, a Then, `fail-when` or days; stages that lead round to each other with nothing to wait on, which would never stop: by the Then of a stage with no objectives, or by a `set-stage` of the same quest among a stage's effects.
- **E022, E023** for a count's event and its arguments, as for a row's When.
- **E043:** a condition, or a `set-stage`, naming a stage or an objective its quest doesn't have: in `quests.reached`, `quests.objective`, `quests.count` and `quests.stage(…) == stage`. `quests.count` naming an objective done by `done-when` is E043 too, since its count is always 0.
- **W120:** days in a game without a time module.
- **W124:** a stage that neither the first stage reaches, by Then, Leads to and the `set-stage`s among its stages' effects, nor any `set-stage` names: nothing can bring the quest there. A Then counts only from a stage that can be done: one whose objectives all lead elsewhere never takes it.
- **W125:** a quest nothing starts: not `at-start`, no `starts-when`, and no `start-quest` or `set-stage` names it. One a game's scripts start is still warned of, as a talk is (W123).
- **W126:** a stage the quest can reach from which it can never end: no path by Then and Leads to reaches a stage that is done with no Then, that fails, or that can fail by `fail-when` or days. A lead naming a stage the quest doesn't have is E035's, not W126's too. The kits' `quests/graph.ts` works these paths out for the checks and for the map alike.

## The map

The editor draws each quest as a map above its form, as it draws a talk ([editor-kits.md](editor-kits.md#the-quests-kit-m39)): a box for each stage, in rows by the fewest steps from the first, saying where its objectives and Then lead, and whether it can fail. A stage the first doesn't reach is in a last row. Tapping a box opens its stage's form.

## The bots

`eb sim` and the editor's Run report each quest's state at the runs' end, as a share of the runs: a quest no run finishes shows as never done, and one left `active` as started too late to finish, or stuck (Space-Wrecked's last-sector chains). A game's `game.ts` needn't list them: with the kit on, they are added after its own metrics.

## Proof

- **Unit tests** (`packages/kits/src/quests/`, with the dock, a test game in `packages/kits/test/dock.ts`): each way to start; reaching a stage, its log and effects; count and condition objectives, done once; Leads to before Then; done and failed quests, by `fails`, `fail-when`, days and `fail-quest`; success before failure in one check; a loop stopped by the kernel, not held; the journal equal to the state; the facts; ids called `constructor`.
- **Schema tests:** every E035 rule, E022 and E023 for counts, E043, W120, W124, W125 and W126.
- **The yard fixture** (`tools/cli/test/fixtures/yard`): a debt with a deadline and two ways out, a bounty counted, a ladder of goals. Its golden runs, and a test over 30 seeds' runs that every quest is done in some run and failed where it can fail, and that each journal entry agrees with the state.

## Open questions

1. **Have and need for conditions:** a count shows "2 of 3"; a condition such as `economy.amount(credits) >= 50` could show "30 of 50" too, read from the fact it compares.
2. **Optional objectives,** shown but not needed for the stage, as Bethesda has.
3. **A journal screen** is the stage's, in Phase 4; the preview is what it will read.
4. **Repeating quests** come with aliases (M3.10): a quest done or failed stays so until then.
