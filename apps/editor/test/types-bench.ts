/**
 * Measures the type designer's steps on a big project: the ludus types with 2,000 gladiators, as
 * index-bench.ts has them, half of them at each school. Each step reads what it changes and
 * rewrites every record it touches; then the record index follows it. In memory, in Node: reading
 * and writing files in OPFS in a browser adds its own time. The instrument behind the "Type
 * designer" readings in ROADMAP.md.
 *
 *   node apps/editor/test/types-bench.ts
 */
import type { ProjectSource } from '@eb/compiler';
import { FIXTURE_LUDUS, readFixture } from '../../../packages/compiler/test/fixture.ts';
import type { FileChange } from '../src/editing/history.ts';
import { readCatalog } from '../src/forms/catalog.ts';
import { EMPTY_INDEX, updateIndex } from '../src/records/recordIndex.ts';
import { renameFieldChange, setChange } from '../src/types/fieldEdits.ts';
import { changeType, renameRecord, renameType } from '../src/types/typeEdits.ts';

const GLADIATORS = 2000;
const encoder = new TextEncoder();
const files = new Map(Object.entries(readFixture(FIXTURE_LUDUS)).map(([path, text]) => [path, encoder.encode(text)]));
for (let i = 0; i < GLADIATORS; i++) {
  const gladiator = {
    name: `Gladiator ${i}`,
    might: i % 101,
    style: 'murmillo',
    school: i % 2 ? 'ludus-magnus' : 'ludus-dacicus',
    free: false,
    skills: ['feint', 'shield wall'],
    kit: { gladius: 1 },
    record: { wins: i % 30, losses: i % 7 },
    fights: 'arena.day and not crowd.angry',
  };
  files.set(`records/gladiator/g${i}.json`, encoder.encode(JSON.stringify(gladiator, null, 2)));
}
let reads = 0;
const source: ProjectSource = {
  files: async (dir) => [...files.keys()].filter((p) => dir === '' || p.startsWith(`${dir}/`)),
  read: async (p) => {
    reads++;
    return files.get(p);
  },
};

const median = (times: number[]) => [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? 0;
/** The step's median time over `runs`, with how many files it changed and read. */
async function time(runs: number, make: () => Promise<readonly FileChange[]>) {
  const times: number[] = [];
  let changes = 0;
  let read = 0;
  for (let i = 0; i < runs; i++) {
    reads = 0;
    const t0 = performance.now();
    changes = (await make()).length;
    times.push(performance.now() - t0);
    read = reads;
  }
  return `${median(times).toFixed(1)} ms, ${changes} files changed, ${read} read`;
}

const catalog = await readCatalog(source);
const index = await updateIndex(EMPTY_INDEX, source, catalog, null);
const label = await time(21, () => changeType(source, 'gladiator', setChange(['fields', 'might', 'label'], 'Power')));
const field = await time(5, () => changeType(source, 'gladiator', renameFieldChange([], 'might', 'power')));
const type = await time(5, () => renameType(source, 'gladiator', 'fighter'));
const record = await time(5, () => renameRecord(source, 'school', 'ludus-magnus', 'ludus-maximus'));

// The index after a label typed, which checks nothing again, and after a bound, which checks all.
const bench = async (field: Record<string, unknown>) => {
  const type = JSON.parse(new TextDecoder().decode(files.get('types/gladiator.json')));
  type.fields.might = { ...type.fields.might, ...field };
  files.set('types/gladiator.json', encoder.encode(JSON.stringify(type)));
  const next = await readCatalog(source);
  const t0 = performance.now();
  await updateIndex(index, source, next, ['types/gladiator.json']);
  return `${(performance.now() - t0).toFixed(1)} ms`;
};
const afterLabel = await bench({ label: 'Power' });
const afterBound = await bench({ max: 50 });

console.log(`${GLADIATORS + 8} records, in memory, Node ${process.version}, medians:`);
console.log(`  a label typed (one step): ${label}`);
console.log(`  a field renamed: ${field}`);
console.log(`  a type renamed: ${type}`);
console.log(`  a record renamed that ${GLADIATORS / 2} records refer to: ${record}`);
console.log(`  the index after a label: ${afterLabel}; after a bound: ${afterBound}`);
