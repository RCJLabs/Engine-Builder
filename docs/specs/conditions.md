# Spec: conditions, previews and the roll effect

This is exactly what conditions do, in `packages/core/src/logic/`, and how records carry them, in `@eb/schema`. A port must follow it to read the same text, reach the same truth and lint the same way.

One condition language serves quests, dialogue, events, triggers and UI bindings. The patterns come from the existing games:

- **who-am-i-:** three-valued (Kleene) evaluation, parse errors with a column and a hint, and a "can this ever be true?" search capped at 100,000 combinations, then 20,000 samples.
- **space-wrecked:** a roll checked against the outcomes in the order written, and a result the player can read ("Rolled 24: the 70% came up"). Its preview missed caps, which previews here avoid by reading state.
- **dirtbag:** "needs" lines for locked options, which `describeCondition` writes.

## The tree

```json
{ "all": [
  { "fact": "hold.count", "args": { "item": "medkit" }, "op": ">=", "value": 2 },
  { "not": { "fact": "voyage.night" } }
] }
```

- **Groups.** `{ "all": [...] }` and `{ "any": [...] }` hold two or more conditions. `{ "not": condition }` holds one.
- **Tests.** `{ "fact", "args"?, "op"?, "value"? }`.
  - `fact` is `module.name`. Both parts are names: `[a-z][a-z0-9]*(-[a-z0-9]+)*`, so a name never starts with a digit and the text form can tell names from numbers.
  - `args` maps argument names (names again) to values. Leave it out when there are none; `{}` is an error.
  - `op` is one of `== != < <= > >=`, and `value` comes with it. A test with neither is a yes/no test: the fact holds.
- **Values** are text, `true`/`false`, or numbers that print without an exponent: finite, not `-0`, and `String(n)` matches `-?\d+(\.\d+)?`. So `1e21` and `1e-7` are out, and every number reads back exactly.
- **One kind per node.** A node with two of `all`, `any`, `not` and `fact`, or an unknown key, is an error.

`checkCondition(condition, { catalog?, records? })` returns every problem at a JSON Pointer inside the condition. It checks the shape first, and only a sound test goes on to the catalog:

| Code | When |
| --- | --- |
| E011 | The shape is wrong: not an object, no kind or two kinds, a group of fewer than two, an unknown field, a bad name, empty `args`, `op` without `value` or the reverse, an unknown op, a value that isn't text, a boolean or a printable number. |
| E012 | The catalog has no such fact. |
| E013 | An argument is missing, unknown, or not one of its domain's values: wrong type, a fraction for an int, out of bounds, or a record that doesn't exist. |
| E014 | The test can't fit the fact: a yes/no test of a fact that isn't bool, an ordering of a fact that isn't a number, or a value of the wrong type, not in the enum, or naming a record that doesn't exist. |

E014 doesn't check a compared number against the fact's bounds: `hold.count(medkit) > 200` with a max of 99 is sound, and the lint reports that it is never true (W102).

## The text form

```
hold.count(medkit) >= 2 and not voyage.night
```

```
or     = and { "or" and }
and    = not { "and" not }
not    = "not" not | "(" or ")" | test
test   = fact [ "(" args ")" ] [ op value ]
args   = value | arg { "," arg }
arg    = name ":" value
op     = "==" | "!=" | "<" | "<=" | ">" | ">="
value  = number | string | "true" | "false" | name
fact   = name "." name
name   = [a-z][a-z0-9]*(-[a-z0-9]+)*
number = ["-"] digits ["." digits], not followed by a letter, a digit, "_" or "."
string = a JSON string in double quotes
```

- **Precedence.** `or` binds loosest, then `and`, then `not`, then a comparison. `and`, `or`, `not`, `true` and `false` are keywords.
- **Nodes.** A chain of one word is one node: `a.x and b.y and c.z` is one `all` of three. Brackets keep a group as its own node: `(a.x and b.y) and c.z` is an `all` of an `all` and a test.
- **A bare value.** A name that is not a keyword is text: `voyage.sector == rim`. Text with a dot, a space or a capital goes in quotes.
- **Arguments.** With a catalog, a fact with exactly one argument may take it without its name: `hold.count(medkit)`. Otherwise every argument is named, and an argument named twice is an error. `fact()` is an error: a fact with no arguments has no brackets.

`parseCondition(text, catalog?)` returns `{ ok: true, condition }` or `{ ok: false, message, at }`, where `at` counts UTF-16 units from 0 and the message ends "(column at + 1)". Common slips get a hint:

| Wrote | Hint |
| --- | --- |
| `&&`, `\|\|`, `!` | write "and", "or", "not" |
| `=` | compare with "==" |
| `'rim'` | text goes in double quotes |
| `Voyage.night` | names are lowercase, like hold.count |
| `1e5`, `2nd` | numbers have no exponent or letters; quote text that starts with a digit |
| `x.y == a.b` | text with a dot goes in quotes |

