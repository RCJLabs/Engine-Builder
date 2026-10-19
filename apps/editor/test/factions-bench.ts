/**
 * Measures the record index with the factions and time kits (M3.5): the ludus types with 2,000
 * gladiators, 20 factions of 4 bands, 50 shops naming them, and 100 sheets of 10 rows, each row
 * reading a faction's band and changing its standing. A condition naming a band reads its faction,
 * so an edit to a faction checks every record naming it again (factionRelated): here 3 shops and
 * 50 sheets, as each sheet's rows name 10 of the 20. An edit to the calendar checks every record
 * again, its units being the grounds of a wait's check. In memory, in Node. The instrument behind
 * the "Record index with factions" reading in ROADMAP.md.
 *
 *   node apps/editor/test/factions-bench.ts
 */
import type { ProjectSource } from '@eb/compiler';
import { FIXTURE_LUDUS, readFixture } from '../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../src/forms/catalog.ts';
import { EMPTY_INDEX, type RecordIndex, updateIndex } from '../src/records/recordIndex.ts';

const GLADIATORS = 2000;
const FACTIONS = 20;
const BANDS = ['hostile', 'wary', 'friendly', 'sworn'];
const SHOPS = 50;
const SHEETS = 100;
const ROWS = 10;
const encoder = new TextEncoder();
const files = new Map(Object.entries(readFixture(FIXTURE_LUDUS)).map(([path, text]) => [path, encoder.encode(text)]));
const put = (path: string, value: unknown) => files.set(path, encoder.encode(JSON.stringify(value)));

const manifest = JSON.parse(readFixture(FIXTURE_LUDUS)['project.json'] as string);
const calendar = (days: number) => ({
  ticksPerDay: 24,
  units: { hours: 1 },
  daysPerYear: days * 4,
  seasons: ['spring', 'summer', 'autumn', 'winter'].map((id, i) => ({ id, from: i * days })),
});
put('project.json', { ...manifest, kits: ['inventory', 'economy', 'factions', 'time'], calendar: calendar(24) });
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
const faction = (f: number, every = 8) => ({
  name: `Faction ${f}`,
  min: -100,
  max: 100,
  bands: BANDS.map((id, b) => ({ id, ...(b === 0 ? {} : { from: -50 + 40 * b }), price: 130 - 10 * b })),
  drift: { every },
});
for (let f = 0; f < FACTIONS; f++) put(`records/faction/f${f}.json`, faction(f));
put('records/resource/silver.json', { name: 'Silver', start: 100 });
for (let s = 0; s < SHOPS; s++) {
  put(`records/shop/s${s}.json`, { name: `Shop ${s}`, currency: 'silver', faction: `f${s % FACTIONS}` });
}
for (let h = 0; h < SHEETS; h++) {
  const rows = Array.from({ length: ROWS }, (_, r) => {
    const f = `f${(h + r * 2) % FACTIONS}`;
    return {
      id: `row-${r}`,
      when: { event: r % 2 ? 'time/day-started' : 'time/season-started' },
      if: `factions.reached(faction: ${f}, band: ${BANDS[r % BANDS.length]})`,
      do: [
        { effect: 'change-standing', faction: f, by: r % 2 ? 1 : -1 },
        { effect: 'wait', hours: 1 + (r % 6) },
      ],
    };
  });
  put(`records/sheet/h${h}.json`, { name: `Sheet ${h}`, rows });
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

let catalog = await readCatalog(source);
let index: RecordIndex = await updateIndex(EMPTY_INDEX, source, catalog, null);
const problems = [...index.records.values()].flatMap((r) => r.problems);
if (problems.length > 0) throw new Error(`The bench's project has problems: ${JSON.stringify(problems.slice(0, 3))}`);
const build = await time(5, () => updateIndex(EMPTY_INDEX, source, catalog, null));

let n = 0;
const edit = (path: string, value: () => unknown) => async () => {
  put(path, value());
  index = await updateIndex(index, source, catalog, [path]);
};
const factionEdit = await time(
  20,
  edit('records/faction/f3.json', () => faction(3, 8 + (++n % 5))),
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
// As the editor does after project.json changes: the catalog read again, then the index.
const calendarEdit = await time(10, async () => {
  put('project.json', {
    ...manifest,
    kits: ['inventory', 'economy', 'factions', 'time'],
    calendar: calendar(24 + (++n % 5)),
  });
  catalog = await readCatalog(source);
  index = await updateIndex(index, source, catalog, ['project.json']);
});
const f = (ms: number) => ms.toFixed(1);
console.log(
  `${index.records.size} records: built ${f(build)} ms; a faction edited ${f(factionEdit)} ms, ` +
    `a gladiator ${f(gladiatorEdit)} ms, the calendar ${f(calendarEdit)} ms`,
);
