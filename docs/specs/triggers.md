# Spec: trigger sheets

This is how events, listeners, flags and trigger sheets work: events and listeners in `packages/core/src/sim/`, the flag and sheet modules in `packages/core/src/sheets/`, and their checks in `@eb/schema` (M3.1, [D36](../decisions.md)). A port must follow it to raise the same events, run the same rows in the same order and keep the same state.

It follows the trigger editors and games that came before:

- **Warcraft III's trigger editor** splits a trigger into Events, Conditions and Actions. Here they are a row's When, If and Do.
- **Rows run every time** their event happens, as StarEdit's triggers run again only when "Preserve Trigger" is set and GDevelop offers "Trigger once while true". Here a row runs every time unless it is `once`.
- **rule-or-drool's flags and its lint** (`src/validate/rules.ts`): a flag set but never read, or read but never set, is an error there. Here flags are declared records, so a misspelled one is already an error where it is written, and the lint's findings are warnings.
- **On/off flags start off**, as RPG Maker's switches do. A flag is named for what happens (`met-trader`, `door-opened`), not for its absence.

## Events

An event is a beat that content may react to. A module declares its events beside its facts and effects:

```ts
events: { arrived: { args: { day: { type: 'int', min: 0 }, event: { type: 'ref', to: 'event' } }, label: 'The crew arrives' } }
```

- **Ids.** Each is registered as `module/name`, both kebab-case. Argument names follow fact arguments' rule, and their domains are the facts' ([conditions.md](conditions.md)). A malformed declaration throws when the game is made.
- **Raising one** is `ctx.emit(name, args)`. The kernel checks the data against the declaration: every argument given, nothing else, each in its domain, a `ref` naming a record that exists. Anything else throws, as a bug in the module that raised it, because rows match on these arguments.
- **A beat that isn't declared** is a beat only, for the stage, as before.
- **The catalogue.** `game.events()`, and `eventCatalog(modules)` without a start mode, list every event by id, sorted, with its arguments and label: what rows' When is checked against.

The engine's own events:

| Event | Arguments | Raised |
| --- | --- | --- |
| `flag/changed` | `flag` (ref flag) | when set-flag or add-to-flag changes a flag's value |
| `sheet/fired` | `sheet` (ref sheet), `row` (text) | when a row runs, before its effects |
| `time/passed` | `from`, `to` (ticks) | once per advance ([time.md](time.md)) |
| `time/fired` | `timer` (text), `at` (tick) | when a timer fires, inside its attempt |

## Listeners

A module answers events with `on`: an entry per event id, or `'*'` for every event it has no entry for. A listener is `(ctx, event) => void` and runs with its module's own context, as an effect does: it reads its slice, applies effects, raises events, attempts and refuses.

- **Checked when the game is made.** A listener for an event no module declares throws, since it would never run.
- **When an event is heard.** A listener hears an event when the work that raised it finishes. That work is the action's handler, an attempt (`ctx.attempt`), or another listener. So:
  - an event raised by an action's handler outside any attempt is heard once the handler returns;
  - an event raised inside an attempt is heard at the end of that attempt, still inside it: a timer's `time/fired` is heard at the timer's tick, not at the end of the wait that reached it;
  - an event raised in an attempt that refuses is never heard, as the attempt never happened;
  - a listener that refuses outside an attempt refuses the work it is inside: the action, or the attempt.
- **Order.**
  - Events raised in one piece of work are heard in the order raised.
  - Each is handed to the modules listening, in the order the game lists its modules.
  - Each listener's call is a piece of work of its own, so what it raises is heard before the next module hears the first event. A row's consequences come before the next row runs.
- **Depth.** Listeners hearing events raised by listeners are fine; 64 deep throws, as a row raising the event it hears would. Any number of events one after another is fine.
- **Previews don't hear events.** `game.preview` shows what an effect does, not what listeners do in answer (D36).

## Flags

A flag is something content remembers: `records/flag/<id>.json`.

```json
{ "name": "Met the trader" }
{ "name": "Raids survived", "number": { "start": 0, "min": 0, "max": 10 } }
```

- **Kinds.** Without `number`, a flag is on or off, and starts off. With it, a flag is a whole number that starts at `start` (0 when left out) and stays within `min` and `max`, each a bound only when given.
- **Facts** ([conditions.md](conditions.md)):

  | Fact | Domain | Answers |
  | --- | --- | --- |
  | `flag.on(flag)` | bool | an on/off flag's value; no value for a number flag |
  | `flag.number(flag)` | int | a number flag's value; no value for an on/off flag |

