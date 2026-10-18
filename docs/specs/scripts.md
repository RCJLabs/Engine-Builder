# Spec: scripts

M3.2's game code in a project (D38): TypeScript files under `scripts/`, checked as the compiler reads a project, packed for the runtime, and run by `eb` and the editor's script worker as `eb sim --game` runs a module. The code is `packages/script` (checks, the loader, the `eb` module, the game and its catalogue), `packages/purity` (the purity rules, shared with `tools/lint-boundaries`), `packages/compiler/src/scripts.ts` and `projectGame.ts`, and `tools/cli`. The editor's side is [editor-scripts.md](editor-scripts.md).

## Files

- **A script is `scripts/<id>.ts`**, its id kebab-case as a record's is (at most 64 characters). `scripts/game.ts` is the game.
- **Anything else under `scripts/`** is passed over with W111: notes, JSON, and `.d.ts` files for VS Code. A `.ts` file in a folder under `scripts/`, or whose name is no id, is E030.
- **A script imports `"eb"` and other scripts** (`"./hold"` or `"./hold.ts"`), nothing else: E030 names the import. Type imports are erased (`import type { Module } from 'eb'`).

## Checks without running

Each script is read as the compiler reads a project, and nothing is run:

| Code | What |
| --- | --- |
| E028 | It doesn't parse as TypeScript (sucrase's message, line and column), or isn't UTF-8 text |
| E029 | It breaks a purity rule: the rules `tools/lint-boundaries` holds the sim to, read from the same `packages/purity`. Since M3.2 they also refuse `eval`, `Function` and `import()`, code made at run time that no rule has read |
| E030 | It imports something other than `"eb"` and other scripts, or is misplaced or misnamed |
| W111 | A file under `scripts/` the compiler ignores |
| W112 | A script `scripts/game.ts` doesn't reach, directly or through another, so the game never runs it. Without a game.ts, every script gets it |

**The rules are a check, not a wall.** They read the source's text, so code that wants to can reach past them (`[].constructor.constructor`, for one). They keep honest sim code honest; what stops a stranger's script is the trust question (D38, [editor-scripts.md](editor-scripts.md#trust)).

## The game

`scripts/game.ts` exports the game as `eb sim --game` reads a module:

- `modules`: modules made by `defineModule`, in order. The engine's own (logic, flag, sheet) join first unless the game lists one itself, which places it there, so a project's flags and sheets work whatever its game lists;
- `start`: the mode a new game starts in;
- `policies`, if any: bots, such as `weightedPolicy('greedy', { 'hold/loot': 3 })`;
- `metrics`, if any: fact ids, or `{ fact, args, label }`, for the sim's report.

What goes wrong when it runs is one problem:

| Code | What |
| --- | --- |
| E031 | A script throws as it loads ("It threw as it loaded: …", at the script and line where it can be said), or `createGame` refuses the game it makes. The editor adds one that never finishes loading |
| E032 | game.ts doesn't export what a game needs: which export, and what it should be |

## Running

- **The loader** is CommonJS: each script's JavaScript (sucrase's, which keeps line numbers) runs in a `new Function` of its own with a `require` that gives `"eb"` and the other scripts, each once. A script imported while it is still running gets what it has exported so far, as Node's `require` gives. Each body carries `//# sourceURL=scripts/<id>.ts`, so an error's stack names the script; the lines `new Function` puts above a body (two in V8) are measured once, not assumed.
- **`"eb"`** is the sim's API and nothing that reaches the host: `defineModule`, `engineModules`, `logicModule`, `flagModule`, `sheetModule`, `timeModule`, `randomPolicy`, `weightedPolicy`, `rulePolicy`, `turnFor`, `isRecordId`, `parseRef`, `formatRef`, `calendarOf`, `dateAt`, `ticksOf`. Each is the engine's own, frozen. A name added is a promise to scripts, and a test holds the list.
- **The catalogue.** A game that loads is described as plain data: its modules, start mode, facts (arguments, values, label), events, effect names, actions and bots. It crosses from the editor's worker to the page, so nothing in it is a function.
- **Who runs scripts.** `compileProject` never does. `projectGame` and `compileWithGame` in the compiler do, for a caller that chose to: `eb`, asked to check or play the project, and the editor's script worker once the project is trusted. A script that never returns hangs `eb`, as a `--game` module's would; the editor stops its worker from outside.

## Content checked against the game

Once game.ts loads, a project's content is checked against what it declares and nothing else, as `--types` does (D36): its facts in conditions, its events in rows (E022, E023), and the effects its modules handle (E025). The engine's effects among them keep their schemas; the game's own are kept as written, since a module says what it handles, not what its arguments are. Without a game.ts, or until it has run, names the engine doesn't know are taken as written.

## Packs

- **Format 2** carries the scripts game.ts reaches, as JavaScript by id: `"scripts": { "game": "…", "hold": "…" }`, inside the hash. Scripts with errors pack nothing, since the pack is only written without errors.
- **A pack without scripts stays format 1**, so its hash, and an older engine reading it, are unchanged: every fixture's golden hash still holds.
- `readPack` reads formats 1 and 2. A newer one says to update the engine; a format 2 pack must carry at least one script, each a valid id with text.

## eb

- **`eb validate` and `eb build`** with no `--types` run the project's game.ts and check content against it. Its E031 or E032 is an error like any other, so `eb build` writes no pack.
- **`eb sim`** with no `--game` plays the project's own game, with its bots and metrics. It plays nothing while the project has errors, and needs `--game` for a project without game.ts.

## Checks

- **Unit:** `packages/script` (the checks, the loader with cycles and lines, `"eb"`, the API list completion offers, game.ts's shape and the catalogue); `packages/compiler/src/scripts.test.ts` (files placed and named, reach, format 2); `packages/core/src/pack.test.ts` (formats 1 and 2); `packages/schema/src/sheets.test.ts` (effects by name); `tools/lint-boundaries/test` (the rules, a planted `eval` and `new Function` among the bad fixtures); `tools/cli/test/scripts.test.ts` (the hold fixture validated, built and played with no `--types` or `--game`).
- **The hold fixture**, `tools/cli/test/fixtures/hold`: a game written as two scripts, with a flag and a sheet whose rows read the game's event, fact and effect.

## Open questions

1. **Types as you type.** Type errors come from `eb validate`'s parse and from VS Code, not the editor (D38): TypeScript in the browser costs 1.64 MB gzipped. TypeScript 7's JavaScript API, expected with 7.1, may change that.
2. **A sandbox.** A trusted script runs in the editor's origin, with the worker's network and storage taken away first; a separate origin with no storage would hold even a script written to escape. Mods (Phase 9) need it; Evan chose asking first for now (D38).
3. **Scripts in a game's runtime.** The pack carries them; Phase 4's runtime will load them as `eb` does, in a worker or on the page.
4. **Engines other than V8.** The loader measures `new Function`'s header rather than assuming V8's, but a throw's line has been seen right only in Node and Chromium.