`printCondition(condition, catalog?)` writes the canonical text:

- one space around `and`, `or`, `not` and each op;
- a nested `all` or `any` always in brackets, even under the other word;
- arguments sorted by name as `name: value`, or bare when the catalog gives the fact exactly that one argument;
- numbers as `String(n)`; text bare when it is a name and not a keyword, otherwise as JSON.

**Round trip.** For every sound tree, `parseCondition(printCondition(tree))` gives the same tree, with or without a catalog. A property test checks this on 500 random trees with any printable double and any UTF-16 text.

| Text | Tree |
| --- | --- |
| `a.x or b.y and not c.z >= 2` | `{"any":[{"fact":"a.x"},{"all":[{"fact":"b.y"},{"not":{"fact":"c.z","op":">=","value":2}}]}]}` |
| `crew.trait(trait: brave, member: rook)` | `{"fact":"crew.trait","args":{"trait":"brave","member":"rook"}}`, printed back as `crew.trait(member: rook, trait: brave)` |
| `x.y != -0.50` | `{"fact":"x.y","op":"!=","value":-0.5}`, printed back as `x.y != -0.5` |

## Evaluation

`evaluate(condition, read)` returns `true`, `false` or `null` (unknown). `read(test)` returns the test's fact now, or `undefined`/`null` when it has no value.

| a | b | all | any | not a |
| --- | --- | --- | --- | --- |
| true | true | true | true | false |
| true | false | false | true | false |
| true | unknown | unknown | true | false |
| false | false | false | false | true |
| false | unknown | false | unknown | true |
| unknown | unknown | unknown | unknown | unknown |

- **A yes/no test** is the fact's value if that is `true` or `false`, and unknown otherwise.
- **A comparison** is unknown when the fact has no value, is `NaN`, or is of another type than the value. `==` and `!=` compare with `===`. Orderings compare numbers; an ordering of text is unknown.
- **Order.** The answer never depends on the order of a group's parts (property-tested).
- **Gates use `!== true`,** so unknown never opens a locked choice.

In the kernel:

- `ctx.check(condition)` evaluates through the action's changes so far;
- `game.check(state, condition, sim)` is the same evaluation, for menus and bots.

What a menu offers is therefore what the sim allows. The condition is trusted: packs are checked when they are built, and anything else should pass `checkCondition` first.

## Facts

A module declares a fact as a function, or with what conditions need to know about it:

```ts
facts: {
  count: {
    read: ({ state }, args) => state.items[args.item as string] ?? 0,
    args: { item: { type: 'ref', to: 'item' } },
    domain: { type: 'int', min: 0 },
    label: 'carried',
    describe: (test) => (test.op === '>=' ? `${test.value} ${test.args?.item} to sell` : undefined),
  },
}
```

- **Domains.** The values a fact or an argument takes:
  - `bool`;
  - `int` and `number`, with optional `min` and `max`, both inclusive;
  - `enum` with `values`;
  - `ref` with `to`, the id of a record of that type;
  - `text`.
- **A domain is a promise.** A fact with a domain answers one of its values, or `undefined`/`null` for none. The kernel checks every answer and throws on a broken promise, for example `Fact "hold.credits" answered -1, outside its domain: Expected at least 0`. The lint trusts domains, so this check is what makes the lint's verdicts hold.
- **`createGame` checks declarations.** It throws when:
  - a fact id can't be written in a condition (a module id that starts with a digit);
  - an argument name isn't a name;
  - a domain is malformed: min above max, no whole number between an int's bounds, an infinite bound, an empty enum, an enum value listed twice or one a condition can't write, or a `ref` whose `to` isn't a type name.
- **The catalog.** `game.catalog()` and `factCatalog(modules)` give every fact's declaration without `read`, sorted by id. This is what content is checked against.

## describeCondition(condition, catalog?)

| Condition | Words |
| --- | --- |
| `hold.count(medkit) >= 2 and not voyage.night` | Needs 2 medkits and not night |
| `hold.credits <= 5` | Credits is at most 5 |
| `not hold.credits < 5` | Credits is at least 5 |
| `voyage.night == false` | Not night |
| `voyage.night or (voyage.sector == rim and hold.credits > 0)` | Night or (sector is rim and credits is more than 0) |
| `crew.hp(member: kit) <= 3`, no catalog | Crew hp (kit) is at most 3 |

- **A test.**
  - The fact's own `describe(test)` wins.
  - Otherwise the subject is its `label`, or its id with `.` and `-` as spaces, then its arguments' values in brackets, sorted by name.
  - Then the op in words: is, is not, is less than, is at most, is more than, is at least.
  - A comparison with `true` or `false` reads as the subject or "not" the subject.
