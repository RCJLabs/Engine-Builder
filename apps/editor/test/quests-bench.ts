/**
 * Measures the record index with the quests kit (M3.9): the ludus types with 2,000 gladiators, 2
 * flags, 100 quests of 6 stages, each stage with an objective done by a flag and leading on, one
 * counted, and a deadline, and 100 sheets of 10 rows, each row reading a stage reached and setting
 * a quest's stage. A condition naming a stage or an objective is checked against its quest (E043),
 * and a quest nothing starts or brings to a stage is warned of (W124, W125), so an edit to a quest,
 * or to a row naming one, checks every record naming a quest again (questRelated). In memory, in
 * Node. The instrument behind the "Record index with the quests kit" reading in ROADMAP.md.
 *
 *   node apps/editor/test/quests-bench.ts
 */
import type { ProjectSource } from '@eb/compiler';
import { FIXTURE_LUDUS, readFixture } from '../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../src/forms/catalog.ts';
import { EMPTY_INDEX, type RecordIndex, updateIndex } from '../src/records/recordIndex.ts';

const GLADIATORS = 2000;
const QUESTS = 100;
const STAGES = 6;
const SHEETS = 100;
const ROWS = 10;
const encoder = new TextEncoder();
const files = new Map(Object.entries(readFixture(FIXTURE_LUDUS)).map(([path, text]) => [path, encoder.encode(text)]));
const put = (path: string, value: unknown) => files.set(path, encoder.encode(JSON.stringify(value)));

const manifest = JSON.parse(readFixture(FIXTURE_LUDUS)['project.json'] as string);
put('project.json', { ...manifest, kits: ['time', 'quests'] });
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
put('records/flag/paid.json', { name: 'Paid' });
put('records/flag/hauls.json', { name: 'Hauls', number: { max: 99 } });
/** Stage s of a quest: an objective done by a flag, leading on, one counted, and a deadline; the last leads nowhere. */
const stage = (s: number, last: number) => ({
  id: `s${s}`,
  log: `Stage ${s}.`,
  objectives: [
    {
      id: `go-${s}`,
      text: 'Go on',
      'done-when': 'flag.on(paid)',
      ...(s + 1 < STAGES ? { next: `s${s + 1}` } : {}),
    },
    { id: `haul-${s}`, text: 'Haul', count: { event: 'flag/changed', args: { flag: 'hauls' }, to: 1 + (s % 3) } },
  ],
  ...(s === last ? {} : { days: 3 }),
});
const quest = (q: number, last = STAGES - 1) => ({
  name: `Quest ${q}`,
  'starts-when': `quests.state(quest: q${(q + 1) % QUESTS}) == done`,
  stages: Array.from({ length: STAGES }, (_, s) => stage(s, last)),
});
for (let q = 0; q < QUESTS; q++) put(`records/quest/q${q}.json`, quest(q));
for (let h = 0; h < SHEETS; h++) {
  const rows = Array.from({ length: ROWS }, (_, r) => ({
    id: `row-${r}`,
    when: { event: 'time/day-started' },
    if: `quests.reached(quest: q${(h + r) % QUESTS}, stage: s${r % STAGES})`,
    do: [
      { effect: 'set-stage', quest: `q${(h * ROWS + r) % QUESTS}`, stage: `s${(r + 1) % STAGES}` },
      { effect: 'set-flag', flag: 'paid', to: r % 2 === 0 },
      { effect: 'add-to-flag', flag: 'hauls', by: 1 },
    ],
  }));
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
// The stage with no deadline moved back and forth: every condition naming a quest's stages is read again.
const questEdit = await time(
  20,
  edit('records/quest/q3.json', () => quest(3, ++n % 2 ? STAGES - 2 : STAGES - 1)),
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
  `${index.records.size} records: built ${f(build)} ms; a quest edited ${f(questEdit)} ms, a gladiator ${f(gladiatorEdit)} ms`,
);
