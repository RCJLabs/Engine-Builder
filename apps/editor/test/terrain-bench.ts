/**
 * Measures the terrain's work in the editor (M5.3, D65) at 257 and 513 vertices a side, on a hill
 * with ridges and fine noise, as a sculpted terrain has: one dab of each brush at radius 8 m; a
 * stroke's file written as it ends (heights and paint encoded) and read again (decoded), with each
 * file's size; one chunk built at each level, the whole terrain at full detail, and the whole
 * terrain at the levels the camera's start gives it, as the view opens it; and the ray onto the
 * ground. Medians of N in Node, in memory: the instrument behind the "terrain" readings in
 * ROADMAP.md.
 *
 *   node apps/editor/test/terrain-bench.ts
 */

import { CHUNK } from '@eb/compiler';
import { decodeGray16, decodePng } from '@eb/export';
import { type Brush, dab } from '../src/terrain/brushes.ts';
import { chunkMesh, chunksPerSide, lodFor, rgbOf } from '../src/terrain/chunks.ts';
import { heightAt, newGrid, type TerrainGrid } from '../src/terrain/grid.ts';
import { groundHit } from '../src/terrain/ray.ts';
import { fileOf } from '../src/terrain/terrainEdits.ts';

const N = 15;
const LAYERS = ['#5f8f3e', '#8a8580', '#c9b27c', '#eef2f5'].map(rgbOf);

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

/** A hill with ridges and noise, painted by height and slope as the fell fixture is. */
function sculpted(size: number): TerrainGrid {
  const g = newGrid({ size, spacing: 1, low: -20, high: 80, layers: [{ name: 'Grass', color: '#5f8f3e' }] });
  const e = (size - 1) / 2;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const [x, z] = [i - e, j - e];
      const r = Math.hypot(x, z) / e;
      const noise = ((i * 7919 + j * 104729) % 1000) / 1000;
      const h = 60 * Math.exp(-r * r * 3) + 6 * Math.sin(x / 9) * Math.cos(z / 13) + noise * 0.4;
      const v = j * size + i;
      g.heights[v] = Math.min(80, Math.max(-20, h));
      const rock = Math.min(255, Math.round(Math.abs(Math.sin(x / 9)) * 200));
      const snow = h > 45 ? Math.min(255 - rock, Math.round((h - 45) * 12)) : 0;
      g.paint.set([255 - rock - snow, rock, 0, snow], v * 4);
    }
  }
  return g;
}

const kib = (n: number) => `${(n / 1024).toFixed(1)} KiB`;
const ms = (n: number) => `${n.toFixed(2)} ms`;

for (const size of [257, 513]) {
  const g = sculpted(size);
  console.log(`\n${size} × ${size}`);
  for (const kind of ['raise', 'lower', 'smooth', 'flatten', 'paint'] as const) {
    const brush: Brush = { kind, radius: 8, strength: 0.5, layer: 2 };
    let x = -40;
    const time = median(() => {
      dab(g, x, 10, brush, 30);
      x += 0.5;
    }, 81);
    console.log(`  ${kind} dab, radius 8 m: ${ms(time)}`);
  }
  const heights = fileOf(g, 'heights');
  const paint = fileOf(g, 'paint');
  console.log(`  heights written: ${ms(median(() => fileOf(g, 'heights')))}, ${kib(heights.length)}`);
  console.log(`  paint written: ${ms(median(() => fileOf(g, 'paint')))}, ${kib(paint.length)}`);
  console.log(`  heights read: ${ms(median(() => decodeGray16(heights)))}`);
  console.log(`  paint read: ${ms(median(() => decodePng(paint)))}`);
  for (const lod of [0, 1, 2, 3]) {
    console.log(`  a chunk at level ${lod}: ${ms(median(() => chunkMesh(g, 1, 1, lod, { east: lod }, LAYERS), 41))}`);
  }
  const n = chunksPerSide(g);
  const whole = median(() => {
    for (let cz = 0; cz < n; cz++) for (let cx = 0; cx < n; cx++) chunkMesh(g, cx, cz, 0, {}, LAYERS);
  }, 5);
  console.log(`  all ${n * n} chunks at level 0: ${ms(whole)}`);
  // The camera where a space opens: 14 m from the origin, turned 35° and looking down 30° (orbit.ts's START).
  const eye = [6.95, 7, 9.93];
  const levels = Array.from({ length: n * n }, (_, k) => {
    const x = ((k % n) + 0.5) * CHUNK - (size - 1) / 2;
    const z = (Math.floor(k / n) + 0.5) * CHUNK - (size - 1) / 2;
    return lodFor(Math.hypot(eye[0] - x, eye[1] - heightAt(g, x, z), eye[2] - z), CHUNK);
  });
  const opened = median(() => {
    for (let k = 0; k < n * n; k++) {
      const [cx, cz] = [k % n, Math.floor(k / n)];
      const near = {
        west: cx > 0 ? levels[k - 1] : undefined,
        east: cx < n - 1 ? levels[k + 1] : undefined,
        north: levels[k - n],
        south: levels[k + n],
      };
      chunkMesh(g, cx, cz, levels[k] as number, near, LAYERS);
    }
  }, 5);
  const counts = [0, 1, 2, 3].map((l) => levels.filter((v) => v === l).length).join(', ');
  console.log(`  all ${n * n} chunks at the start's levels (${counts} at levels 0 to 3): ${ms(opened)}`);
  let k = 0;
  const ray = median(() => {
    k++;
    groundHit(g, [-200 + (k % 50), 150, -200], [1, -0.55, 1]);
  }, 201);
  console.log(`  the ray onto the ground, at a slant across it: ${ms(ray)}`);
}
