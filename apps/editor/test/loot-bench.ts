/**
 * Measures the record index with the kits (M3.3): the ludus types with 2,000 gladiators, both kits
 * on, 200 items, 300 loot tables in chains of ten, each table nesting the next, and 50 shops
 * stocked from them. A table's loop check and a shop's stock check read every table, so an edit to
 * a table or a shop checks all 350 again (lootRelated); an edit to an item checks one. In memory,
 * in Node. The instrument behind the "Record index with kits" reading in ROADMAP.md.
 *
 *   node apps/editor/test/loot-bench.ts
 */
import type { ProjectSource } from '@eb/compiler';
import { FIXTURE_LUDUS, readFixture } from '../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../src/forms/catalog.ts';
import { EMPTY_INDEX, type RecordIndex, updateIndex } from '../src/records/recordIndex.ts';

const GLADIATORS = 2000;
const ITEMS = 200;
const TABLES = 300;
const CHAIN = 10;
const SHOPS = 50;
const encoder = new TextEncoder();
const files = new Map(Object.entries(readFixture(FIXTURE_LUDUS)).map(([path, text]) => [path, encoder.encode(text)]));
const put = (path: string, value: unknown) => files.set(path, encoder.encode(JSON.stringify(value)));

const manifest = JSON.parse(readFixture(FIXTURE_LUDUS)['project.json'] as string);
put('project.json', { ...manifest, kits: ['inventory', 'economy'] });
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
const item = (i: number, value = 10 + (i % 90)) => ({ name: `Item ${i}`, value, tags: [i % 2 ? 'part' : 'food'] });
for (let i = 0; i < ITEMS; i++) put(`records/item/i${i}.json`, item(i));
put('records/resource/credits.json', { name: 'Credits', start: 50, step: 5 });

// Each table draws two items, and all but the last of each chain the next table too.
const table = (t: number, weight = 1) => ({
  name: `Table ${t}`,
  picks: { min: 1, max: 2 },
  entries: [
    { item: `i${t % ITEMS}`, weight },
    { item: `i${(t * 7) % ITEMS}`, weight: 2, count: { min: 1, max: 3 } },
    ...((t + 1) % CHAIN === 0 ? [] : [{ table: `t${t + 1}`, weight: 1 }]),
  ],
});
for (let t = 0; t < TABLES; t++) put(`records/loot-table/t${t}.json`, table(t));
const shop = (s: number, sellsAt = 120) => ({
  name: `Shop ${s}`,
  currency: 'credits',
  'sells-at': sellsAt,
  stock: { table: `t${(s * CHAIN) % TABLES}` },
});
for (let s = 0; s < SHOPS; s++) put(`records/shop/s${s}.json`, shop(s));

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
const problems = [...index.records.values()].reduce((sum, r) => sum + r.problems.length, 0);
if (problems > 0) throw new Error(`The bench's project has ${problems} problems`);
const build = await time(5, () => updateIndex(EMPTY_INDEX, source, catalog, null));

let n = 0;
const edit = (path: string, value: () => unknown) => async () => {
  put(path, value());
  index = await updateIndex(index, source, catalog, [path]);
};
const tableEdit = await time(
  20,
  edit('records/loot-table/t7.json', () => table(7, 1 + (++n % 5))),
);
const shopEdit = await time(
  20,
  edit('records/shop/s3.json', () => shop(3, 100 + (++n % 50))),
);
const itemEdit = await time(
  50,
  edit('records/item/i11.json', () => item(11, 10 + (++n % 50))),
);
const f = (ms: number) => ms.toFixed(1);
console.log(
  `${index.records.size} records: built ${f(build)} ms; a loot table edited ${f(tableEdit)} ms, ` +
    `a shop ${f(shopEdit)} ms, an item ${f(itemEdit)} ms`,
);
