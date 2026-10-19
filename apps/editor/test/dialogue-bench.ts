/**
 * Measures the record index with the dialogue kit (M3.8): the ludus types with 2,000 gladiators,
 * 3 speakers, 100 talks of 8 lines, each line with two options, one rolling two outcomes, and 100
 * sheets of 10 rows, each row reading a line heard and opening a talk. A condition naming a line
 * is checked against its talk (E042), and a talk nothing opens is warned of (W123), so an edit to
 * a talk, or to a row naming one, checks every record naming a talk again (talkRelated). In
 * memory, in Node. The instrument behind the "Record index with the dialogue kit" reading in
 * ROADMAP.md.
 *
 *   node apps/editor/test/dialogue-bench.ts
 */
import type { ProjectSource } from '@eb/compiler';
import { FIXTURE_LUDUS, readFixture } from '../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../src/forms/catalog.ts';
import { EMPTY_INDEX, type RecordIndex, updateIndex } from '../src/records/recordIndex.ts';

const GLADIATORS = 2000;
const TALKS = 100;
const LINES = 8;
const SHEETS = 100;
const ROWS = 10;
const encoder = new TextEncoder();
const files = new Map(Object.entries(readFixture(FIXTURE_LUDUS)).map(([path, text]) => [path, encoder.encode(text)]));
const put = (path: string, value: unknown) => files.set(path, encoder.encode(JSON.stringify(value)));

const manifest = JSON.parse(readFixture(FIXTURE_LUDUS)['project.json'] as string);
put('project.json', { ...manifest, kits: ['inventory', 'economy', 'dialogue'] });
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
put('records/resource/cash.json', { name: 'Cash', start: 20 });
for (const who of ['marge', 'ranger', 'dex']) put(`records/speaker/${who}.json`, { name: who });
/** Line l of a talk: an option on to the next line, and one rolling the line after it or the start. */
const line = (l: number, last = 'l0') => ({
  id: `l${l}`,
  speaker: l % 2 ? 'dex' : 'marge',
  text: `Line ${l}.`,
  options: [
    { id: `on-${l}`, label: 'Go on', cost: { cash: 1 + (l % 3) }, next: `l${(l + 1) % LINES}` },
    {
      id: `try-${l}`,
      label: 'Try it',
      outcomes: [
        { chance: 60, effects: [], next: `l${(l + 2) % LINES}` },
        { chance: 40, effects: [], next: last },
      ],
    },
  ],
});
const talk = (t: number, last = 'l0') => ({
  name: `Talk ${t}`,
  speaker: 'ranger',
  starts: [{ if: `dialogue.talked(talk: t${t}) >= 1`, line: 'l1' }, { line: 'l0' }],
  lines: Array.from({ length: LINES }, (_, l) => line(l, last)),
});
for (let t = 0; t < TALKS; t++) put(`records/talk/t${t}.json`, talk(t));
for (let h = 0; h < SHEETS; h++) {
  const rows = Array.from({ length: ROWS }, (_, r) => ({
    id: `row-${r}`,
    when: { event: 'dialogue/ended' },
    if: `dialogue.heard(talk: t${(h + r) % TALKS}, line: l${r % LINES}) >= 1`,
    do: [{ effect: 'open-talk', talk: `t${(h * ROWS + r) % TALKS}` }],
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
// An outcome's line changed back and forth: every condition naming a talk's lines is read again.
const talkEdit = await time(
  20,
  edit('records/talk/t3.json', () => talk(3, ++n % 2 ? 'l1' : 'l0')),
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
  `${index.records.size} records: built ${f(build)} ms; a talk edited ${f(talkEdit)} ms, a gladiator ${f(gladiatorEdit)} ms`,
);
