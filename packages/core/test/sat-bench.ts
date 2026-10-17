/**
 * Times the condition lint at its caps: a search that must try all 100,000 combinations, and
 * one that runs all 20,000 samples. The instrument behind the "condition lint" reading in
 * ROADMAP.md.
 *
 *   node packages/core/test/sat-bench.ts
 */
import { type Condition, type FactCatalog, satisfiability } from '../src/index.ts';

const catalog: FactCatalog = {
  'a.word': { args: { i: { type: 'int' } }, domain: { type: 'text' } },
  'a.slot': { args: { i: { type: 'int' } }, domain: { type: 'int', min: 0, max: 100 } },
};

// Ten classes for each of five words: 100,000 combinations, and the only false one is the last tried.
const exhaustive: Condition = {
  any: Array.from({ length: 5 }, (_, i) =>
    Array.from({ length: 9 }, (_, w) => ({ fact: 'a.word', args: { i }, op: '==' as const, value: `w${w}` })),
  ).flat(),
};
// 5^9 combinations and never true, so every sample runs.
const sampled: Condition = {
  all: [
    ...Array.from({ length: 9 }, (_, i) => ({ fact: 'a.slot', args: { i }, op: '>' as const, value: 50 })),
    { fact: 'a.slot', args: { i: 0 }, op: '<' as const, value: 10 },
  ],
};

for (const [name, condition] of [
  ['exhaustive', exhaustive],
  ['sampled', sampled],
] as const) {
  const started = performance.now();
  const result = satisfiability(condition, { catalog });
  const elapsed = performance.now() - started;
  console.log(
    `${name}: ${result.combinations} combinations, exhaustive ${result.exhaustive}, ${elapsed.toFixed(0)} ms`,
  );
}
