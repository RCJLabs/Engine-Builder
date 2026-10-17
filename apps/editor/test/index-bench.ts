/**
 * Measures the record index and the table on a big project: the ludus types with 2,000
 * gladiators, as form-bench.ts has them. Building the index checks every record; an edit checks
 * one; deleting a school that 1,000 gladiators name checks those 1,000 again. Then the table's
 * rows, a search and a sort over all of them. In memory, in Node: reading files from OPFS in a
 * browser adds its own time. The instrument behind the "Records table" readings in ROADMAP.md.
 *
 *   node apps/editor/test/index-bench.ts
 */
import type { ProjectSource } from '@eb/compiler';
import { FIXTURE_LUDUS, readFixture } from '../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../src/forms/catalog.ts';
import { namesOf } from '../src/records/names.ts';
import { EMPTY_INDEX, type RecordIndex, updateIndex } from '../src/records/recordIndex.ts';
import { columnsOf, rowsOf } from '../src/records/table.ts';
import { viewRows } from '../src/records/view.ts';
import { DEFAULT_VIEW } from '../src/records/viewState.ts';

const GLADIATORS = 2000;
const encoder = new TextEncoder();
const files = new Map(Object.entries(readFixture(FIXTURE_LUDUS)).map(([path, text]) => [path, encoder.encode(text)]));
const gladiator = (i: number, might = i % 101) => ({
  name: `Gladiator ${i}`,
  might,
  style: 'murmillo',
  school: i % 2 ? 'ludus-magnus' : 'ludus-dacicus',
  free: false,
  skills: ['feint', 'shield wall'],
  kit: { gladius: 1 },
  record: { wins: i % 30, losses: i % 7 },
  fights: 'arena.day and not crowd.angry',
});
const path = (i: number) => `records/gladiator/g${i}.json`;
for (let i = 0; i < GLADIATORS; i++) files.set(path(i), encoder.encode(JSON.stringify(gladiator(i))));
const source: ProjectSource = {
  files: async (dir) => [...files.keys()].filter((p) => dir === '' || p.startsWith(`${dir}/`)),
  read: async (p) => files.get(p),
};

const median = (times: number[]) => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? 0;
async function time(runs: number, run: () => Promise<unknown> | unknown): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await run();
    times.push(performance.now() - t0);
  }
  return median(times);
}

let catalog = await readCatalog(source);
let index: RecordIndex = await updateIndex(EMPTY_INDEX, source, catalog, null);
const build = await time(5, () => updateIndex(EMPTY_INDEX, source, catalog, null));

let n = 0;
const edit = await time(50, async () => {
  files.set(path(7), encoder.encode(JSON.stringify(gladiator(7, ++n % 100))));
  index = await updateIndex(index, source, catalog, [path(7)]);
});

const MAGNUS = 'records/school/ludus-magnus.json';
const magnus = files.get(MAGNUS) as Uint8Array;
const users = await time(5, async () => {
  files.delete(MAGNUS);
  catalog = await readCatalog(source);
  index = await updateIndex(index, source, catalog, [MAGNUS]);
  files.set(MAGNUS, magnus);
  catalog = await readCatalog(source);
  index = await updateIndex(index, source, catalog, [MAGNUS]);
});
const problems = [...index.records.values()].reduce((sum, r) => sum + r.problems.length, 0);
if (problems > 0) throw new Error(`the project should be clean again, has ${problems} problems`);

const columns = columnsOf(catalog.types.get('gladiator')?.file);
const nameOf = namesOf(index, catalog);
const rows = rowsOf(index, catalog, 'gladiator', nameOf);
const rowsTime = await time(20, () => rowsOf(index, catalog, 'gladiator', nameOf));
const searchTime = await time(20, () => viewRows(rows, columns, { ...DEFAULT_VIEW, search: 'gladiator 19' }));
const sortTime = await time(20, () =>
  viewRows(rows, columns, { ...DEFAULT_VIEW, sort: { column: 'field:might', descending: true } }),
);

console.log(
  `${index.records.size} records: index built in ${build.toFixed(1)} ms (median of 5), ` +
    `one record edited in ${edit.toFixed(2)} ms (median of 50), ` +
    `a school 1,000 records name deleted and restored in ${users.toFixed(1)} ms (median of 5); ` +
    `${rows.length} rows built in ${rowsTime.toFixed(1)} ms, searched in ${searchTime.toFixed(1)} ms, ` +
    `sorted by might in ${sortTime.toFixed(1)} ms (medians of 20)`,
);
