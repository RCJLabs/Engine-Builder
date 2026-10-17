/**
 * Times the headless runner on salvage run: a sweep of 1,000 seeds with the random policy and
 * four metrics, reported per run and per turn. The instrument behind the "seed sweep" reading in
 * ROADMAP.md. Each turn lists the options, lets the policy choose and reduces the action.
 *
 *   node packages/core/test/sweep-bench.ts
 */
import { randomPolicy, seedsOf, sweep } from '../src/index.ts';
import { game, sim } from './salvage.ts';

const started = performance.now();
const { report } = sweep(game, sim, {
  seeds: seedsOf(1000, 'bench'),
  policy: randomPolicy,
  metrics: ['voyage.ending', 'crew.alive', 'hold.credits', 'time.day'],
});
const elapsed = performance.now() - started;
const turns = (report.turns?.mean ?? 0) * report.runs;
console.log(
  `${report.runs} runs, ${Math.round(turns)} turns in ${Math.round(elapsed)} ms: ` +
    `${((elapsed * 1000) / report.runs).toFixed(0)} µs a run, ${((elapsed * 1000) / turns).toFixed(1)} µs a turn`,
);
