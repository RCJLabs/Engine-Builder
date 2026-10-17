/**
 * Measures what a form costs on a big project: the ludus types with 2,000 gladiators, each with a
 * condition written as text. Reading the catalog runs after every change; checking one record
 * runs on every keystroke. In memory, in Node: OPFS listing in a browser adds its own time. The
 * instrument behind the "Form checks" reading in ROADMAP.md.
 *
 *   node apps/editor/test/form-bench.ts
 */
import { memorySource } from '@eb/compiler';
import { FIXTURE_LUDUS, readFixture } from '../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../src/forms/catalog.ts';
import { checkRecord } from '../src/forms/problems.ts';

const GLADIATORS = 2000;
const files: Record<string, string> = readFixture(FIXTURE_LUDUS);
const gladiator = (i: number) => ({
  name: `Gladiator ${i}`,
  might: i % 101,
  style: 'murmillo',
  school: i % 2 ? 'ludus-magnus' : 'ludus-dacicus',
  free: false,
  skills: ['feint', 'shield wall'],
  kit: { gladius: 1 },
  record: { wins: i % 30, losses: i % 7 },
  fights: 'arena.day and not crowd.angry',
});
for (let i = 0; i < GLADIATORS; i++) files[`records/gladiator/g${i}.json`] = JSON.stringify(gladiator(i));
const source = memorySource(files);

const median = (times: number[]) => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? 0;

const reads: number[] = [];
let catalog = await readCatalog(source);
for (let i = 0; i < 20; i++) {
  const t0 = performance.now();
  catalog = await readCatalog(source);
  reads.push(performance.now() - t0);
}
const checks: number[] = [];
for (let i = 0; i < 200; i++) {
  const t0 = performance.now();
  const found = checkRecord(catalog, 'gladiator', 'g7', gladiator(7));
  checks.push(performance.now() - t0);
  if (found.length > 0) throw new Error(`g7 should be clean: ${found[0]?.message}`);
}
console.log(
  `${GLADIATORS + 8} records: catalog read in ${median(reads).toFixed(1)} ms (median of 20), ` +
    `one record checked in ${median(checks).toFixed(2)} ms (median of 200)`,
);