- **`not` of a comparison** becomes the opposite comparison. `not x < 3` and `x >= 3` agree in three-valued logic too, since both are unknown when x has no number. `not` of anything else is "not …".
- **Groups.** "a and b", "a, b and c". A nested group goes in brackets.
- **Case.** The first letter is made a capital, so a fact's own wording should start lowercase.
- **Language.** English only, until string tables.

## The lint: can this ever be true?

`satisfiability(condition, { catalog?, records? })` returns `{ canBeTrue, canBeFalse, combinations, exhaustive }`.

**Variables.** Each distinct fact-and-arguments is one variable, with arguments compared by canonical JSON. `hold.count(medkit)` and `hold.count(salvage)` are two variables.

**Points.** Each variable gets one value from each class of values that its tests can tell apart:

| Domain | Points |
| --- | --- |
| bool | false, true |
| enum | the values compared with that are in the enum, plus one value that isn't compared with, if any |
| ref | the ids compared with that exist, plus one other existing id; without records, plus one made-up id |
| text | the texts compared with, plus one other text |
| int | c−1, c and c+1 for each whole constant c; ⌊c⌋ and ⌈c⌉ for a fractional one; the bounds; all inside the bounds, or 0 when nothing applies |
| number | each constant and bound; the midpoint of each neighbouring pair; one point below the lowest and one above the highest; inside the bounds |
| none | false and true if a test is yes/no or compares with true/false; the texts compared with, plus one other; the numbers, as for an unbounded number |

**No unknowns.** Facts having no value is left out. Kleene's operators are monotone: giving an unknown fact any value keeps every definite answer. So a fact with no value can't make a condition true, or false, unless some value of it would.

**Search.**
- **Exhaustive.** Up to `EXHAUSTIVE_LIMIT` = 100,000 combinations, every one is tried, in odometer order. The search stops once both true and false have been seen.
- **Sampled.** Past that, it tries `SAMPLES` = 20,000 combinations drawn from `Rng.create('eb/condition-lint')`. The seed is fixed, so a project gets the same verdict on every build. A side the sample never saw is `null`.

**Diagnostics on a sound condition:**

| Code | When | Message |
| --- | --- | --- |
| W102 | `canBeTrue` is false | This condition is never true, whatever its facts hold |
| W103 | `canBeFalse` is false | This condition is never false: it holds whenever its facts have values |
| W104 | `canBeTrue` is null | Could not tell whether this condition can be true: none of 20000 samples of its N combinations was |

**What the lint promises.**
- **Sound.** What it reports holds for every state: if no combination of values makes a condition true, no state does.
- **Not complete.** It treats facts as independent, so it misses conditions that are impossible only because facts depend on each other, like `crew.alive == 0 and crew.hp(member: kit) > 0`.
- **Proof.** A property test checks the verdicts against trying every value, on 400 random conditions over domains small enough to try them all. Those runs gave all four verdicts: 306 can be either, 52 never true, 39 never false, and 3 never either (an ordering of text against a fact with no domain is always unknown).
- **One fact, two types.** A fact with no domain compared with values of two types can never be false: `x == 1 or x == "p"` always has one unknown test.

## Conditions in records

`condition()` from `@eb/schema` is a field that holds a condition: `when: condition().optional()`.

