# Research: dialogue in the earlier games

What the games before the engine did for talk (M3.8, [D46](../decisions.md)). Paths are each repo's under `rcjlabs/`; the repos were read, never run. Only one used ink; the rest wrote trees, cards or closures.

## ink: chooser-of-the-dead

- **Where:** 61 scenes, `content/packs/*/scenes/*.ink`, one scene to a file. The player is `packages/story/src/index.ts`, the compiler and lint `packages/content-compiler/src/scenes.ts`, the screens `packages/ui/src/campaign/screens.tsx`.
- **inkjs 2.4.0,** compiled at build time in Node (`inkjs/full`'s `Compiler`) and shipped as JSON. The browser only runs `Story`: "the Ink runtime, 40.8 KB, load when the campaign is opened".
- **A stateless player:** `playScene(json, env, choices)` plays a scene from its start through the choices made, with a fixed seed and a snapshot of the run, so the same choices give the same lines and effects. The run keeps only the choice indices. "A scene restarts if the page reloads mid-scene."
- **Externals:** `flag`, `standing`, `rings`, `day`, `home`, `sick`, `word`, `wrong`, bound as read-only views; any other is an error, and `INCLUDE` is refused.
- **What it used of ink:** knots, conditional diverts (`{ not home("brother"): -> without_ulf }`), `{ rings() >= 5: … }` blocks and choices. No `VAR`, `~`, sequences or `RANDOM` anywhere: "Nothing about Ink persists across scenes".
- **Tags:** `# fx:` for its effects (rings, standing, flags, family, sun), applied once at the scene's end; `# speaker: id`; `#needs: rings N` inside a choice's brackets, shown greyed out rather than hidden; `# beat`; `# draft`.
- **The lint** fails on ink's errors and warnings, fx tags on a choice line, missing speakers and scenes no day plays. `walkScene` walks every choice path (to 500) in three sample runs: "Not a proof over all runs".
- **What went wrong:** fx tags on a choice line, which ink gives to the choice and which then never fire; "Ink gives a tag written under a line to the next line"; the spec saying six externals while the code had eight.

## Trees and cards as data

- **dirtbag** (`app/src/sim/content/people.ts`): `TalkDef { who, start[{ when, node }], nodes }`. The first start whose condition holds picks the opening node; a node is `{ text, opts, calls? }`, an option `{ label, primary?, when?, fx?, next? }`, and one without `next` ends the talk. Effects land on each pick, through the sim's `say`, including `seen`, "said once and for good". Conditions are a closed list of about 60 keys (`sim/cond.ts`). The open talk is the UI's, lost on reload. A test checks every `next` and finds unreachable nodes.
- **rule-or-drool** (`src/content/cards/**`): JSON cards with a speaker role, text and a condition, two choices each with effects, flags, a card sent for later, `next`, an ending. Its validator (`src/validate/rules.ts`) has `card-unreachable`, `arc-no-exit`, `arc-cycle`, `ending-unreachable`, `flag-unread` and `speaker-unknown`: "Twenty-seven shipped cards were in exactly that state", never drawable.
- **sandbagged** (`src/engine.ts`): talks chained one exchange at a time, each `{ who, act, after?, text, replies[{ label, text, outcome? }] }`. Its tests read "every conversation is reachable" and "the conversations are a thread you can read back". A gate on a single page "deadlocked the story… `marge4` through `marge8` fired in 0.0%".
- **landnam** (`src/data/eventCards.ts`): cards with conditions, `once`, a weight, and choices with a check and success or failure outcomes. The open card is saved. "A card that can never be drawn" is found by its balance harness.
- **space-wrecked** (`data/events.json`): one-step cards, no speakers; choices with needs and chance-weighted outcomes.
- **spliceworld:** barks only, in slots per rival, rotated from a seeded offset. "dissectionTaunt sat in rivals.json for three sessions with no caller".
- **2060td:** linear radio briefings, one line every 350 ms, the speaker written into the text.

## Closures

- **ludus** (`src/ludus.jsx`) and **wasteland-protocol** (`game.js`) wrote talk as functions: `need(d, g)`, `say(d, g)`, `execute`. Neither can be linted without running it or saved except by key or title. Ludus found "a woman was offered 'Tell him no'" and an ask with "0 ASKS IN 2,402 PLAYED WEEKS".

## What they share

- The engine applies effects; content never runs free code.
- Conditions are a closed vocabulary over one state that saves.
- Choices are buttons. Nothing types its text out letter by letter.
- Once-only lines and options are kept as what has been seen or said.
- The commonest failure was content nothing could reach, found late, usually by measuring.

## Where they differ

- **ink or trees:** only chooser used ink, and only a subset of it, with no ink state of its own. Trees of more than one exchange were chooser's and dirtbag's; the rest wrote single exchanges, chains or barks.
- **When effects land:** at the scene's end in chooser; on each pick in dirtbag, sandbagged, rule-or-drool and ludus.
- **Saving mid-talk:** chooser restarts the scene; dirtbag and sandbagged lose the open talk; landnam, space-wrecked, ludus and wasteland-protocol save the open card.
