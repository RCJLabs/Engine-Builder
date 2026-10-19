/**
 * Measures the record index with the events kit (M3.7): the ludus types with 2,000 gladiators,
 * 100 events of three choices, the second rolling two outcomes with a consequence in one, 10
 * decks of 10 events, and 100 sheets of 10 rows, each row reading a choice made and booking a
 * consequence that opens an event. A condition naming a choice is checked against its event's
 * (E041), so an edit to an event checks every record naming an event again (eventRelated). In
 * memory, in Node. The instrument behind the "Record index with the events kit" reading in
 * ROADMAP.md.
 *
 *   node apps/editor/test/events-bench.ts
 */
import type { ProjectSource } from '@eb/compiler';
import { FIXTURE_LUDUS, readFixture } from '../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../src/forms/catalog.ts';
import { EMPTY_INDEX, type RecordIndex, updateIndex } from '../src/records/recordIndex.ts';

const GLADIATORS = 2000;
const EVENTS = 100;
const DECKS = 10;
const SHEETS = 100;
const ROWS = 10;
const encoder = new TextEncoder();
const files = new Map(Object.entries(readFixture(FIXTURE_LUDUS)).map(([path, text]) => [path, encoder.encode(text)]));
const put = (path: string, value: unknown) => files.set(path, encoder.encode(JSON.stringify(value)));

const manifest = JSON.parse(readFixture(FIXTURE_LUDUS)['project.json'] as string);
put('project.json', { ...manifest, kits: ['inventory', 'economy', 'time', 'events'] });
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
put('records/resource/scrap.json', { name: 'Scrap', start: 40 });
const opens = (event: number) => ({ effect: 'open-event', event: `e${event % EVENTS}` });
const event = (e: number, third = 'hide') => ({
  name: `Event ${e}`,
  choices: [
    { id: 'pay', label: 'Pay', cost: { scrap: 5 + (e % 10) } },
    {
      id: 'fight',
      label: 'Fight',
      outcomes: [
        { chance: 60, effects: [] },
        { chance: 40, effects: [{ effect: 'later', after: { days: 2 }, do: [opens(e + 1)] }] },
      ],
    },
    { id: third, label: 'Hide' },
  ],
});
for (let e = 0; e < EVENTS; e++) put(`records/event/e${e}.json`, event(e));
for (let d = 0; d < DECKS; d++) {
  put(`records/deck/d${d}.json`, {
    name: `Deck ${d}`,
    recent: 2,
    events: Array.from({ length: 10 }, (_, k) => ({ event: `e${(d * 10 + k) % EVENTS}`, weight: 1 + k })),
  });
}
for (let h = 0; h < SHEETS; h++) {
  const rows = Array.from({ length: ROWS }, (_, r) => ({
    id: `row-${r}`,
    when: { event: 'events/chosen' },
    if: `events.chose(event: e${(h + r) % EVENTS}, choice: ${r % 2 ? 'fight' : 'pay'})`,
    do: [{ effect: 'later', after: { choices: 1 + (r % 3) }, do: [opens(h + r)] }],
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
// The third choice renamed back and forth: every condition naming the event's choices is read again.
const eventEdit = await time(
  20,
  edit('records/event/e3.json', () => event(3, ++n % 2 ? 'duck' : 'hide')),
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
  `${index.records.size} records: built ${f(build)} ms; an event edited ${f(eventEdit)} ms, a gladiator ${f(gladiatorEdit)} ms`,
);
