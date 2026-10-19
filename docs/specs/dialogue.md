# Spec: the dialogue kit

This is how the dialogue kit works (M3.8, [D46](../decisions.md)): speakers, and talks of lines and options, each option an event's choice that leads to another line. It is a kit as [kits.md](kits.md) has them: switched on in `project.json`, a pure module in `packages/kits/src/dialogue/`, its types, effect schemas and checks in `@eb/schema`. A port must follow it to open, say and roll the same things from the same seed.

It follows the games that came before ([research/dialogue.md](../research/dialogue.md)):

- **Dirtbag's talks** (`sim/content/people.ts`): `TalkDef { who, start, nodes }`, the first start whose condition holds picking the opening node, each option with a condition, effects and a next node, one with none ending the talk, and options said once and for good.
- **The events kit** ([events.md](events.md)): each option is a choice, shown under its If, locked by its Needs or a cost the party can't pay, with outcomes rolled by whole-percent chances. Locks, costs and odds read the same in a talk as in an event.
- **Landnam's checks:** an outcome leads to a line of its own, so success and failure go on differently.
- **Rule-or-Drool's and Sandbagged's validators:** a line nothing reaches, and a talk nothing opens, are found before a player has to.

ink scenes (M3.10) compile into these same talks.

## Switching it on

```json
{ "format": 1, "id": "crag", "name": "The crag", "version": "0.1.0", "kits": ["inventory", "economy", "dialogue"] }
```

