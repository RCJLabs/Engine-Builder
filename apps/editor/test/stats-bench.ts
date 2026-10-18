/**
 * Measures the record index with the stats and gear kits (M3.4): the ludus types with 2,000
 * gladiators, 12 stats, 300 actors that give each stat a base and wear 2 of 100 items in 6 slots.
 * An actor's bases read its stats, and what it wears reads the items, so an edit to a stat checks
 * the 12 stats and 300 actors again (statRelated), and one to an item the 100 items and 300 actors
 * (wornRelated); an edit to a gladiator checks one. In memory, in Node. The instrument behind the
 * "Record index with stats" reading in ROADMAP.md.
 *
 *   node apps/editor/test/stats-bench.ts
 */
import type { ProjectSource } from '@eb/compiler';
import { FIXTURE_LUDUS, readFixture } from '../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../src/forms/catalog.ts';
import { EMPTY_INDEX, type RecordIndex, updateIndex } from '../src/records/recordIndex.ts';

const GLADIATORS = 2000;
const STATS = 12;
const ACTORS = 300;
const ITEMS = 100;
const SLOTS = 6;
const encoder = new TextEncoder();
const files = new Map(Object.entries(readFixture(FIXTURE_LUDUS)).map(([path, text]) => [path, encoder.encode(text)]));
const put = (path: string, value: unknown) => files.set(path, encoder.encode(JSON.stringify(value)));

const manifest = JSON.parse(readFixture(FIXTURE_LUDUS)['project.json'] as string);
put('project.json', { ...manifest, kits: ['inventory', 'stats', 'gear'] });
for (let i = 0; i < GLADIATORS; i++) {
  put(`records/gladiator/g${i}.json`, {
    name: `Gladiator ${i}`,
    might: i % 101,
    style: 'murmillo',
    school: i % 2 ? 'ludus-magnus' : 'ludus-dacicus',
    free: false,
    skills: ['feint'],
    record: { wins: i % 30, losses: i % 7 },
  });
}
const stat = (s: number, max = 100) => ({ name: `Stat ${s}`, min: 0, max, start: 10 });
for (let s = 0; s < STATS; s++) put(`records/stat/s${s}.json`, stat(s));
for (let k = 0; k < SLOTS; k++) put(`records/slot/k${k}.json`, { name: `Slot ${k}` });
const slotOf = (i: number) => `k${i % SLOTS}`;
const item = (i: number, add = 1 + (i % 5)) => ({
  name: `Item ${i}`,
  value: 10 + i,
  slot: slotOf(i),
  modifiers: [{ stat: `s${i % STATS}`, add }],
});
for (let i = 0; i < ITEMS; i++) put(`records/item/i${i}.json`, item(i));
for (let a = 0; a < ACTORS; a++) {
  const stats = Object.fromEntries(Array.from({ length: STATS }, (_, s) => [`s${s}`, 10 + ((a + s) % 80)]));
  // Two neighbouring items, each in its own slot: never the same one, since 100 items wrap to 0 in another.
  const [first, second] = [a % ITEMS, (a + 1) % ITEMS];
  const wears = { [slotOf(first)]: `i${first}`, [slotOf(second)]: `i${second}` };
  put(`records/actor/a${a}.json`, { name: `Actor ${a}`, stats, wears });
}

const source: ProjectSource = {
  files: async (dir) => [...files.keys()].filter((p) => dir === '' || p.startsWith(`${dir}/`)),
  read: async (p) => files.get(p),
};

const median = (times: number[]) => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? 0;
async function time(runs: number, run: () => Promise<unknown>): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await run();
    times.push(performance.now() - t0);
  }
  return median(times);
}

const catalog = await readCatalog(source);
let index: RecordIndex = await updateIndex(EMPTY_INDEX, source, catalog, null);
const problems = [...index.records.values()].flatMap((r) => r.problems);
if (problems.length > 0) throw new Error(`The bench's project has problems: ${JSON.stringify(problems.slice(0, 3))}`);
const build = await time(5, () => updateIndex(EMPTY_INDEX, source, catalog, null));

let n = 0;
const edit = (path: string, value: () => unknown) => async () => {
  put(path, value());
  index = await updateIndex(index, source, catalog, [path]);
};
const statEdit = await time(
  20,
  edit('records/stat/s3.json', () => stat(3, 100 + (++n % 5))),
);
const itemEdit = await time(
  20,
  edit('records/item/i7.json', () => item(7, 1 + (++n % 5))),
);
const gladiatorEdit = await time(
  50,
  edit('records/gladiator/g11.json', () => ({
    name: 'Gladiator 11',
    might: ++n % 101,
    style: 'murmillo',
    school: 'ludus-magnus',
    free: false,
    skills: ['feint'],
    record: { wins: 1, losses: 1 },
  })),
);
const f = (ms: number) => ms.toFixed(1);
console.log(
  `${index.records.size} records: built ${f(build)} ms; a stat edited ${f(statEdit)} ms, ` +
    `an item ${f(itemEdit)} ms, a gladiator ${f(gladiatorEdit)} ms`,
);
