/**
 * Times a game day in the village (M6.3, D75): its pack played through the session as the stage
 * plays it, 2,880 time/elapse of 1.5 s each (a game minute is 3 s at 20x), the smith and the guard
 * re-checked after every one, each arrival said back as the crowd would say it, and an ai/sensed a
 * real second. A step is the sim's reduce and the view the page draws from. The instrument behind
 * the village reading in ROADMAP.md.
 *
 *   node tools/cli/test/village-bench.ts [days]
 */
import { join } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import type { Action } from '@eb/core';
import { openPack, startPlay } from '@eb/ui/session';
import { folderSource } from '../src/folderSource.ts';

const VILLAGE = join(import.meta.dirname, 'fixtures', 'village');
const days = Number(process.argv[2] ?? 5);
const compiled = await compileWithGame(folderSource(VILLAGE));
const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
if (!open.ok) throw new Error(open.message);

const steps: number[] = [];
const sensed: number[] = [];
const wholes: number[] = [];
for (let day = 0; day < days; day++) {
  const play = startPlay(open.opened.setup, `bench:${day}`);
  const take = (action: Action, into: number[]) => {
    const at = performance.now();
    const step = play.act(action);
    into.push(performance.now() - at);
    if (!step.accepted) throw new Error(`${JSON.stringify(action)}: ${JSON.stringify(step.beats)}`);
  };
  const began = performance.now();
  for (let i = 0; i < 2880; i++) {
    take({ type: 'time/elapse', ms: 1500 }, steps);
    if (i % 2 === 1) take({ type: 'ai/sensed', space: 'village', ms: 1000, npcs: {} }, sensed);
    const npcs = (play.state.world as { npcs: Record<string, { goal?: string }> }).npcs;
    for (const [actor, npc] of Object.entries(npcs))
      if (npc.goal !== undefined)
        take(
          {
            type: 'world/npcs-at',
            space: 'village',
            npcs: { [actor]: { feet: [0, 0, 0], yaw: 0, arrived: npc.goal } },
          },
          steps,
        );
  }
  wholes.push(performance.now() - began);
}

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
const median = (xs: number[]) => sorted(xs)[Math.floor(xs.length / 2)] as number;
const p95 = (xs: number[]) => sorted(xs)[Math.floor(xs.length * 0.95)] as number;
const us = (ms: number) => `${(ms * 1000).toFixed(0)} µs`;
console.log(
  `${days} game days: a day ${Math.min(...wholes).toFixed(0)}–${Math.max(...wholes).toFixed(0)} ms (median ${median(wholes).toFixed(0)}); ` +
    `an elapse or an arrival ${us(median(steps))} median, ${us(p95(steps))} at the 95th, over ${steps.length}; ` +
    `an ai/sensed ${us(median(sensed))} median, ${us(p95(sensed))} at the 95th, over ${sensed.length}`,
);