- **Text or tree** (D31, M2.4, Evan's call). A record file may hold the condition's text, `"when": "hold.count(medkit) >= 2"`, or its tree.
  - Validation parses the text with the game's facts, so a fact's one argument may go unnamed. Text that doesn't parse is E011, with the parser's words and column. Its other problems (E012 to E014), its references in "used by" and the lint's warnings all point at the field, since text has no places inside it.
  - The compiler packs the tree (`packValue`), so the runtime, saves and replays only ever see trees. A project gives the same pack hash whichever form its conditions are written in.
  - The editor keeps the form a field holds and writes text for a new one ([editor-forms.md](editor-forms.md#fields)).
  - **The grammar is now part of the project format.** It can never change in a way that reads old text differently. Its round trip is property-tested (above).
- **The zod schema** takes any text, or a tree with the same shape rules as `checkCondition`; a property test holds the tree's rules together with `checkCondition`'s over a mix of sound and broken conditions.
- **JSON Schema.** The export puts the field once under `$defs["eb-condition"]` (text or `$defs["eb-condition-tree"]`), marked `"x-eb-condition": true`, and points each field at it.
- **`validateRecords(types, records, { facts })`** handles each condition field:
  - It reports `checkCondition`'s issues (E011 to E014) at the field's path plus the issue's path, checking references against the project's records. zod's own E001 issues inside a condition are dropped, so each problem is reported once.
  - Once the shape is sound, it adds the records the condition names to "used by". These are ref arguments, and values compared with ref facts.
  - Once there are no errors at all, it runs the lint (W102 to W104).
- **Without `facts`,** only the shape is checked. The lint still runs, with every fact treated as one with no domain, so `a.x and not a.x` is still W102.
- **Where `facts` comes from.** `compileProject(source, types, { facts })` passes it through. The CLI's `--types` module may export `facts`, usually `factCatalog(modules)`.
- **A union.** A condition inside a union option is found only when the option parses, so a broken tree there gets zod's E001 rather than E011. Text always lets the option parse, so text there gets E011.

## Previews

An effect is declared as a function, or as `{ run, preview }`.

- **What `preview(ctx, effect)` returns:** JSON fields describing what the effect would do now. The kernel sets `effect` to the effect's name, checks the result as JSON and freezes it. An effect without a preview previews as itself, as written.
- **What its context can reach:** `read()`, `fact()`, `check()` and `preview(effect)` for effects inside effects. It has no `write`, `rng` or `emit`, so previewing changes nothing and draws nothing. The depth cap is the same 64 as `apply`.
- **`game.preview(state, effects, sim)`** returns one preview per effect, from that state.
- **Caps.** A preview reads state, so it can show what will really happen. Salvage run's `heal` previews each member's gain capped at their max, and a test holds that preview to the heal itself.

## The roll effect

`logicModule` (id `logic`, an empty slice) registers `roll`:

```json
{ "effect": "roll", "outcomes": [
  { "chance": 70, "text": "Salvage in the hold", "effects": [{ "effect": "loot", "table": "dead-hauler" }] },
  { "chance": 30, "text": "The hull gives way", "effects": [{ "effect": "wound", "hp": 3 }] }
] }
```

- **The table.** `rollTable(effect)` gives each outcome the rolls of 1 to 100 that pick it, in the order written. So 70, 25, 5 is rolls 1–70, 71–95, 96–100. Chances are whole percents, at least 1, adding up to 100; anything else throws. `rollEffect(effect)` in `@eb/schema` stops bad chances when content is built.
- **Running it.**
  1. Exactly one draw, `ctx.rng('roll').int(1, 100)` on the stream `logic/roll`, even when one outcome has all 100. Changing a roll's outcomes then never shifts the rolls after it.
  2. The outcome is the first row whose `to` is at least the roll.
  3. The beat `logic/rolled { roll, outcome, chance }`, with the outcome's index in the list.
  4. The outcome's effects, in order.
- **Its preview.** `{ "effect": "roll", "outcomes": [{ "chance", "text"?, "effects": [previews] }] }`, read from the same table.
- **Exact odds.** `Rng.int` is exactly uniform: it rejects draws past the last whole multiple of the span ([rng.md](rng.md)). Each outcome covers exactly `chance` of the 100 rolls, so its odds are exactly `chance`%. The test plays 3,000 rolls, sees every roll value from 1 to 100, and checks that each outcome is picked on exactly as many of them as its preview shows.

## Proof: salvage run

Salvage run now uses conditions and rolls:

- **Gated choices.** The trader's `sell` needs `hold.count(item: salvage) >= 1`, and the raiders' `pay` needs `hold.credits >= 10`.
- **Rolls.** Boarding a derelict and fighting raiders roll their outcomes.
- **The bot** offers only the choices whose condition holds, through `game.check`, as a menu would.

The tests check that:

- the bot is never refused a choice in 200 runs;
- a locked choice is refused with `locked`, and the state is kept;
- over 100 runs, every roll's chance matches its preview, and every heal matches its preview.

## Open questions

1. **Text in JSON.** Settled in M2.4 (D31, Evan's call): a condition field takes the text form or the tree, and the pack holds the tree ([Conditions in records](#conditions-in-records)).
2. **Flag lint.** rule-or-drool reports flags that are set but never read, or read but never set. That needs effects to say which facts they change, so it waits for kits (M3) or trigger sheets.
3. **Negated wording.** A fact's own `describe` is used for its tests, but `not` of a yes/no test always reads "not …". Facts may want a negative form ("has no medkits").
4. **Witnesses.** The lint could show the values that make a condition true or false, for the editor to explain W102 and W103.
5. **Arguments at runtime.** Content's arguments are checked when the pack is built; `ctx.fact('hold.count')` with no arguments from module code is not checked.
6. **Cost at the cap.** A condition at the cap costs 20 to 30 ms to lint (Readings). A project with thousands of them would take a minute, so the editor may want to cache verdicts by condition hash.
7. **More effects.** `if` (effects by condition) belongs with the logic module, with a preview and a schema helper like `rollEffect`. `schedule` arrived with the time module in M1.7 ([time.md](time.md)).
