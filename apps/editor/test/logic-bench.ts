/**
 * Measures the record index with flags and trigger sheets (M3.1): the ludus types with 2,000
 * gladiators, 200 flags and 100 sheets of 10 rows, each row naming four flags. A flag's lint reads
 * every record that names it, so an edit to a sheet or a flag checks all 300 again (flagRelated);
 * an edit to a gladiator checks one. In memory, in Node. The instrument behind the "Trigger
 * sheets" index readings in ROADMAP.md. A whole number after it multiplies the flags and sheets,
 * to see how the time grows.
 *
 *   node apps/editor/test/logic-bench.ts [scale]
 */
import type { ProjectSource } from '@eb/compiler';
import { FIXTURE_LUDUS, readFixture } from '../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../src/forms/catalog.ts';
import { EMPTY_INDEX, type RecordIndex, updateIndex } from '../src/records/recordIndex.ts';

const SCALE = Number(process.argv[2] ?? 1);
const GLADIATORS = 2000;
const FLAGS = 200 * SCALE;
const SHEETS = 100 * SCALE;
const ROWS = 10;
const encoder = new TextEncoder();
const files = new Map(Object.entries(readFixture(FIXTURE_LUDUS)).map(([path, text]) => [path, encoder.encode(text)]));
const put = (path: string, value: unknown) => files.set(path, encoder.encode(JSON.stringify(value)));

const gladiator = (i: number, might = i % 101) => ({
  name: `Gladiator ${i}`,
  might,
  style: 'murmillo',
  school: i % 2 ? 'ludus-magnus' : 'ludus-dacicus',
  free: false,
  skills: ['feint'],
  record: { wins: i % 30, losses: i % 7 },
});
for (let i = 0; i < GLADIATORS; i++) put(`records/gladiator/g${i}.json`, gladiator(i));

// f0 to f99 are on or off; f100 to f199 count from 0 to 10.
const flag = (i: number, name = `Flag ${i}`) => (i < FLAGS / 2 ? { name } : { name, number: { min: 0, max: 10 } });
for (let i = 0; i < FLAGS; i++) put(`records/flag/f${i}.json`, flag(i));

const sheet = (s: number, note = '') => ({
  name: `Sheet ${s}`,
  rows: Array.from({ length: ROWS }, (_, r) => {
    const k = s * ROWS + r;
    return {
      id: `row-${r}`,
      ...(note && { note }),
      when: { event: 'flag/changed', args: { flag: `f${k % FLAGS}` } },
      if: { fact: 'flag.on', args: { flag: `f${(k + 1) % (FLAGS / 2)}` } },
      do: [
        { effect: 'set-flag', flag: `f${(k + 2) % (FLAGS / 2)}`, to: true },
        { effect: 'add-to-flag', flag: `f${FLAGS / 2 + (k % (FLAGS / 2))}`, by: 1 },
      ],
    };
  }),
});
for (let s = 0; s < SHEETS; s++) put(`records/sheet/s${s}.json`, sheet(s));

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
const build = await time(5, () => updateIndex(EMPTY_INDEX, source, catalog, null));
const problems = () => [...index.records.values()].reduce((sum, r) => sum + r.problems.length, 0);
const before = problems();

let n = 0;
const edit = (path: string, value: () => unknown) => async () => {
  put(path, value());
  index = await updateIndex(index, source, catalog, [path]);
};
const sheetEdit = await time(
  20,
  edit('records/sheet/s7.json', () => sheet(7, `note ${++n}`)),
);
const flagEdit = await time(
  20,
  edit('records/flag/f150.json', () => flag(150, `Flag 150, take ${++n}`)),
);
const gladiatorEdit = await time(
  50,
  edit('records/gladiator/g7.json', () => gladiator(7, ++n % 100)),
);
if (problems() !== before) throw new Error(`the edits should leave ${before} problems, left ${problems()}`);

console.log(
  `${index.records.size} records (${FLAGS} flags, ${SHEETS} sheets of ${ROWS} rows), ${before} problems: ` +
    `index built in ${build.toFixed(1)} ms (median of 5); a sheet edited in ${sheetEdit.toFixed(1)} ms ` +
    `and a flag in ${flagEdit.toFixed(1)} ms (medians of 20); a gladiator in ${gladiatorEdit.toFixed(2)} ms (median of 50)`,
);
