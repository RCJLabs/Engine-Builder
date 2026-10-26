# Spec: the headless runner

This is exactly how a game is played without a stage:

- action options, in the kernel (`packages/core/src/sim/`, and [sim.md](sim.md#options));
- bot policies, runs, seed sweeps, statistics and golden files, in `packages/core/src/runner/`;
- `eb sim`, in `tools/cli/src/`.

The runner is pure, so a sweep gives the same report in Node, in a browser and in a worker. A port must follow the policies' and the statistics' rules to reproduce a report.

It keeps what held up in the existing games and avoids what went wrong in them:

- **Moves come from the game.** space-wrecked's players build actions from `targetsFor` and `reachable`, spliceworld's pilots choose from the engine's `playerActions()`, and landnam's `play()` returns the actions it refused. Here every move is one of `game.options`, and an offer the game then refuses is a bug the report counts. landnam's bot made 18,733 moves its interface would have refused.
- **A bot sees what a player sees.** sandbagged's bot read the hidden grip on 72.2% of its decisions, rule-or-drool's bots see previews a human never does, and chooser-of-the-dead's skill profiles roll against the known answer. Here a policy gets the options, the screen, facts, conditions and previews, and never the state.
- **The bot draws from a stream of its own,** as in chooser-of-the-dead, rule-or-drool and afterglass. ludus's probes spent the game's rolls and read 57.9% where the truth was 66.1%.
- **Every number has an interval.** Every surveyed game with sweeps has read noise as signal at least once:
  - wasteland-protocol's "+49% median score" came from 30 runs;
  - rule-or-drool's crisis spread of 17% to 36% was sampling noise;
  - football-manager-simulator reverted three tuning attempts that sat inside the noise.

  space-wrecked reports win rates with Wilson intervals, and football-manager-simulator replaced its error bars with t intervals. The runner does both.
- **Seeds must matter.** In 2060td, 45% of matchups ended byte for byte the same across 20 seeds, after twelve releases of tuning had been read off them. The report counts distinct endings.
- **A cap is not a loss.** 2060td filed a stalemate at its tick cap as a defeat, and one cell went from 10 to 85 once measured again. Here a capped run is its own kind of end.
- **Goldens per seed, written on purpose.** football-manager-simulator prints a hash per game "so a divergence names itself". chooser-of-the-dead writes a missing golden file and passes. Here each seed keeps its hash and its slices' hashes, and a missing file is an error until `--update` writes it.
- **The real game, not a copy.** spliceworld's harness kept its own content list, which drifted. 2060td's `defenseMatrix` built its config by hand and went on measuring old rules. `eb sim` compiles the project and plays it with the game's own modules.

## Options

An action may be `{ run, options(view) }`. `options` returns the payloads a player could send now, read from the module's slice, facts, conditions, content and the current mode. `game.options(state, sim)` lists every concrete action the current mode allows ([sim.md](sim.md#options)).

- **What is offered is what is allowed.** Every option must be accepted by `run`. The runner counts each one that is refused, and `eb sim` fails on any.
- **Salvage run** offers its event choices whose conditions hold, and resting only while someone is hurt. A test plays 100 runs and reduces every option offered in every state reached, and the game accepts every one.

## Policies

A policy is `{ name, choose(turn) }`. `choose` returns one of `turn.options`, the object itself, or `null` to stop the run. Anything else throws. Names are kebab-case, because reports and golden files name the policy.

| `turn.` | Holds |
| --- | --- |
| `options` | What the game offers now. Never empty. |
| `mode` | The current mode, with its data: the screen the player is on. |
| `content` | The content pack's records. |
| `fact(id, args?)`, `check(condition)` | Facts and conditions in the current state, as a menu reads them. |
| `preview(effects)` | What effects would do now: the odds and costs a player is shown, never the outcome. |
| `rng` | The bot's stream: `Rng.create(seed).fork('bot')`. Module streams are always `module/name`, so no module can draw it. |
| `turn` | Turns taken before this one. |

`turnFor(game, sim, state, rng, turn)` builds the same turn, for tests and for a "suggest a move" button.

**The three policies:**

- **`randomPolicy`** (`random`) is `rng.pick(options)`.
- **`weightedPolicy(name, weights)`** weighs each option by its type: `weights[type]`, or 1 for a type not named. A weight is a whole number from 0, and 0 never picks the type.
  - When every option weighs 0, the bot stops.
  - Otherwise it picks `options[rng.weightedIndex(weights)]`.
- **`rulePolicy(name, rules)`** takes rules as data. A rule is `{ when?, prefer }`.
  - The rules are tried in order. A rule whose `when` doesn't check `true` is passed over.
  - Each remaining rule keeps the options that fit `prefer`. The first rule with any picks one with `rng.pick`.
  - With no rule matching, the bot picks `rng.pick(options)`.
  - An option fits `prefer` when every field matches. `type` matches as a mode pattern (`crew/*`); any other field must be equal (`===`).

A policy's results describe its play, not the game's. landnam's, dirtbag's and ludus's bots always took the first option, and their habits were read as facts about the game. Salvage run shows the same danger: resting costs no time, so a bot that rests whenever someone is hurt never loses.

## Runs

`playRun(game, sim, { seed, policy, maxTurns })`:

1. **The start.** `game.init(seed, sim)`, and the bot's stream from the seed.
2. **Each turn, up to `maxTurns`** (`MAX_TURNS`, 1,000, by default):
   - the run ends `ended` when nothing is offered;
   - it ends `stopped` when the policy returns `null`;
   - an action that wasn't offered throws.
   - Otherwise the action is reduced, and its beats are counted by type.
   - An accepted action moves the state on and joins the log. A refused one is recorded as `{ turn, action, reason }`.
3. **The cap.** A run still going after `maxTurns` turns ends `capped`.

The result holds the seed, the final state, the turns, the end, the refused offers, the beat counts, and the log. Replayed from a new game of the seed, the log reaches the final state.

## Sweeps

`sweep(game, sim, { seeds, policy, maxTurns, metrics })` plays each seed once, in order. Seeds must be distinct. `seedsOf(n, prefix = 'seed')` gives `prefix-0` to `prefix-(n−1)`.

| `report.` | Holds |
| --- | --- |
| `runs`, `policy` | How many runs, and the policy's name. |
| `ends` | How many runs ended, stopped and were capped. |
| `distinct` | How many different endings, by the hashes of every slice but the kernel, which holds the seed. |
| `turns` | A number summary of the turns. |
| `metrics` | One report per metric. |
| `beats` | Per beat type, sorted: the runs that produced it at least once, as a share. |
| `refused` | The refused offers: their count, and the first ten with their seeds. |

A metric is a fact read at the end of each run: `'crew.alive'`, or `{ fact, args?, label? }`. Its fact's domain gives its kind:

- **`int` and `number`** give a number summary of the values. Runs where the fact has no value are counted as `none`.
- **`bool`, `enum`, `ref` and `text`** give a share per value, with no value as `null`. Values are told apart by canonical JSON, so `1` and `"1"` stay apart. The most common comes first, with ties ordered by canonical JSON.
- **A fact without a domain** is a number when every value is a number or none, and a set of values otherwise.

`sweep` also returns, per run, the state hash, a hash per top-level key (`readFacets`), the turns and the end: what golden files keep.

## Statistics

Every interval is a two-sided 95% one. `Z95` is 1.959963984540054.

- **A share** of `k` runs in `n` gets Wilson's interval:
  - `p = k/n`, `scale = 1 + z²/n`, `centre = (p + z²/2n) / scale`;
  - `half = z·√(p(1−p)/n + z²/4n²) / scale`;
  - the interval is `[max(0, centre − half), min(1, centre + half)]`.

  With `n = 0`, it is `[0, 1]`. Unlike the normal approximation, it stays inside 0 to 1 and still says something at 0 of 20.
- **A number summary** of `n` values, in the order given:
  - the mean is the sum over `n` (two passes, so the mean of whole numbers comes out exact);
  - the sample standard deviation is `√(Σ(x − mean)² / (n − 1))`;
  - the interval of the mean is `mean ± t95(n−1)·sd/√n`;
  - min, p10, median (p50), p90 and max come by nearest rank.

  With one value, the deviation and the interval are `null`. With none, there is no summary.
- **`t95(df)`** is Student's t at 0.975:
  - for 1 to 30 degrees of freedom, from a table to 10 decimals;
  - past 30, from the Cornish–Fisher expansion in powers of 1/df to four terms (Abramowitz and Stegun 26.7.5), within 3e-8 of the exact value.
- **Nearest rank**: the value at rank `max(1, ⌈p·n/100⌉)` of the sorted values. It is always one of the values, never a blend of two.

Arithmetic and square roots only, which IEEE 754 rounds exactly, so every engine gets the same digits.

**Golden vectors** (`stats.test.ts`), checked against [`stats_oracle.py`](stats_oracle.py) in CI. The oracle works t out from its CDF through the incomplete beta function, not from a table.

| Case | Value |
| --- | --- |
| `wilson(34, 1000)` | 0.024431348663226313 to 0.04713519024531107 |
| `wilson(0, 20)` | 0 to 0.16112515805281938 |
| `wilson(7, 10)` | 0.39677814746114537 to 0.8922087325936989 |
| `t95(7)`, `t95(31)`, `t95(1000)` | 2.364624251592784, 2.0395134463964064, 1.9623390808264358 |
| `summarize([9, 2, 4, 5, 4, 7, 4, 5])` | mean 5, sd 2.138089935299395, interval 3.21251208176379 to 6.787487918236209 |

## Golden files

A golden file is JSON:

| Field | Holds |
| --- | --- |
| `format` | `GOLDEN_FORMAT`, 1. |
| `game` | The project id. |
| `content` | The content pack's hash when the runs were played. |
| `policy`, `maxTurns` | How the runs were played. |
| `runs` | By seed, in the order played: `{ hash, facets, turns, end }`, with `facets` the hash of each top-level key. |

- **Reading.** `readGolden(raw)` checks each field and throws `GoldenError` naming the first wrong one.
- **Comparing.** `compareGolden(golden, now)` needs the same game, seeds, policy and cap, and throws otherwise. A seed differs when its hash, turns or end differ. Each difference names the top-level keys whose hashes moved, sorted.
- **What a comparison says.** `contentChanged` says the pack's hash moved, which explains differences without excusing them.
- **Versions in the hash.** A module version bump moves the kernel's facet in every run, since `kernel.versions` is state. landnam's `SAVE_VERSION` inside its state hash moved 48 parity hashes at once; here the facets show that it was the kernel.

## eb sim

```sh
eb sim <project> --game <module> [--policy <name>] [--seeds <n>] [--prefix <text>]
       [--max-turns <n>] [--golden <file> [--update]] [--json]
```

**The game module** exports:

- `recordTypes`, `modules` and `start`;
- optionally, `policies`, a list of named policies, and `metrics`, the facts to report.

`random` is always there. Facts for checking conditions come from the modules. `eb validate --types` reads the same module, and takes its facts from `modules` when it has no `facts` export.

**What it does:**

1. Compiles the project. Content with errors prints its diagnostics and exits 1.
2. Plays the sweep. The defaults are 100 seeds from `seed-0`, the `random` policy, and 1,000 turns.
3. Prints the report:
   - ends and distinct endings;
   - turns, and each metric with its interval;
   - refused offers.

   `--json` prints `{ ok, project, content, maxTurns, report, golden }` instead.

**Golden files:**

- **`--golden <file>`** checks the runs against the file. It plays the file's own seeds, policy and cap, so giving those flags as well is a usage error.
- **With `--update`**, it writes the file instead. It takes the flags first, then the settings of the file it replaces, then the defaults.
- **A missing file** is a usage error until `--update` writes it. A file of another project is a usage error too.

**Exit codes:**

- 0: all is well.
- 1: content errors, any refused offer, or runs that differ from the golden file.
- 2: the command couldn't run.

**In CI.** `tools/cli/test/fixtures/salvage-steady.golden.json` holds 50 runs of salvage run with the `steady` bot. `tools/cli/test/sim.test.ts` checks it in CI, so a change to the engine or to salvage run that moves a run fails until the file is updated on purpose. M3.1 did so once: salvage run gained flags and a trigger sheet, and the check named the slices each run moved in (flag, sheet, and the hold, crew and time where the rows changed them) before the file was written again.

## Proof

- **Options:**
  - offered once without `options`, and each payload with them, by type;
  - they follow the state, change nothing and draw nothing;
  - a payload with a type, or one that isn't JSON, throws;
  - salvage run's 100-run property above.
- **Runs:**
  - a log that replays to the run's state;
  - the same run for the same seed and policy;
  - a bot stream that never shifts the game's;
  - all three ends, an invented action that throws, and refused offers recorded with their reasons.
- **Policies:**
  - each rule of `rulePolicy` taken in turn, at raiders with and without the credits to pay;
  - a rule whose condition is false passed over even when its option is offered;
  - names that aren't kebab-case refused when the policy is made.
- **Sweeps:**
  - ends, distinct endings (200 of 200 for salvage run, 1 for a game the seed can't touch);
  - metrics by kind, with intervals that contain their shares;
  - values most common first, whatever their names, and runs with no value counted as none;
  - beats, the per-run hashes, and a report that is the same every time.
- **Statistics:** the golden vectors and the oracle.
- **Golden files:**
  - a JSON round trip, and a match;
  - a content change named by seed and slice;
  - mismatched settings refused, and every malformed field refused.
- **`eb sim`:**
  - the report, JSON, the CI golden, write-match-differ, and a sloppy game whose refused offers fail it;
  - a door game whose 20 runs end in 1 state, said so in the report;
  - content errors, conditions checked against the game's facts, and every usage error.
- **Planted bugs:** 47, each caught by at least one test. The first run let three through: options in registration order, an empty `modules` export, and the run count printed for distinct endings. Each now has a test that fails it.
- **Readings:** the seed sweep, in ROADMAP's Readings.

## A walked game's stage (M6.9, D81)

A walked game moves only by what its stage sends: `world/use` and `world/trigger` as the player reaches a thing, `fighting/hit` as a blow lands, `fighting/search` at a body. None of them is an option, so a bot alone can't take a step. A run can be given a **stage**: what a stage could send now, beside the game's options.

- **`RunOptions.stage`** is a function of the state, the game and the sim that returns candidate actions. Each candidate is reduced, and kept only when the sim takes it, so a stage never offers what is refused. The bot's turn sees the game's options, then the stage's, in that order.
- **The world's stage** (core's `world/stage.ts`) offers, in the space the player is in: each use, as `world/use`, and each zone, as `world/trigger`. It places no one, so a bot reaches anything in that space: distance and sight are the walk's, not the bot's (D81's cost).
- **The fighting kit's stage** (`fighting/stage.ts`) adds, with project.json's `fighting`:
  - the player's blow, with what they wield, at each NPC of the space still standing;
  - each engaged NPC's blow at the player, with what it wields;
  - the search of each fallen body there.
- **`eb sim` gives every game with spaces the world's stage,** and the fighting kit's when it is on. A golden file records which stage its runs had, so a run without one doesn't match one with.

As built:

- `Stage` is `{ name, candidates(state, game, sim) }` (core's `runner/stage.ts`); `joinStages` plays several, each one's candidates after the one before's, under their names joined by "+". The kits' `walkedStage(project, world)` is the one `eb sim` and the editor's Run both use: `walk`, or `walk+fight` when the pack holds project.json's `fighting`.
- The fighting stage offers an unarmed striker's blow with `""`, as the kit names fists. A bow's blow spends no arrow: the walk's arrows fly on the page, which a headless run has none of.
- The report's first line names the stage ("…with the random policy and the walk and fight stage…"), and the golden keeps it after the cap. `eb sim --golden` against a file played with another stage, or none, stops with a usage error naming both rather than comparing other runs.
- Run over the walked fixtures, the stage found two bugs the session tests had not:
  - the camp's own weapon change was offered while the other weapon was in a body, not the bag, and refused;
  - a project's `game.ts` is read with the checking game's stand-in container, and `kitsInWorld` kept that inventory build, so `eb sim` and Run threw at the post's barrel. `kitsInWorld` now builds again any inventory the kits made.

## Open questions

1. **Comparing two versions.** A/B runs with content overrides belong to the Balance Lab (Phase 8), as in chooser-of-the-dead's `compare.ts` and football-manager-simulator's paired blocks.
   - Pairing a seed across versions only works while each purpose keeps its own stream. chooser-of-the-dead found that content changes shift the draws, so "the two runs of a seed aren't paired".
2. **Targets.** A check on a sweep, such as "home in at least 60% of runs", must test the interval, not the point. rule-or-drool set a 25% limit over readings of 24.3% to 24.8%. wasteland-protocol set a floor 2.7 standard deviations below the mean, and it went red one battery in three. This is for `eb test`.
3. **Many rows at once.** A report of many metrics will have some move by chance alone: wasteland-protocol saw 76 rows move where noise predicted about 25. Larger reports need that said beside them.
4. **Workers.** 1,000 salvage runs take about 2.2 seconds in one thread. chooser-of-the-dead's nightly took 50 minutes until it was split across four runners, and spliceworld's pool returns results in input order and stops at the first failure. Bigger games will need the same.
5. **Reachability by data.** Beats are counted by type. Phase 3's gate, every quest completable, needs coverage by data too: which events were reached, and which steps were never.
6. **Bots that look ahead.** A policy can't reduce, so it can't peek at an outcome. A bot that knows the dice can give an upper bound, but it must be labelled as one, and none is built.
7. **The level of the intervals** is fixed at 95%.
