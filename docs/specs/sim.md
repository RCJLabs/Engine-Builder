# Spec: the sim kernel

This is what `reduce` does, exactly, in `packages/core/src/sim/`. Every module follows these rules, and a port to another language must follow them to reproduce a game's states and draws.

It follows the patterns that survived in three of the existing games:

- **chooser-of-the-dead:** its `stepRun` returns state plus events, and answers a wrong-phase action with a rejected event.
- **landnam:** a mode stack in which each mode allows a set of actions, and beats that carry data, not prose.
- **spliceworld:** a renderer that replays a stream of events.

## State

```json
{
  "kernel": {
    "seed": "run-1",
    "step": 12,
    "modes": [{ "id": "travel" }, { "id": "encounter", "data": { "event": "derelict" } }],
    "streams": { "crew/wound": { "seed": "run-1\u001fcrew/wound", "s": [1, 2, 3, 4] } },
    "versions": { "crew": 1, "hold": 1 }
  },
  "crew": { "members": { "rook": { "hp": 5, "max": 7 } } },
  "hold": { "credits": 20, "items": {} }
}
```

- **The kernel's own state** is under `kernel`, and each module's slice is under its id. `readFacets` therefore gives one facet per module, plus the kernel.
- **Everything is JSON**, by canonicalJson's rules ([state-hash.md](state-hash.md)): finite numbers, plain objects, dense arrays, no cycles. `undefined` is allowed only as an object property, which a save leaves out.
- **States are frozen.**
  - `init` and `reduce` return deep-frozen states.
  - A state read back from a save is checked, brought up to date and frozen by `game.migrate` ([saves.md](saves.md)). Any other state is checked and frozen by the first `reduce` that receives it.
  - Mutating a state throws.
- **No content in state.** Records stay in the content pack and are read through `sim.content`. State holds what changed, so a content update reaches existing games.

## Modules

`defineModule({ id, init, start, actions, facts, effects, modes, events, on, made, version, migrate })`:

- **Names.** The `id` is kebab-case, unique, and not `kernel`. Every other name is kebab-case too.
- **`init(ctx)`** returns the module's first slice. Its `ctx` has `content` and `rng(name)`. Modules start in the order the game lists them.
- **`start(ctx)`** (M3.6), if given, runs once as a new game begins, after every module's `init`, in module order, with a handler's context: it applies effects, raises events that listeners hear, and makes attempts, as an action's work does. Its draws are kept, its beats dropped, and the state stays at step 0. A refusal there throws: a game can't refuse to begin. A module a migration adds to a save starts with `init` alone. The roster kit gives the members who start on it their ranks' statuses this way.
- **Registered names:**

  | What | Registered as | Unique within |
  | --- | --- | --- |
  | actions | `"id/verb"` | the module |
  | facts | `"id.name"` | the module |
  | effects | the bare name, because content names them (`{ "effect": "loot" }`) | the game |
  | modes | the bare id | the game |
  | events | `"id/name"` | the module |

