/**
 * Measures the foliage's work in the editor (M5.6, D68) at 129, 257 and 513 vertices a side, on
 * the terrain bench's hill: the whole terrain scattered for the Trees and the Grass presets filled
 * everywhere, with the plants each makes and whether the scatter stopped at its most; one chunk
 * scattered again, as a stroke does; one Plant dab; the density file written and read, with its
 * size; and the plants near a point, as the hook counts them. Medians of N in Node, in memory: the
 * instrument behind the "foliage" readings in ROADMAP.md.
 *
 *   node apps/editor/test/foliage-bench.ts
 */

import { decodePng } from '@eb/export';
import { FOLIAGE_PRESETS } from '@eb/schema';
import { plantsNear } from '../src/foliage/drawing.ts';
import { chunksOf, scatterAll, scatterChunk, scatterOf } from '../src/foliage/scatter.ts';
import { dab } from '../src/terrain/brushes.ts';
import { newGrid, type TerrainGrid } from '../src/terrain/grid.ts';
import { fileOf } from '../src/terrain/terrainEdits.ts';

const N = 9;

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

/** The terrain bench's hill with ridges and noise, every foliage channel filled everywhere. */
function hill(size: number): TerrainGrid {
  const g = newGrid({ size, spacing: 1, low: -20, high: 80, layers: [{ name: 'Grass', color: '#5f8f3e' }] });
  const e = (size - 1) / 2;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const [x, z] = [i - e, j - e];
      const r = Math.hypot(x, z) / e;
      const noise = ((i * 7919 + j * 104729) % 1000) / 1000;
      const h = 60 * Math.exp(-r * r * 3) + 6 * Math.sin(x / 9) * Math.cos(z / 13) + noise * 0.4;
      g.heights[j * size + i] = Math.min(80, Math.max(-20, h));
    }
  }
  g.foliage.fill(255);
  return g;
}

const kib = (n: number) => `${(n / 1024).toFixed(1)} KiB`;
const ms = (n: number) => `${n.toFixed(2)} ms`;
const preset = (id: string) => {
  const found = FOLIAGE_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`No ${id} preset`);
  return { model: found.kitModel, ...found.value };
};

for (const size of [129, 257, 513]) {
  const g = hill(size);
  console.log(`\n${size} × ${size}`);
  ['trees', 'grass'].forEach((id, channel) => {
    const s = scatterOf(`glade-${id}`, channel, preset(id));
    const made = scatterAll(g, s);
    const plants = [...made.chunks.values()].reduce((n, c) => n + c.count, 0);
    const time = median(() => scatterAll(g, s), id === 'grass' && size === 513 ? 5 : N);
    console.log(`  ${id}, all of it: ${ms(time)}, ${plants} plants${made.capped ? ', stopped at its most' : ''}`);
    const { across } = chunksOf(g);
    const middle = Math.floor(across / 2);
    console.log(`  ${id}, one chunk again: ${ms(median(() => scatterChunk(g, s, middle, middle), 21))}`);
    const near = median(() => plantsNear(made.chunks.values(), 0, 8, 30), 21);
    console.log(`  ${id}, plants within 30 m of a point: ${ms(near)}`);
  });
  let x = -40;
  const plant = median(() => {
    dab(g, x, 10, { kind: 'plant', radius: 10, strength: 1, layer: 0, foliage: 0 }, 30);
    x += 0.5;
  }, 81);
  console.log(`  Plant dab, radius 10 m: ${ms(plant)}`);
  const file = fileOf(g, 'foliage');
  console.log(`  density written: ${ms(median(() => fileOf(g, 'foliage')))}, ${kib(file.length)}`);
  console.log(`  density read: ${ms(median(() => decodePng(file)))}`);
}
