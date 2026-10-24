/**
 * Measures the environment's work in the editor (M5.4, D66): an environment's look worked out
 * from its record, as each change asks; and every drop placed for one frame of falling weather, as
 * the view does each frame while it falls, at the most rain (3,000) and snow (2,000). Medians of N
 * in Node: the instrument behind the "environment" readings in ROADMAP.md. The drawing itself is
 * measured in the browser, by the frames the hook counts.
 *
 *   node apps/editor/test/environment-bench.ts
 */

import { lookOf, MOST } from '../src/environment/look.ts';
import { PRESETS } from '../src/environment/presets.ts';
import { dropAt, seedDrops } from '../src/environment/weather.ts';

const N = 31;

function median(run: () => void, n = N): number {
  const times: number[] = [];
  for (let k = 0; k < n; k++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(n / 2)] as number;
}

const ms = (n: number) => `${n.toFixed(3)} ms`;
const seeds = seedDrops(Math.max(MOST.rain, MOST.snow));
const ends = new Float32Array(MOST.rain * 6);
let seconds = 0;

// Warm up, so the medians time the work rather than the first compile.
for (let k = 0; k < 200; k++) for (const p of PRESETS) lookOf(p.value);

const looks = () => {
  for (const p of PRESETS) lookOf(p.value);
};
console.log(`lookOf, all seven presets: ${ms(median(looks))}`);
for (const kind of ['rain', 'snow'] as const) {
  const count = MOST[kind];
  const frame = () => {
    seconds += 1 / 60;
    for (let i = 0; i < count; i++) {
      const [x, y, z] = dropAt(seeds, i, kind, seconds, [3, 1, -2]);
      ends[i * 6] = x;
      ends[i * 6 + 1] = y;
      ends[i * 6 + 2] = z;
    }
  };
  for (let k = 0; k < 50; k++) frame();
  console.log(`${count} ${kind} drops placed for a frame: ${ms(median(frame))}`);
}
