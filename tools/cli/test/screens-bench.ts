/**
 * Times the hut played through its screens (M4.1): the pack Export game writes, started in the
 * worker's host and stepped by the actions on offer, picked at random, until the season ends. A
 * step is the sim's reduce and the view the page draws from: the facts and conditions the screens
 * name, and the kits' lists. Against the sweep's turn, which reduces and lists the options alone,
 * the difference is what the screens cost. The instrument behind the session reading in ROADMAP.md.
 *
 *   node tools/cli/test/screens-bench.ts [games]
 */
import { join } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import { type Action, Rng } from '@eb/core';
import { playHost } from '@eb/ui/session';
import { folderSource } from '../src/folderSource.ts';

const games = Number(process.argv[2] ?? 200);
const compiled = await compileWithGame(folderSource(join(import.meta.dirname, 'fixtures', 'hut')));
if (!compiled.pack) throw new Error('The hut didn’t compile');
const pack = JSON.parse(JSON.stringify(compiled.pack)) as unknown;

const starts: number[] = [];
const steps: number[] = [];
for (let n = 0; n < games; n++) {
  const host = playHost();
  let at = performance.now();
  const started = host({ id: 0, kind: 'start', pack, seed: `bench:${n}` });
  starts.push(performance.now() - at);
  if (started.kind !== 'started') throw new Error(JSON.stringify(started));
  let view = started.view;
  const rng = Rng.create(`pick:${n}`);
  for (let turn = 1; !view.ended && turn < 500; turn++) {
    const action = view.offered[rng.int(0, view.offered.length - 1)] as Action;
    at = performance.now();
    const step = host({ id: turn, kind: 'act', action });
    steps.push(performance.now() - at);
    if (step.kind !== 'stepped') throw new Error(JSON.stringify(step));
    view = step.view;
  }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)] as number;
console.log(
  `${games} games, ${steps.length} steps: a step's view ${(median(steps) * 1000).toFixed(0)} µs median, ` +
    `${(p95(steps) * 1000).toFixed(0)} µs at the 95th; a start ${median(starts).toFixed(2)} ms median`,
);
