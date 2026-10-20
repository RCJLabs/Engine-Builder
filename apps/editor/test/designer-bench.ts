/**
 * Measures the designer's moment (M4.5, D55), as its worker runs it, in Node: the hut compiled
 * without ui/ and its game started (what opening the designer, or a change outside ui/, costs),
 * the Play panel's save of a day rested loaded into it, and a look at the hut screen's wants,
 * which every edit to a screen takes. Rounds alternate nothing, as the worker answers one at a
 * time. The instrument behind the "designer" reading in ROADMAP.md.
 *
 *   node apps/editor/test/designer-bench.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { wantsOf } from '@eb/ui/format';
import { playJobs } from '../src/play/jobs.ts';
import type { SentFile } from '../src/scripts/protocol.ts';

const HUT = resolve(import.meta.dirname, '../../../tools/cli/test/fixtures/hut');
const ROUNDS = 10;
const LOOKS = 200;

const files: SentFile[] = readdirSync(HUT, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => {
    const path = join(entry.parentPath, entry.name);
    return [relative(HUT, path).split('\\').join('/'), new Uint8Array(readFileSync(path))] as SentFile;
  });
const withoutUi = files.filter(([path]) => !path.startsWith('ui/'));
const wants = wantsOf([JSON.parse(readFileSync(join(HUT, 'ui/hut.json'), 'utf8'))]);

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

const play = playJobs();
await play({ id: 1, kind: 'open-files', files });
await play({ id: 2, kind: 'start', seed: '1', saving: { edition: 'playtest' }, at: 0 });
const stepped = await play({ id: 3, kind: 'act', action: { type: 'hut/rest' }, at: 0 });
if (stepped.kind !== 'stepped' || !stepped.save) throw new Error('The hut didn’t step');
const raw = JSON.stringify(stepped.save);

const opens: number[] = [];
const loads: number[] = [];
const looks: number[] = [];
for (let round = 0; round < ROUNDS; round++) {
  const design = playJobs();
  let t = performance.now();
  await design({ id: 1, kind: 'open-files', files: withoutUi });
  await design({ id: 2, kind: 'start', seed: '1', saving: { edition: 'design' }, at: 0 });
  opens.push(performance.now() - t);
  t = performance.now();
  await design({ id: 3, kind: 'load', raw, saving: { edition: 'design' }, at: 0 });
  loads.push(performance.now() - t);
  for (let i = 0; i < LOOKS / ROUNDS; i++) {
    t = performance.now();
    await design({ id: 4 + i, kind: 'look', wants });
    looks.push(performance.now() - t);
  }
}
const ms = (n: number) => `${n.toFixed(2)} ms`;
console.log(`compile without ui/ and start, median of ${ROUNDS}: ${ms(median(opens))}`);
console.log(`load the Play panel's save of a day rested, median of ${ROUNDS}: ${ms(median(loads))}`);
console.log(
  `look at the hut screen's ${wants.facts.length} facts and ${wants.conditions.length} conditions, median of ${looks.length}: ${ms(median(looks))}`,
);
