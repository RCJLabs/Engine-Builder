# Research: chooser-of-the-dead's ink

What chooser-of-the-dead's scenes use of ink, how its tools read them, and what that leaves for the engine to read (M3.11, [D49](../decisions.md)). It builds on [dialogue.md](dialogue.md), M3.8's survey, and leaves out what that says. Paths are under `rcjlabs/chooser-of-the-dead/`; the repo was read, never run. Its scenes' text is RCJLabs's, all rights reserved (`CONTENT-LICENSE.md`), so none of it is copied into this repo: the engine's fixture scenes are written fresh. "My reading" marks a gap seen in the code that no note of the repo's records.

## The scenes

- **61 files**, 2,055 lines: 55 under `content/packs/campaign/scenes/`, 6 under `content/packs/demo/scenes/`. Each is one scene a day plays (`d14.night.ink`), a visit at the desk (`d15.desk.ink`), an origin's (`o.shieldmaiden.3.ink`) or a letter (`e.steinar.answer.ink`).
- **Written for one play each.** A day plays its scenes once, from the start, statelessly: `playScene` makes a new `Story` and replays the choices made so far (`packages/story/src/index.ts:177-226`). Nothing of a scene's own state is kept between plays.
- **Shown as passages.** The player reads every line up to the next choice at once, each with its speaker, then picks; the picked option's text is echoed as a line (`index.ts:195-224`).

## What they use

| Construct | How much | Notes |
| --- | --- | --- |
| Knots | 33 | no stitches |
| `* [text]` choices | 183 | all once-only, all bracketed; 2 nested `**` (`d9.night.ink:33-37`) |
| Gathers | 76 | all at depth 1; 2 labelled `- (choose)`, which a choice diverts back to (`d10.night.ink:43`, `d15.night.ink:49`) |
| Diverts | to knots, labels and `END` | none to `DONE`, none with arguments |
| Conditional choices `* {cond} [..]` | 22 | |
| Block conditionals | 108 | `{ cond: … - else: … }` and `{ - cond: … - cond: … - else: … }`, nested 2 deep, holding lines of several speakers, effect tags and diverts; never a choice or a gather |
| One-line conditionals | a few | `{ sick("sister"): -> healer }` after a gather; `{ flag("x"): text }` as a whole line |
| `{cond: a|b}` inside a line | 5 lines, 1 each | `d12.night.ink:37,39`, `o.shieldmaiden.3.ink:16,18` |
| EXTERNALs | 8 | `flag(name)`, `home(id)`, `sick(id)`, `rings()`, `standing(faction)`, `day()`, `word()`, `wrong()`, each read in conditions only |
| Operators | `not`, `&&`, `||`, brackets, `== >= <= < >`, negative numbers | one comparison of two facts: `flag("letters_honest") > flag("letters_kind")` (`d17.night.ink:31,34`) |
| Tags | `# speaker: id` 383, `# fx:` 179, `# draft` 55, `# beat` 9, `#needs:` 9 | |
| Comments | `//` whole lines | |

**Not used:** sticky `+` choices, stitches, tunnels, threads, glue, alternatives and shuffles, `VAR`, `CONST`, `~` logic, functions, `LIST`, `INCLUDE`, read counts, `RANDOM`, fallback choices.

## The tags

- **`# speaker: id`** at a line's end names who says it; a line without one is the narrator's. Each id needs a `speaker.<id>` string (`packages/content-compiler/src/scenes.ts:166-169`).
- **`# fx:`** on a line of its own changes the run. Its grammar (`packages/story/src/index.ts:120-155`): `rings ±N`; `standing <faction> ±N`; `flag x`, `flag x ±N`, `flag x = N`; `family <id> <sick|well|gone>`; `sun ±s`.
- **`#needs: rings N`** inside a choice's brackets shows the choice locked while the run has fewer rings; the choice's own `# fx: rings -N` pays (`d11.night.ink:51-53`).
- **`# beat`** starts a new part of the scene, so the effects before it go with the line before it (`index.ts:197-200`).
- **`# draft`** at the top marks writing to be replaced.

## How chooser read them

- **The compiler** (`packages/content-compiler/src/scenes.ts`) checks with regexes first: a scene is one file; each EXTERNAL is one the game binds; an fx tag is plain text that parses; an fx tag on a choice line is refused, since ink gives it to the choice, where it never fires; a needs tag sits inside the brackets; a choice is `* [its whole text]`, what follows on the next line. Then inkjs 2.4.0's full `Compiler` compiles it, and any error **or warning** fails the build.
- **The walk** (`lintScenes`, `scenes.ts:160-233`) plays every path of each scene, up to 500, under three sample runs: a fresh start, a run gone badly (every flag set, in debt, everyone sick) and one gone well. It fails a path that errors, and a choice point where every option needs more rings than the run has. "Not a proof over all runs."
- **Effects land late.** The player gathers a frame's effects and applies them with its last line, or at a `# beat` (`index.ts:186-200`); the walk sums them per path.
- **A parser of its own,** `tools/story-script/parse.ts`, already reads this subset by hand for a review tool, so the subset has been read without inkjs once before.

## What went wrong

- **Tags that never fire.** A tag on a choice line goes to the choice, not the output (`scenes.ts:59-62`), so an effect written there did nothing until the compiler refused it.
- **A tag goes to the line after it.** A `# fx:` on its own line attaches to the next line of text, so the player has to gather tags since the last choice, not read them line by line (`index.ts:186-188`).
- **Locked choices with no way out.** A choice point whose every option needs rings the run hasn't got holds the player; only the walk's sample runs find it.
- **My reading:** a scene that compares two flags (`d17.night.ink:31,34`) depends on both being numbers; the walk's sample runs set every flag to the same value, so neither branch of that comparison is ever taken in the lint.

## What the engine had already

- **Talks** (M3.8): lines, each with a speaker, text, effects and options, options with If, Needs, Cost, effects and outcomes, starts chosen by condition. A talk is one record, played by the dialogue kit in the sim, saved half way.
- **Facts and conditions** with a text form, a check, a lint (W102 to W104) and a satisfiability test (`sat.ts`), which a walk of a talk's ways can use.
- **Effects** as JSON, checked by their schemas.
- **What talks lacked for ink:** a way to branch on a condition between lines, which ink's conditional blocks do everywhere, and a line that only branches, which a block at a knot's start or after a gather is.

## Readings

| Reading | Instrument | Date | N |
| --- | --- | --- | --- |
| 60 of 61 scenes compile with `@eb/ink`, their tags translated to the engine's (fx to effects, `#needs: rings N` to `# cost: rings N`, `# draft` dropped) and their EXTERNALs renamed; 862 talk lines. The one that doesn't compares two facts (`d17.night.ink`) | a local, uncommitted test over the repo's files | 2026-10-19 | 61 scenes |
| Every way through those 60 scenes under chooser's three sample runs, played by inkjs 2.4.0 and by the compiled talks: 460 ways, none differ in the lines said, their speakers, the effects in order or the choices offered | the same harness as `packages/ink/src/inkjs.test.ts`, run locally | 2026-10-19 | 460 ways |

## Open questions

1. **Comparing two facts,** as `d17.night.ink` does, which the engine's conditions can't say. A number flag set by both effects (`letters-lean`) would, or conditions that compare facts.
2. **Passages.** chooser showed a frame's lines at once; a talk shows a line at a time, Continue between speakers. The stage (Phase 4) can show a run of lines that only go on as one passage.
3. **`# draft`,** a scene's state of writing, which the engine has no place for. A field on talks, shown in the Records table, would hold it.
