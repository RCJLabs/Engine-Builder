/**
 * Measures ink scenes in the record index (M3.11): the dialogue bench's project with its 100 talks
 * written as scenes, each of 8 knots whose choices go on, try a flag or end, and 100 sheets of 10
 * rows reading a line heard and opening a scene's talk. A scene is compiled as it is read, then
 * checked as a talk is, the walk of its paths (W129) among the checks; so an edit to a scene
 * compiles it and checks every record naming a talk again. Also one scene's compile alone. In
 * memory, in Node. The instrument behind the "ink scenes in the record index" reading in
 * ROADMAP.md.
 *
 *   node apps/editor/test/scenes-bench.ts
 */
import type { ProjectSource } from '@eb/compiler';
import { ENGINE_FACTS } from '@eb/schema';
import { FIXTURE_LUDUS, readFixture } from '../../../packages/compiler/test/fixture.ts';
import { compileScene } from '../../../packages/ink/src/index.ts';
import { readCatalog } from '../src/forms/catalog.ts';
import { EMPTY_INDEX, type RecordIndex, updateIndex } from '../src/records/recordIndex.ts';

const GLADIATORS = 2000;
const SCENES = 100;
const KNOTS = 8;
const SHEETS = 100;
const ROWS = 10;
const encoder = new TextEncoder();
const files = new Map(Object.entries(readFixture(FIXTURE_LUDUS)).map(([path, text]) => [path, encoder.encode(text)]));
const put = (path: string, value: unknown) => files.set(path, encoder.encode(JSON.stringify(value)));
const putText = (path: string, text: string) => files.set(path, encoder.encode(text));

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
put('records/flag/tried.json', {});
for (const who of ['marge', 'dex']) put(`records/speaker/${who}.json`, { name: who });

/** Knot k: a line, then choices on to the next knot, trying the flag on to the one after, and ending. */
const knot = (k: number, last: string) =>
  [
    `=== l${k} ===`,
    `Line ${k}, said at some length so the scene reads like one. # speaker: ${k % 2 ? 'dex' : 'marge'}`,
    `{ flag_on("tried"): You tried before. }`,
    `* [Go on.] -> l${(k + 1) % KNOTS}`,
    `* {not flag_on("tried")} [Try it.]`,
    '  # fx: set-flag(flag: tried, to: true)',
    `  It works. -> l${(k + 2) % KNOTS}`,
    `* [Leave.] -> ${last}`,
  ].join('\n');
const scene = (t: number, last = 'END') =>
  [
    `# name: Scene ${t}`,
    'EXTERNAL flag_on(flag)',
    '-> l0',
    ...Array.from({ length: KNOTS }, (_, k) => knot(k, last)),
    '',
  ].join('\n');
put('records/resource/cash.json', { name: 'Cash', start: 20 });
for (let t = 0; t < SCENES; t++) putText(`scenes/t${t}.ink`, scene(t));
for (let h = 0; h < SHEETS; h++) {
  const rows = Array.from({ length: ROWS }, (_, r) => ({
    id: `row-${r}`,
    when: { event: 'dialogue/ended' },
    if: `dialogue.heard(talk: t${(h + r) % SCENES}, line: l${r % KNOTS}) >= 1`,
    do: [{ effect: 'open-talk', talk: `t${(h * ROWS + r) % SCENES}` }],
  }));
  put(`records/sheet/sh${h}.json`, { name: `Sheet ${h}`, rows });
}

const source: ProjectSource = {
  files: async (dir) => [...files.keys()].filter((p) => dir === '' || p.startsWith(`${dir}/`)),
  read: async (p) => files.get(p),
};

const median = (times: number[]) => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? 0;
async function time(runs: number, run: () => unknown): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await run();
    times.push(performance.now() - t0);
  }
  return median(times);
}

const compiled = compileScene(scene(0), { facts: ENGINE_FACTS });
if (compiled.problems.length > 0)
  throw new Error(`The bench's scene has problems: ${JSON.stringify(compiled.problems)}`);
const compile = await time(200, () => compileScene(scene(0), { facts: ENGINE_FACTS }));

const catalog = await readCatalog(source);
let index: RecordIndex = await updateIndex(EMPTY_INDEX, source, catalog, null);
const problems = [...index.records.values()].flatMap((r) => r.problems);
if (problems.length > 0) throw new Error(`The bench's project has problems: ${JSON.stringify(problems.slice(0, 3))}`);
const build = await time(5, () => updateIndex(EMPTY_INDEX, source, catalog, null));

let n = 0;
const edit = (path: string, change: () => void) => async () => {
  change();
  index = await updateIndex(index, source, catalog, [path]);
};
// Leave's divert changed back and forth: the scene compiled again, and every record naming a talk checked.
const sceneEdit = await time(
  20,
  edit('scenes/t3.ink', () => putText('scenes/t3.ink', scene(3, ++n % 2 ? 'l0' : 'END'))),
);
const gladiatorEdit = await time(
  50,
  edit('records/gladiator/g11.json', () =>
    put('records/gladiator/g11.json', {
      name: 'Gladiator 11',
      might: ++n % 101,
      style: 'murmillo',
      school: 'ludus-magnus',
      free: false,
      skills: ['feint'],
      record: { wins: 1, losses: 1 },
    }),
  ),
);
const f = (ms: number) => ms.toFixed(2);
const lines = (compiled.talk as { lines: unknown[] }).lines.length;
console.log(
  `a scene of ${KNOTS} knots, ${lines} lines: compiled ${f(compile)} ms; ${index.records.size} records: built ${f(build)} ms; a scene edited ${f(sceneEdit)} ms, a gladiator ${f(gladiatorEdit)} ms`,
);