- **Who changes what.** A module changes only its own slice. It reads other modules through their facts and changes them through their effects, so kits combine without knowing each other's insides.
- **Actions** are a handler `(ctx, action) => void`, or `{ run, options? }`, whose options a bot or a menu can offer ([Options](#options)).
- **Facts** are a function `(view, args) => value`, or `{ read, args?, domain?, label?, describe? }` for conditions to check, lint and word ([conditions.md](conditions.md)). A fact with a domain must answer one of its values, or `undefined`/`null` for none; the kernel throws on any other answer, wherever the fact is read.
- **Effects** are a function `(ctx, effect) => void`, or `{ run, preview? }`. A preview says what the effect would do now, without doing it.
- **Events** are the beats content may react to, each with its arguments, and **listeners** (`on`) are what a module does when one is raised: by event id, or `"*"` for every event it has no entry for (M3.1, [triggers.md](triggers.md)).
- **Made records** (`made`) are records the module makes in play, which every module reads beside the pack's ([Made records](#made-records)).
- **Versions.** `version` (default 1) is the shape of the slice, recorded in `kernel.versions`. `migrate` turns an older slice into the current one, so old saves keep loading ([saves.md](saves.md#module-versions-and-migrations)).

`createGame({ modules, start })` checks every name. It throws on:

- a duplicate or an invalid name;
- an unknown start mode, or a mode pattern that matches no action;
- a fact id a condition can't write (a module id that starts with a digit);
- a fact argument or domain that is malformed ([conditions.md](conditions.md));
- a module version below 1, or a gap in its migrations ([saves.md](saves.md));
- an action spec without a `run` function, or with `options` that isn't a function;
- an event declared with a malformed argument or label, or a listener for an event no module declares ([triggers.md](triggers.md)).

## Modes

The kernel keeps a stack of modes, `kernel.modes`. It is never empty, and its bottom frame is the start mode.

- **Allowed actions.** Each mode lists the actions it allows:
  - `"crew/rest"` allows one action;
  - `"crew/*"` allows every action of the crew module (not `crewmate/…`);
  - `"*"` allows all actions.

  Patterns are expanded when the game is made, and a pattern that matches nothing is an error.
- **Changing modes.** Handlers call `ctx.modes.push(id, data?)`, `pop()` or `replace(id, data?)`. Popping the last frame throws, and so does pushing an unregistered mode.
- **The mode beat.** Each change adds the beat `{ "type": "mode", "modes": [ids, bottom first] }`.

## Options

`options(view)` on an action returns the payloads a player could send now. Each becomes `{ type, ...payload }`. Its view holds:

- the module's slice, as `state`;
- `content`;
- `fact(id, args)` and `check(condition)`;
- `mode`, the current frame with its data.

It has no stream and no way to write, so listing options changes nothing.

`game.options(state, sim)` lists every concrete action the current mode allows:

- **The order.** Types are sorted, and each type's options keep the order its action lists them.
- **Defaults.** An action without `options` is offered once, with no payload. One whose `options` returns an empty list is not offered.
- **What it returns.** The actions are frozen. A payload that isn't an object, that names a `type`, or that isn't JSON throws `ActionError`.
- **What is offered is what is allowed.** Every option must be accepted by `run`. The headless runner counts any that is refused ([runner.md](runner.md)), as a bug in that action's options.

## reduce(state, action, sim)

It returns `{ state, beats, accepted }`, in these steps:

1. **Check the state.** A state that isn't frozen is checked as JSON and frozen.
2. **Check the action.** It must be an object with a string `type`, and JSON, because it goes into the replay log. Otherwise, or if no module registers the type, `reduce` throws an `ActionError`. That is a bug, not a refusal.
3. **Check the mode.** If the current mode doesn't allow the action, it is refused with `reason: "mode"` and `mode: <id>`.
4. **Run the handler** with its module's context, in a transaction. Once it returns, the events it raised are heard by the modules listening, each in a piece of work of its own ([triggers.md](triggers.md#listeners)); an attempt's events are heard as it finishes.
5. **A refusal.** If the handler, or any effect it applied, calls `ctx.refuse(reason, data?)`, the transaction is dropped. `reduce` returns the same state, `accepted: false` and exactly one beat, `{ "type": "rejected", "action", "reason", ...data }`. Nothing the action did is kept, including its beats and its draws.
6. **Any other exception** propagates, and the state passed in is untouched.
7. **Commit.**
   - Each slice the action wrote is checked as JSON and frozen.
   - The streams it used are saved, the mode stack is replaced if it changed, and `step` goes up by one.
   - Slices it didn't write are shared with the previous state.

Callers read `accepted` rather than comparing states. An accepted action can change nothing; landnam's recorder counted 1,973 false refusals by comparing states.

## The handler's context

| Member | Does |
| --- | --- |
| `read()` | The module's slice, including this action's changes. |
| `write()` | The slice to change. The first call in an action copies it. |
| `fact(id, args?)` | A registered fact, seeing this action's changes so far. |
| `check(condition)` | The condition's truth (true, false or null) through this action's changes so far. |
| `apply(effect)` | Runs the effect's owner, with the owner's own context. Effects may apply effects, up to 64 deep. |
| `attempt(work)` | Runs `work`; if anything in it refuses, undoes all of it and returns the refusal instead of refusing the action (below). |
| `rng(name)` | The module's stream `module/name` (below). |
| `emit(what, data?)` | Adds the beat `module/what`. When the module declares `what` as an event, the data must be its arguments, and listeners hear it ([triggers.md](triggers.md)). |
| `refuse(reason, data?)` | Refuses the action (step 5). Write `return ctx.refuse(…)` so TypeScript knows the handler stops there. |
| `modes` | The mode stack: `stack`, `current`, `push`, `pop`, `replace`. |
| `step`, `content` | The number this action becomes if accepted, and the content pack. |

## Attempts

`ctx.attempt(work)` returns `{ ok: true }`, or `{ ok: false, reason, data }` when something in `work` refused. A refused attempt leaves nothing behind: no writes, draws, beats or mode changes. The action goes on from the point after the attempt. Scheduled consequences need this (M1.7): one that refuses must not stop time from passing.

- **How it undoes.** `reduce` runs the action again from the same state, with the refused attempt skipped. Rolling back in place would leave handlers holding copies of slices that the undo had replaced.
- **Names.** Attempts are named by where they sit: `"2"` is the third at the top level, `"2/0"` the first inside it. A run that skips an attempt reaches every earlier attempt in the same place, and never renumbers the ones after it.
- **Rules for handlers.**
  - The work must do the same thing each time it runs, which pure handlers do.
  - Handlers must not catch what `ctx` calls throw.
- **Cost.** Each refused attempt costs one more run of the action. More than 1,000 in one action throws.
- **A refusal outside any attempt** still refuses the whole action.

## Random streams

- **Labels.** A stream's label is `module/name`; both parts are kebab-case. Two modules that both call `rng('dice')` get separate streams.
- **Creation.** On first use in a game, a stream is `Rng.create(kernel.seed).fork(label)`, which is the same as `Rng.create(seed + "\u001f" + label)` ([rng.md](rng.md)).
- **Saving.** After every accepted action that used it, the stream is saved as `toState()` in `kernel.streams[label]`. The draws carry on across actions and saves, and never move another stream.
- **Refused actions** keep none of their draws.
- **Where randomness comes from.** Handlers take it only from `ctx.rng`. A stream made anywhere else forks the replay (landnam's `src/sim/swing.ts`).

## Made records

A module may make records in play (M3.6, [D44](../decisions.md)): the roster kit's recruits are actors made this way ([roster.md](roster.md#members-made-in-play)).

- **Declared** as `made: { types, ids(view, type), get(view, type, id) }`. `view` is `{ state, content }`: the module's slice as it is at that moment, and the pack's content. `ids` lists the ids it has made of a type, sorted; `get` gives one record, or `undefined`.
- **Read everywhere content is.** The `content` a handler's context, a fact's view, an action's options and an effect's preview hold is the pack's records with every module's made records beside them. So a made record is read, listed, checked as a reference and named in an event exactly as a written one is: `has`, `get`, `getOrThrow`, `ids` and `entries` all see it, and `ids` lists both kinds sorted together.
- **Read through the drafts.** Each lookup reads the making module's slice as the action has left it so far, so a record made by one effect is there for the next in the same action, and a refused action leaves none.
- **Never a written record's id.** A made id that is also the pack's, or another module's, throws when a type's ids are listed; looked up by id, the written record is the one found. Content that could clash is stopped by validation (the roster kit's E035).
- **Frozen** the first time the kernel sees each, as content's records are.
- **Not in `init`:** nothing has been made before the first slices exist.
- **Not checked by `eb validate`,** which reads only the pack: a module makes records only from what validation checked, a recruit from its template.

## Beats

- **Shape.** `{ "type": "module/what", ...data }`. The data is JSON, and it can't override `type`.
- **The kernel's own beats** are `mode` and `rejected`. They have no `/`, so they can't clash with a module's beats.
- **Content.** Beats carry ids and numbers, never prose: the stage writes the words, so rewording or translating never touches the sim. They are not saved.
- **Events** are the beats a module declares for content to react to, with typed arguments (M3.1). A beat that isn't declared is for the stage alone. "Beat" stays the general word, since choice events are also a kind of content record.

## Facts and effects outside reduce

None of these change the state or draw a random number.

- `game.fact(state, id, args, sim)` reads a fact for the UI or a bot.
- `game.check(state, condition, sim)` evaluates a condition the way `ctx.check` does, so a menu offers what the sim allows.
- `game.preview(state, effects, sim)` previews each effect: its module's `preview`, or the effect as written ([conditions.md](conditions.md)).
- `game.catalog()`, and `factCatalog(modules)` without a start mode, list every fact's declaration by id: what content is checked against. `game.events()` and `eventCatalog(modules)` do the same for events.
- `game.allowedActions(state)` lists the action types the current mode allows, sorted, and `game.options(state, sim)` the concrete actions ([Options](#options)).

## Sessions

`createSession(game, sim, state)` is what a stage drives:

- `dispatch(action)` reduces and returns the result;
- `drain()` hands over the beats queued since the last drain, refusals included;
- `log` holds the accepted actions as frozen copies;
- `state` is the current state;
- `start` is the state the log starts from, and `compact()` makes the current state the new start and empties the log.

Replaying the log from `start` reaches `state`, so the three are a save ([saves.md](saves.md)). `writeSession` compacts the session after a write that saved 200 actions or more.

## Proof: salvage run

`packages/core/test/salvage.ts` is a test-only text game.

- **Modules.** `crew`, `hold` and `voyage`, which reach each other only through facts and effects, plus `logicModule` for rolls, the time module for days (M1.7, [time.md](time.md)), and since M3.1 the flag and sheet modules, with a trigger sheet that reacts to the voyage's events ([triggers.md](triggers.md)).
- **Content.** Choice events in the content pack. Some choices are locked by a condition, and chancy ones apply a `roll` effect (M1.6, [conditions.md](conditions.md)).
- **The bot** plays through `reduce` and the allowed actions, as a player would. It offers only choices whose condition holds, through `game.check`. landnam's bot skipped the mode checks and made 18,733 moves its UI would have refused.
- **Content** is the project folder `packages/core/test/fixtures/salvage-run`, which `eb sim` plays too. Since M1.9 its actions list their options, for the headless runner's bots ([runner.md](runner.md)).

`packages/core/src/sim/salvage.test.ts` checks four things:

- 1,000 seeds played twice give identical hashes;
- every run ends inside a 400-action cap, and runs differ by seed;
- replaying a run's log reproduces its state;
- a run saved and reloaded halfway (a JSON round trip) ends where the uninterrupted run ends.

The M1.6 tests for its conditions and previews are listed in [conditions.md](conditions.md), and the M1.7 tests for its days and debts in [time.md](time.md).

`node packages/core/test/salvage-bench.ts` takes the reduce timing in ROADMAP's Readings.

## Open questions

1. **Action payloads.** Handlers check their own payloads today. Should actions declare a schema: zod in `@eb/schema` for the editor and CLI, plus a pure check at runtime? Decide with M3.2 scripts.
2. **A lint for stray streams.** Forbid `Rng.create` and `Rng.fromState` in module code, so streams only come from `ctx.rng`. This belongs with M3.2's purity lint for scripts.
3. **State size.** The cost of an action grows with the slices it writes, which are copied, then checked and frozen. landnam's per-action copy grew from 0.045 ms to 2.2 ms when terrain lived in state. Keep derived data out of state, and measure again for the 3D spike (M1.10).