- **The kit** is `dialogue`. It needs no other kit.
- Everything [kits.md](kits.md#switching-kits-on) says of a kit holds for it: E033, E034, the types, facts, events and effects, the module's place in a game, format 3 packs.
- **With the economy kit on,** an option's cost is paid in its resources. Without it nothing charges one (W119).

## Numbers

Whole numbers throughout, as in [kits.md](kits.md#numbers). A chance is a whole percent, and an option's chances add up to 100.

## Records

### speaker

Who says a line. `records/speaker/<id>.json`:

| Field | Means |
| --- | --- |
| `name` | what the player reads beside the line: "Marge". Required |
| `portrait` | an image from Assets, shown with the line |

### talk

One conversation, start to end. `records/talk/<id>.json`:

| Field | Means |
| --- | --- |
| `name` | its title in the editor: "Marge at the crag" |
| `speaker` | who says its lines, unless a line names another |
| `show-odds` | true: each option shows its outcomes, their chances and what they do before it is said. Hidden when left out (D45) |
| `starts` | `[{ "if": "...", "line": "again" }, { "line": "hello" }]`, at least one: the first whose `if` holds opens the talk at its line |
| `lines` | at least one, in the order written |

Each line:

| Field | Means |
| --- | --- |
| `id` | what options, starts and conditions call it: lowercase words joined by hyphens, once in the talk. Required |
| `speaker` | who says it, when not the talk's speaker |
| `text` | what is said. Required |
| `effects` | what hearing it does, in order, as it is shown |
| `options` | what the player can say back, in the order shown |
| `next` | the line the talk goes on to when no option is shown. The talk ends when there is none |

Each option is an event's choice ([events.md](events.md#event)) without `result`, plus two fields:

| Field | Means |
| --- | --- |
| `id`, `label`, `if`, `needs`, `cost`, `effects`, `outcomes` | as a choice's. An option's `id` is once in the talk, not only in its line, so a condition names it with the talk alone |
| `once` | true: hidden once it has been said |
| `next` | the line it leads to. The talk ends when there is none |

An outcome has `chance` and `effects` as a choice's, and `next`, a line it leads to instead of the option's.

## State

```json
{
  "open": { "talk": "marge", "line": "again" },
  "waiting": ["ranger"],
  "talked": { "marge": 2 },
  "heard": { "marge": { "hello": 1, "again": 3 } },
  "said": { "marge": ["first", "gas"] }
}
```

- **`open`** is the talk open now and the line it is at, left out when none is. **`waiting`** are the talks opened while it was, to open in turn.
- **`talked`** counts how many times each talk has opened. **`heard`** counts how many times each line has been shown. **`said`** holds each option ever said in a talk, sorted.

## Talking

An open talk puts the game in the mode `talking`, whose data is `{ "talk": "marge" }`. The line it is at is the slice's, so the mode isn't touched as the talk goes on. Its actions are `dialogue/say` and `dialogue/go-on`.

### Opening

`open-talk` opens a talk, or puts it last among those waiting while another is open. Opening:

1. the first start whose `if` holds gives the line. When none holds, nothing opens and `nothing-to-say` is raised;
2. the mode `talking` goes on, `talked` is counted, and `opened` is raised;
3. the line is shown ([showing a line](#showing-a-line)).

### Showing a line

`open` moves to the line, its `heard` is counted, `heard` is raised, and its `effects` apply, in order. A mode they open, such as a shop or an event, comes before the talk goes on, as it sits over the mode `talking`.

### What a line shows

`game.preview(state, [{ "effect": "open-talk", "talk": id }], sim)` gives what the talk shows now: its line and options, from the same verdict saying makes, so what is shown open is what can be said ([CLAUDE.md](../../CLAUDE.md)'s odds rule). For the open talk, that is the line it is at; for another, the line its starts would open it at.

```json
{
  "effect": "open-talk",
  "talk": "marge",
  "line": "again",
  "speaker": "marge",
  "text": "What are we doing today?",
  "options": [
    { "id": "gas", "label": "Chip in for gas", "cost": { "cash": 10 }, "open": false, "short": { "resource": "cash", "have": 4, "need": 10 } },
    { "id": "beta", "label": "Any beta for the arete?", "open": true },
    { "id": "bye", "label": "See you around.", "open": true }
  ]
}
```

- **Options** are shown as an event's choices are ([events.md](events.md#what-each-choice-shows)): left out while their `if` doesn't hold, and left out once said when `once`; `open`, `needs`, `short` and `cost` as a choice's; `effects` and `outcomes` only with `show-odds`.
- **`go-on`** is there when no option is shown: `"next"` when the talk goes on to the line's `next`, `"end"` when it ends. The stage shows Continue, or Close.
- A talk none of whose starts holds shows `{ "effect": "open-talk", "talk": "marge" }` alone.

### Saying

`dialogue/say` `{ option }`, offered for each option the view has open, in the line's order. It is refused with:

- `not-talking`: no talk is open in the mode `talking`;
- `no-such-option`: the line has no such option, its `if` doesn't hold, or it is `once` and said;
- `locked`: its `needs` doesn't hold;
- `cant-afford`, with `resource`, `have` and `need`.

Saying, in this order:

1. its cost is paid, with pay-cost;
2. it is kept in `said`, and `said` is raised;
3. with `outcomes`, one is rolled: one draw of `int(1, 100)` from the kit's stream `dialogue/outcome`, the outcome the first whose running total of chances reaches it (`rollTable`, as the `roll` effect's), and `rolled` is raised;
4. the line it leads to is the outcome's `next`, else the option's. With none, the talk ends now ([ending](#ending)), before what follows, so a mode or a talk its effects open comes next;
5. its `effects` apply, in order, then the outcome's;
6. with a line to lead to, that line is shown.

The outcome is rolled before the effects, unlike an event's, because the line it leads to decides whether the talk ends before them. An effect that refuses refuses the saying: nothing it did is kept, and the talk stays at its line.

### Going on

`dialogue/go-on` `{}`, offered when the line shows no option. It goes to the line's `next`, showing it, or ends the talk when there is none. It is refused with `not-talking`, or `has-options` while an option is shown.

### Ending

The mode `talking` comes off, `open` goes, and `ended` is raised. Then the first talk waiting opens; one none of whose starts holds raises `nothing-to-say`, and the next waiting is tried.

A game made only of talks can start in the mode `talking`, a module's `start` opening its first ([sim.md](sim.md#modules)). Once no talk is open or waiting, nothing is offered, and the game is over.

## Effects

| Effect | Does | Preview |
| --- | --- | --- |
| `{ "effect": "open-talk", "talk": "marge" }` | Opens it ([opening](#opening)). While another is open, it waits its turn | [what a line shows](#what-a-line-shows) |

## Facts

| Fact | Domain | In words |
| --- | --- | --- |
| `dialogue.open` | ref to a talk: the open one; no value when none is | "the open talk is marge" |
| `dialogue.talked(talk)` | int from 0: times it has opened | "the times marge has been talked to is at least 2" |
| `dialogue.heard(talk, line)` | int from 0: times the line has been shown | "the times beta has been heard in marge is at least 1" |
| `dialogue.said(talk, option)` | bool: said at least once | "gas was said to marge" |

A line or an option its talk doesn't have, named in `dialogue.heard` or `dialogue.said`, throws; validation stops it in content (E042).

## Events

| Event | Arguments |
| --- | --- |
| `dialogue/opened` | `talk`, `line`: the line it opened at |
| `dialogue/heard` | `talk`, `line` |
| `dialogue/said` | `talk`, `line`, `option` |
| `dialogue/rolled` | `talk`, `option`, `outcome` (its place in the list, from 0), `roll` (1 to 100) |
| `dialogue/ended` | `talk` |
| `dialogue/nothing-to-say` | `talk` |

## Checks

- **E035** (a kit's record that doesn't hold together), in a talk: a line id twice, or one a condition can't write; an option id twice in the talk, or one a condition can't write; a start's `line`, or a `next` of a line, an option or an outcome, naming no line of the talk; outcomes whose chances don't add up to 100.
- **E042:** a condition naming a line or option a talk doesn't have, in `dialogue.heard(talk: …, line: …)` or `dialogue.said(talk: …, option: …)`.
- **W119:** a cost in a game without the economy kit: nothing charges it.
- **W121:** a line no start, option, outcome or line leads to: nothing can show it.
- **W122:** a line with options none of which is free of `if`, `needs` and `cost`: a party that can't meet any of them is stuck there, as W118 warns of an event.
- **W123:** a talk nothing in the records opens: no row, choice, line, consequence or outcome has an `open-talk` naming it. One a game's scripts open is still warned of, as a flag only scripts read is (W108).

## The map

The editor draws each talk as a map above its form ([editor-kits.md](editor-kits.md#the-dialogue-kit-m38)): a box for each line, in rows by how many steps it is from a start, and an arrow for each option, outcome and `next`. A line nothing reaches is drawn below the rest, marked. Tapping a box opens its line's form. The layout is a plain function of the talk, so it is tested without a browser.

## Proof

- **Unit tests** (`packages/kits/src/dialogue/`, with the crag game in `packages/kits/test/crag.ts`): starts by condition, and nothing to say; the view equal to saying's verdicts, in every lock, with `once` and `show-odds`; costs paid once; outcomes rolled by the table and leading to their own lines; going on and ending; a talk ending before its option's effects, and a mode they open coming before the talk goes on; talks waiting their turn; the facts; a game that starts in the mode `talking`.
- **Schema tests:** every E035 rule; E042; W119, W121, W122 and W123.
- **The crag fixture** (`tools/cli/test/fixtures/crag`), a slice of Dirtbag: a partner at the crag whose beta comes with a bond, gas money that costs, a send that is rolled, and a ranger checking permits. Its golden runs, and a test over 30 seeds' runs that every line of both talks is heard and every option said open in the view at that state.

## Open questions

1. **Text filled in from state** (Dirtbag's `{name}`), for lines and events alike, which waits on Phase 4's string tables.
2. **Barks:** single lines picked from a pool without repeating soon (Spliceworld's monologues, Dirtbag's crowd). A deck of lines would do it.
3. **A line's id in the form** is typed, and a mistyped `next` is E035 at its box. A picker of the talk's lines would save the typing.
4. **Typed text** (2060td's line every 350 ms) is the stage's, in Phase 4.