- **Effects.**

  | Effect | Does | Preview |
  | --- | --- | --- |
  | `{ "effect": "set-flag", "flag": "met-trader", "to": true }` | Sets the flag: true or false for an on/off flag, a whole number for a number flag, kept within its bounds. | `{ flag, from, to }` |
  | `{ "effect": "add-to-flag", "flag": "raids", "by": 1 }` | Adds to a number flag, kept within its bounds. Below 0 takes away. | `{ flag, from, to }` |

- **`flag/changed`** is raised only when the value changes. A set to the value it has, or past a bound it is at, changes nothing and raises nothing.
- **The slice** is `{ "values": { "met-trader": true } }`: only the flags whose value differs from their start. A flag set back to its start leaves the slice. So a content update to a start reaches the games that never changed that flag, and a value is always read within the bounds content has now.
- **Bugs, not refusals.** A set-flag naming no flag, or a `to` or `by` of the wrong kind, throws. Validation stops each first (E005, E026).

## Sheets

A trigger sheet is `records/sheet/<id>.json`: rows of When, If and Do, run in the order written.

```json
{
  "name": "The voyage",
  "rows": [
    {
      "id": "meet-trader",
      "note": "The first trader the crew meets",
      "when": { "event": "voyage/arrived", "args": { "event": "trader" } },
      "if": "not flag.on(met-trader)",
      "do": [{ "effect": "set-flag", "flag": "met-trader", "to": true }],
      "once": true
    }
  ]
}
```

The sheet module listens for every event. For each event heard:

1. **The rows for it.** Every row whose `when.event` is the event's id, sheets in id order, rows in the order written. The list is made once per content pack.
2. **Arguments.** Each argument the row's `when.args` lists must equal the event's (`===` on JSON values). One left out matches any.
3. **Once.** A `once` row that has run is skipped.
4. **If.** The condition must be true; unknown counts as false, as everywhere ([conditions.md](conditions.md)).
5. **Do.** The row runs as one attempt: `sheet/fired { sheet, row }` first, then its effects in order, and a `once` row is remembered. If anything in it refuses, all of it is undone and the beat `sheet/refused { sheet, row, reason }` says so. The action that raised the event stands, and a once row that refused hasn't run.

The slice is `{ "fired": ["voyage/meet-trader"] }`: the once rows that have run, as `sheet/row`, sorted. A save keeps which rows ran by id, so a once row renamed in content runs again in older saves (D36).

## Checks

**The engine's types.** `flag` and `sheet` are record types every project has, with or without a game's code ([records.md](records.md)):

- `flag` is a type file (`FLAG_TYPE_FILE`), so forms and tables draw it as a project's own types. Its bounds and start are checked beyond what a type file says (E027).
- `sheet` is a zod type (`SHEET_TYPE`). The editor lays its form out from `SHEET_TYPE_FILE`, a test holding the two to the same fields.
- A project's `types/flag.json` or `types/sheet.json` is E017; a game's code type of either name throws.

**What content is checked against** (D36):

| | No game known | With `--types`, or the project's scripts/game.ts once it runs (M3.2) |
| --- | --- | --- |
| Facts | the engine's own; any other taken as written | the game's: another is E012 |
| Events | the engine's own; any other taken as written | the game's: another is E022 |
| Effects | the engine's own; any other kept as written | the game's `effects`, or the names its modules handle: another is E025 |

With no game to ask, a name the engine doesn't know may be the game's own, or a typo: it is kept as written. Since M3.2 a project's `scripts/game.ts` is its game ([scripts.md](scripts.md#content-checked-against-the-game)): `eb` runs it when there is no `--types`, and the editor once the project is trusted, so both check content against it.

**Effect fields.** `effect()` marks a field that holds an effect, as `condition()` marks a condition. zod checks only that it is an object naming itself; the effect check then looks the name up:

- a known effect is checked against its own schema (E001 at places inside it), and the references, conditions, assets and effects inside it are found and checked like the record's own;
- an unknown one is E025 in a game's catalogue, or kept as written in the engine's.

The engine's effect schemas (`setFlagEffect()`, `addToFlagEffect()`, `rollEffect()`, `waitEffect()`, `scheduleEffect()`, `cancelTimerEffect()`) carry their names too, so the checks find a set-flag inside a game's own union of effects as well.

**A sheet's own checks:**

