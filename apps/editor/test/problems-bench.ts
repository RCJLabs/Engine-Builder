/**
 * Measures the Problems panel's work on a big, broken project: the ludus types with 2,000
 * gladiators, half of them with a might that isn't a number, so 1,000 problems. The count on the
 * tab is taken again after every change; the list is built again when the project changes; a
 * search filters it on every key. In memory, in Node: drawing the list in a browser adds its own
 * time. The instrument behind the "Problems panel" reading in ROADMAP.md.
 *
 *   node apps/editor/test/problems-bench.ts
 */
import type { ProjectSource } from '@eb/compiler';
import { FIXTURE_LUDUS, readFixture } from '../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../src/forms/catalog.ts';
import { projectProblems, tally } from '../src/problems/collect.ts';
import { ALL_PROBLEMS, groupProblems, shownGroups } from '../src/problems/problemList.ts';
import { EMPTY_INDEX, updateIndex } from '../src/records/recordIndex.ts';

const GLADIATORS = 2000;
const encoder = new TextEncoder();
const files = new Map(Object.entries(readFixture(FIXTURE_LUDUS)).map(([path, text]) => [path, encoder.encode(text)]));
for (let i = 0; i < GLADIATORS; i++) {
  const gladiator = {
    name: `Gladiator ${i}`,
    might: i % 2 ? 'strong' : i % 101,
    style: 'murmillo',
    school: i % 2 ? 'ludus-magnus' : 'ludus-dacicus',
    free: false,
    skills: ['feint'],
    record: { wins: i % 30, losses: i % 7 },
  };
  files.set(`records/gladiator/g${i}.json`, encoder.encode(JSON.stringify(gladiator)));
}
const source: ProjectSource = {
  files: async (dir) => [...files.keys()].filter((p) => dir === '' || p.startsWith(`${dir}/`)),
  read: async (p) => files.get(p),
};

const median = (times: number[]) => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? 0;
function time(runs: number, run: () => unknown): number {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    run();
    times.push(performance.now() - t0);
  }
  return median(times);
}

const catalog = await readCatalog(source);
const index = await updateIndex(EMPTY_INDEX, source, catalog, null);
const counts = tally(catalog, index);
if (counts.errors !== GLADIATORS / 2) throw new Error(`expected ${GLADIATORS / 2} errors, found ${counts.errors}`);
const count = time(50, () => tally(catalog, index));
const list = time(20, () => groupProblems(projectProblems(catalog, index), catalog, index));
const groups = groupProblems(projectProblems(catalog, index), catalog, index);
const search = time(20, () => shownGroups(groups, { ...ALL_PROBLEMS, search: 'gladiator 19' }, catalog));

console.log(
  `${index.records.size} records, ${counts.errors} problems: counted in ${count.toFixed(2)} ms (median of 50), ` +
    `listed under ${groups.length} files in ${list.toFixed(1)} ms, searched in ${search.toFixed(1)} ms (medians of 20)`,
);
