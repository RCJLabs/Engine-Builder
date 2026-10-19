/**
 * Measures the record index with the roster kit (M3.6): the ludus types with 2,000 gladiators,
 * 200 written actors, 20 statuses, 20 recruit templates, 10 halls, one roster with a ladder of
 * three ranks and bonds in three bands, and 100 sheets of 10 rows, each row reading a rank or a
 * bond's band and changing a bond. A condition naming a rank reads the roster, so an edit to the
 * roster checks again every record naming a roster fact, and the statuses its ranks give
 * (rosterRelated); an edit to a recruit template checks every actor and template again
 * (recruitRelated). In memory, in Node. The instrument behind the "Record index with the roster"
 * reading in ROADMAP.md.
 *
 *   node apps/editor/test/roster-bench.ts
 */
import type { ProjectSource } from '@eb/compiler';
import { FIXTURE_LUDUS, readFixture } from '../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../src/forms/catalog.ts';
import { EMPTY_INDEX, type RecordIndex, updateIndex } from '../src/records/recordIndex.ts';

const GLADIATORS = 2000;
const ACTORS = 200;
const STATUSES = 20;
const RECRUITS = 20;
const HALLS = 10;
const SHEETS = 100;
const ROWS = 10;
const encoder = new TextEncoder();
const files = new Map(Object.entries(readFixture(FIXTURE_LUDUS)).map(([path, text]) => [path, encoder.encode(text)]));
const put = (path: string, value: unknown) => files.set(path, encoder.encode(JSON.stringify(value)));

const manifest = JSON.parse(readFixture(FIXTURE_LUDUS)['project.json'] as string);
put('project.json', { ...manifest, kits: ['inventory', 'economy', 'stats', 'roster'] });
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
put('records/stat/fights.json', { name: 'Fights' });
put('records/stat/aim.json', { name: 'Aim', max: 100 });
put('records/resource/credits.json', { name: 'Credits', start: 100 });
for (let s = 0; s < STATUSES; s++) {
  put(`records/status/s${s}.json`, { name: `Status ${s}`, modifiers: [{ stat: 'aim', add: 1 + (s % 5) }] });
}
for (let a = 0; a < ACTORS; a++) put(`records/actor/a${a}.json`, { name: `Actor ${a}`, stats: { aim: 40 + (a % 30) } });
const recruit = (r: number, most = 2) => ({
  name: `Recruit ${r}`,
  actor: `a${r}`,
  names: ['Ketil', 'Asa', 'Bryn', 'Dag'],
  bynames: ['Ash', 'Reed'],
  stats: { aim: { min: 40, max: 60 } },
  traits: [0, 1, 2].map((t) => ({ status: `s${(r + t) % STATUSES}`, chance: 20 + t * 10, fee: { credits: 5 } })),
  most,
  fee: { credits: 30 },
});
for (let r = 0; r < RECRUITS; r++) put(`records/recruit/r${r}.json`, recruit(r));
for (let h = 0; h < HALLS; h++) {
  put(`records/hall/h${h}.json`, {
    name: `Hall ${h}`,
    offers: 2,
    recruits: [0, 1, 2].map((k) => ({ recruit: `r${(h * 2 + k) % RECRUITS}`, weight: 1 + k })),
  });
}
const RANKS = ['green', 'seasoned', 'veteran'];
const BONDS = ['strangers', 'mates', 'brothers'];
const roster = (cap: number) => ({
  name: 'The crew',
  cap,
  start: ['a0', 'a1'],
  ranks: {
    stat: 'fights',
    bands: RANKS.map((id, i) => ({ id, ...(i === 0 ? {} : { from: i * 4, status: `s${i}` }) })),
  },
  bonds: { min: 0, max: 20, bands: BONDS.map((id, i) => ({ id, ...(i === 0 ? {} : { from: i * 5 }) })) },
});
put('records/roster/crew.json', roster(8));
for (let h = 0; h < SHEETS; h++) {
  const rows = Array.from({ length: ROWS }, (_, r) => {
    const a = `a${(h + r) % ACTORS}`;
    const b = `a${(h + r + 1) % ACTORS}`;
    return {
      id: `row-${r}`,
      when: { event: r % 2 ? 'roster/joined' : 'roster/rank-changed' },
      if:
        r % 2
          ? `roster.ranked(${RANKS[r % RANKS.length]}) >= 1`
          : `roster.bond-band(actor: ${a}, with: ${b}) == ${BONDS[r % BONDS.length]}`,
      do: [
        { effect: 'change-bond', actor: a, with: b, by: 1 },
        { effect: 'change-bonds', by: -1 },
      ],
    };
  });
  put(`records/sheet/sh${h}.json`, { name: `Sheet ${h}`, rows });
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
const rosterEdit = await time(
  20,
  edit('records/roster/crew.json', () => roster(8 + (++n % 5))),
);
const recruitEdit = await time(
  20,
  edit('records/recruit/r3.json', () => recruit(3, 1 + (++n % 3))),
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
  `${index.records.size} records: built ${f(build)} ms; the roster edited ${f(rosterEdit)} ms, ` +
    `a recruit template ${f(recruitEdit)} ms, a gladiator ${f(gladiatorEdit)} ms`,
);