- each row's event against the catalogue (E022 in a game's);
- its argument values against the event's arguments (E023): a name the event lacks, or a value outside the argument's domain. An argument naming a record counts for used-by;
- each row id once within the sheet (E024).

**The flags' checks**, across the project:

- **E027:** a flag's lowest above its highest, or a start outside its bounds, the 0 of a start left out included.
- **E026:** a flag set or read as the other kind: set-flag's `to` of the wrong kind, or outside the bounds; add-to-flag on an on/off flag; `flag.on` of a number flag, or `flag.number` of an on/off flag.
- **The lint**, on each flag record:
  - **W108:** set, by set-flag or add-to-flag, but never read;
  - **W109:** read, by a condition or a row's When, but never set: it always holds its start;
  - **W110:** never named at all.

**Packing.** Condition text inside the effects the catalogue knows becomes trees, as in the record's own fields ([records.md](records.md)). An effect the catalogue doesn't know is kept as written.

## Codes

| Code | Means |
| --- | --- |
| E022 | A row names an event the game does not have |
| E023 | A row's event arguments are unknown, or not among the argument's values |
| E024 | Two rows of a sheet have the same id |
| E025 | An effect the game does not have |
| E026 | A flag is set or read as the other kind, or set outside its bounds |
| E027 | A flag's start lies outside its bounds, or its lowest is above its highest |
| W108 | A flag is set, but nothing reads it |
| W109 | A flag is read, but nothing sets it |
| W110 | Nothing sets or reads a flag |

## The CLI

- **`--types`** may export `events` (an event catalogue) and `effects` (every effect's schema, each a strict object whose `effect` is a literal), as it exports `facts`. A `modules` export gives the facts and events.
- **`eb sim`** checks content against its game's modules' facts and events, and its effects when the game exports them.
- **`eb schemas`** writes the engine types' schemas once the project has records of them ([editor-problems.md](editor-problems.md)).

## Proof

- **The kernel** (`sim/events.test.ts`): declaring, the catalogue sorted whatever the order declared, checks when raised, hearing after the work in the order raised and in module order, within an attempt, never after a refusal, depth first, `*`, a listener refusing, many events one after another, and the depth cap.
- **Flags and sheets** (`sheets/flags.test.ts`, `sheets/sheets.test.ts`): starts, kinds, bounds, the slice, previews and content updates; rows' arguments, conditions, once, order, depth first, refusal, and a row hearing a timer at its tick in a five-day wait.
- **Salvage run** gains three flags and a five-row sheet: the trader met once on arrival; a tithe on each salvage looted once met, refused when the hold can't pay; raider fights counted; a heal once three are fought; and the raiders' debt cleared when it falls due. `sheets/salvage.test.ts` plays 200 seeds and holds every row to what it says, at the moment it says. Its `eb sim` golden was written again on purpose. The M1.8 save fixture loads unchanged in the game that saved it, and in today's game with the flag and sheet slices added.
- **Checks** (`schema/src/sheets.test.ts`): the open and closed worlds, effects inside effects, every code, the lint, and the sheet's layout held to its schema. `compiler/src/compile.test.ts` fires every new code through `compileProject`, and `tools/cli/test/cli.test.ts` the closed world through `eb validate --types`.
- **Timing:** `packages/core/test/trigger-bench.ts`, an event heard by none, by the sheet module with no rows for it, and by rows that don't match, whose If is false, and that run; readings in ROADMAP.md.
- **Planted bugs:** see ROADMAP.md's M3.1 entry.

## Open questions

1. **A "game starts" event.** Warcraft III's most used event is map initialization. Here `init` runs no actions, so nothing raises one; a first action every stage sends could.
2. **Previews that follow events.** A row that rolls in answer to a choice isn't in that choice's preview. A preview could hear events in a transaction it throws away, at the price of running content to show a menu.
3. **Renamed once rows.** They run again in older saves. The editor could warn when a once row's id changes, or a sheet could keep the ids its rows had.
4. **Flags read by code.** A flag only a game's code reads warns W108. A module could declare the flags it reads.
5. **Flags that outlive a run,** such as rule-or-drool's legacies, belong with saves and slots (Phase 4).
6. **What a game's own effects change.** The lint knows set-flag and add-to-flag. A kit's facts set by its effects would need effects to say what they change, conditions.md's question 2 in its wider form. M3.3's kits don't say it yet: a condition on `inventory.count(medkit)` is never linted as unreachable.
7. **Rows on mode changes.** The kernel's own `mode` beat isn't an event yet.
