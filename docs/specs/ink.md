# Spec: ink scenes

How an ink scene becomes a talk (M3.11, [D49](../decisions.md)). A scene is a file of [ink](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md), the subset chooser-of-the-dead wrote ([research/ink.md](../research/ink.md)). `@eb/ink`, a pure package, compiles it into one record of the dialogue kit's type `talk` ([dialogue.md](dialogue.md)), which the sim plays, the bots walk and saves keep as they do any talk. The compile is the same in the editor and in `eb`. A port must follow this to make the same talk of the same scene.

A scene stays ink that Inky opens: its conditions name the game's facts through EXTERNALs, and its effects are tags, which Inky shows and ignores.

## Files

- **`scenes/<id>.ink`** is the talk `<id>`. The id follows a record's rules: lowercase words joined by hyphens.
- **The dialogue kit must be on** in `project.json`; without it, a scene is E046.
- **A scene and a talk record with one id** are E004, as two records of one type with one id are.
- **A `.ink` file in a folder under `scenes/`,** or one whose name isn't an id, is E046. Any other file there is W131, and ignored.
- **A scene with a problem of its own** (E046, E012, E013) makes no talk, so the talk's checks don't pile on. It is still counted as a talk, so what names it isn't E005 as well.

## The subset

Comments, `//` to the end of a line and `/* … */` across lines, are taken out first, each character made a space, so every line and column stays where it was written. A `\` makes the character after it plain text.

| ink | Read as |
| --- | --- |
| `=== name ===` | a knot. Its name is lowercase words joined by `_` |
| text | a line said, by its speaker tag's speaker, or the narrator |
| `* [what the player says]` | a choice; `**` nests one in the one above |
| `* (label) {cond} {cond} [what the player says # cost: … # needs: …] -> target` | a choice's label, its conditions, its cost and needs, and a divert, each optional |
| `- text`, `- (label)` | a gather at depth 1; `- -` at depth 2 |
| `-> knot`, `-> label`, `-> knot.label`, `-> END`, `-> DONE` | a divert. A bare name is a label in the knot first, then a knot |
| `{ cond: … - else: … }` | a block on several lines: one condition, and an else |
| `{` then `- cond: …` lines, then `}` | a block of several conditions, the first that holds taken, and an else |
| `{ cond: this \| that }` alone on a line | a one-line block. `this` and `that` are text or a divert |
| `{cond: this\|that}` inside text | text that shows `this` when the condition holds, else `that` |
| `EXTERNAL fact_name(arg, …)` | a fact of the game, for conditions ([conditions](#conditions)) |
| `# tag` | a tag ([tags](#tags)) |

Everything else is **E046 at its line,** naming what it is: `VAR`, `CONST`, `LIST`, `INCLUDE`, `~` lines, functions, stitches, threads (`<-`), tunnels (`->->`, `-> x ->`), glue (`<>`), sticky `+` choices, a choice's text outside its brackets (`* Hello`), alternatives and shuffles (`{a|b}`, `{&…}`, `{~…}`), printed variables, a switch on a value, `TODO:` lines, a choice or a gather inside a block, a block not closed with `}`, a divert inside a line's text, and a tag on a choice line outside its brackets.

## Tags

A tag runs from its `#` to the next `#` or the line's end; inside a choice's brackets, to the `]`. A tag on a line of its own belongs to the next line of text, as in ink. Tags are plain text: `{` or `}` in one is E046.

| Tag | Where | Does |
| --- | --- | --- |
| `# speaker: id` | a line of text, or the line before it | who says it: a `speaker` record. Without one, the narrator |
| `# fx: effect` | a line, or a line of its own | an effect ([effects](#effects)): the line's, or, right after a choice, the choice's |
| `# beat` | a line | starts a new line of the talk, though the speaker is the same |
| `# cost: rings 5, bread 2` | inside a choice's brackets | its cost: shown locked while the party is short, paid as it is said |
| `# needs: ink condition` | inside a choice's brackets | its Needs: shown locked, with this in words, while it doesn't hold |
| `# name: The first dusk` | the scene's top, before its first line | the talk's name. Without it, the talk has none, and the editor shows its id |
| `# show-odds` | the scene's top | the talk's Show odds |

Any other tag is E046, since a tag nothing reads is a typo nobody hears of.

## Effects

`# fx: change-standing(faction: hel, by: 3)`: the effect's name, then its fields in brackets, as a condition gives a fact's arguments. An effect with no fields is its name alone.

- **A value** is a whole number (`3`, `-120`), `true` or `false`, a word (`hel`, `sent-healer`), text in double quotes with JSON's escapes (`"A \"quoted\" word"`), `(key: value, …)` for a map or `[value, …]` for a list.
- **The effect is checked as any record's effects are,** against the game's schemas: an unknown effect is E025, a wrong field E001, a record it names that isn't there E005, each at the tag's line.

## Conditions

- **An EXTERNAL names a fact of the game,** its dots and hyphens written as underscores: `EXTERNAL flag_on(flag)` is `flag.on`, `EXTERNAL factions_standing(faction)` is `factions.standing`, `EXTERNAL my_game_ready()` is `my-game.ready`. Its arguments are the fact's, by name, in the order the scene calls them. An EXTERNAL naming no fact is E012; one whose arguments aren't the fact's, all of them, once each, is E013. Two declarations of one name, or a name two facts would both make, are E046.
- **A call of an EXTERNAL** gives each argument as a value: `"word"`, a whole number, `true` or `false`. A call with another count of arguments, or a call of a name no EXTERNAL declares, is E046.
- **A fact said alone** holds when it is true; a number fact, when it isn't 0, as in ink: `flag_number("truth")` is `flag.number(truth) != 0`. Any other fact said alone is E046: compare it with a value.
- **Comparisons** `== != < <= > >=` compare a fact with a value, on either side: `3 <= flag_number("truth")` is `flag.number(truth) >= 3`. A fact compared with another fact is E046 (chooser's one such scene, `d17.night.ink`, needs rewriting).
- **`and`/`&&`, `or`/`||`, `not`/`!` and brackets** are the engine's `and`, `or`, `not` and grouping.
- **E046:** ink's variables and read counts (a bare name), `RANDOM`, arithmetic, lists, `=`, decimals, a value alone.

The talk holds each condition as the engine's text, which the talk's checks read as they read any condition (E011 to E014, W102 to W104).

## How a scene becomes a talk

The scene's flow, its top and then each knot, becomes the talk's lines, in the order written.

- **A line of the talk** is a run of the scene's lines of text said by one speaker, with nothing between them but tags and comments; its text is theirs, joined by a line break, each with runs of spaces made one. A different speaker, a `# beat`, a gather, a block, a choice or a divert starts a new line. Its effects are its tags' `# fx:`, in order, which land as it is shown.
- **The talk has one start,** its first line. A scene with no line and no divert before its first knot is E046: nothing to say.
- **Choices hang on the line before them,** the text the player has just read, when that line is the flow's last and has no condition inside it; otherwise, on a line of their own with no text. Each choice is an option: its words its label; its label `(x)`, if any, its id, else the line's id and its place, `start-6-1`; its conditions, joined by `and`, its If; its `# cost:` and `# needs:`; the `# fx:` lines right after it its effects; and where its body goes, its Then.
- **A choice is once-only within a play,** as in ink. A play comes back to a line only round a loop, so an option is `once` only when its line can lead back to itself; elsewhere it is shown again when the talk is opened again, as chooser played each scene afresh.
- **A line that shows no choice ends the talk,** as ink's story ends there; the gather after the choices is reached only through them.
- **A gather** joins the loose ends of the choices before it: each goes on to the gather's line, or to what follows it.
- **A block** branches the line before it, when that is the flow's last line and has none of its own, or a line of its own with no text, which passes. Each condition is a branch, in order, leading to its body's first line; the else, or what follows the block, is the line's Then. Each body's end goes on to what follows the block.
- **`{cond: this|that}` inside a line** makes a line with no text that passes, holding the line's effects, branching to one variant of the text for each way its conditions can fall: `<id>-1` where all hold, down to `<id>-N` where none does. At most 3 to a line (8 variants); more is E046: split it with `# beat`.
- **Diverts** are Thens. `-> END` and `-> DONE` end the talk. A divert to a name no knot or label has is E046.
- **The flow running out** at the end of a knot is ink's loose end: E046. At the end of the scene's top, the talk ends.
- **Ids:** a knot's first line is its name with `_` made `-` (`the_pass` is `the-pass`); a gather's label is `<knot>-<label>`, or `<label>` at the top; every other line is its knot's name and a number, `hill-2`, `hill-3`, or `start`, `start-2`… at the top. Two lines that would have one id are E046. A line named by a knot or a label keeps its id as the scene changes; other lines' numbers move as lines are added before them in their knot.

## The map

`compileScene` also gives, for each part of the talk, the scene's line it came from, by JSON Pointer: a line, its speaker, its text, each effect, each option and its parts, each branch. A check of the talk at a pointer is given at the line of the nearest part the map has (`lineAt`): `E005 scenes/letter.ink:6 No record speaker:father`.

## Problems

| Code | For |
| --- | --- |
| E046 | ink outside the subset, a tag the engine doesn't read, a flow that runs out, a divert to nothing, ids that clash, a scene misplaced or misnamed, a scene without the dialogue kit, a file that isn't UTF-8 |
| E012 | an EXTERNAL naming no fact of the game |
| E013 | an EXTERNAL whose arguments aren't its fact's |
| W131 | a file under `scenes/` that isn't a scene |

The talk's own checks follow ([dialogue.md](dialogue.md#checks)), each at the scene's line.

## Proof

- **Unit tests** (`packages/ink/src/scene.test.ts`): each construct to its talk, exactly; each error at its line and column; the map.
- **Held to inkle's ink** (`packages/ink/src/inkjs.test.ts`): each scene compiled by inkjs (a dev dependency, never shipped) and played down every way its choices go, under several states, and its talk played the same way: the same lines by the same speakers, the same effects in order, the same choices offered at each turn. The gatehouse's scenes are among them.
- **The gatehouse fixture** (`tools/cli/test/fixtures/gatehouse`), a slice of Chooser of the Slain written fresh: three dusk scenes, a sheet opening them, the halls' standing and rings. `eb validate` checks it clean, `eb sim` plays it to its golden runs, and a test over 30 seeds reaches every line and says every option, each shown open.
- **A reading** over chooser's 61 scenes: 60 compile, and 460 ways through them play as inkjs plays them ([research/ink.md](../research/ink.md#readings)).

## Open questions

1. **Comparing two facts,** which chooser's `d17.night.ink` does. The engine's conditions compare a fact with a value.
2. **Sticky choices and stitches,** left out of the subset (D49): sticky `+` choices would be options without `once`; stitches, knots within knots.
3. **Ids that move:** a line's number changes as lines are added before it in its knot, so a saved game open at such a line, or a condition naming it, can point elsewhere after an edit. A label on the line keeps it.
4. **Passages:** a run of lines that only go on could be shown at once, as chooser did, which is the stage's (Phase 4).
