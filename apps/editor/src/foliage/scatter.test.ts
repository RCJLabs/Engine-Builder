import { describe, expect, it } from 'vitest';
import { newGrid, type TerrainGrid } from '../terrain/grid.ts';
import { type ChunkPlants, PLANT_FLOATS, scatterAll, scatterChunk, scatterOf } from './scatter.ts';

const LAYERS = [{ name: 'Grass', color: '#5f8f3e' }];
/** A flat 129-vertex terrain a metre apart, its first foliage channel painted `weight` everywhere. */
function grid(weight = 255, size = 129): TerrainGrid {
  const g = newGrid({ size, spacing: 1, low: -10, high: 40, layers: LAYERS });
  for (let v = 0; v < size * size; v++) g.foliage[v * 4] = weight;
  return g;
}
const pines = (more = {}) => scatterOf('pines', 0, { model: 'kit-pine', density: 2, ...more });

/** Every plant as "x,z" to the centimetre, over every chunk. */
const spots = (chunks: Map<string, ChunkPlants>) =>
  [...chunks.values()].flatMap((c) =>
    Array.from({ length: c.count }, (_, n) => {
      const at = n * PLANT_FLOATS;
      return `${(c.data[at] as number).toFixed(2)},${(c.data[at + 2] as number).toFixed(2)}`;
    }),
  );
const count = (chunks: Map<string, ChunkPlants>) => [...chunks.values()].reduce((n, c) => n + c.count, 0);

describe('the scatter', () => {
  it('stands the same plants every time, about density per 100 m² where painted fully', () => {
    const g = grid();
    const once = scatterAll(g, pines());
    expect(spots(once.chunks)).toEqual(spots(scatterAll(g, pines()).chunks));
    // 128 m a side, 2 per 100 m²: about 328.
    expect(count(once.chunks)).toBeGreaterThan(300);
    expect(count(once.chunks)).toBeLessThan(356);
    expect(once.capped).toBe(false);
  });

  it('only adds plants as more is painted, and only takes them as less is', () => {
    const half = new Set(spots(scatterAll(grid(128), pines()).chunks));
    const full = new Set(spots(scatterAll(grid(255), pines()).chunks));
    expect(half.size).toBeGreaterThan(100);
    expect(half.size).toBeLessThan(full.size);
    for (const spot of half) expect(full.has(spot)).toBe(true);
    expect(count(scatterAll(grid(0), pines()).chunks)).toBe(0);
  });

  it('gives another foliage type, by its id, plants of its own', () => {
    const g = grid();
    const other = scatterOf('firs', 0, { model: 'kit-pine', density: 2 });
    const a = new Set(spots(scatterAll(g, pines()).chunks));
    const shared = spots(scatterAll(g, other).chunks).filter((spot) => a.has(spot));
    expect(shared.length).toBeLessThan(5);
  });

  it('reads its own channel of the density, whatever the others hold', () => {
    // Channel 0 full everywhere, channel 1 half: the second type stands as if painted half.
    const g = grid(255);
    for (let v = 0; v < 129 * 129; v++) g.foliage[v * 4 + 1] = 128;
    const second = scatterOf('pines', 1, { model: 'kit-pine', density: 2 });
    expect(spots(scatterAll(g, second).chunks)).toEqual(spots(scatterAll(grid(128), pines()).chunks));
  });

  it('scatters a chunk alone as the whole scatters it', () => {
    const g = grid();
    const all = scatterAll(g, pines({ density: 20 }));
    for (const [ci, cj] of [
      [0, 0],
      [1, 2],
      [3, 3],
    ] as const) {
      const alone = scatterChunk(g, pines({ density: 20 }), ci, cj);
      expect(Array.from(alone.data)).toEqual(Array.from(all.chunks.get(`${ci},${cj}`)?.data ?? []));
    }
    // Every plant stands inside the terrain and in the chunk it is kept by.
    for (const [key, plants] of all.chunks) {
      const [ci, cj] = key.split(',').map(Number) as [number, number];
      for (let n = 0; n < plants.count; n++) {
        const [x, , z] = plants.data.subarray(n * PLANT_FLOATS, n * PLANT_FLOATS + 3);
        expect(Math.floor(((x as number) + 64) / 32)).toBe(Math.min(ci, 3));
        expect(Math.floor(((z as number) + 64) / 32)).toBe(Math.min(cj, 3));
      }
    }
  });

  it('keeps off ground steeper than its steepest, and outside its lowest and highest', () => {
    const g = grid();
    // A ramp rising a metre a metre along x: 45°.
    for (let j = 0; j < g.size; j++) for (let i = 0; i < g.size; i++) g.heights[j * g.size + i] = i * 0.3 - 10;
    expect(count(scatterAll(g, pines({ steepest: 15 })).chunks)).toBe(0);
    expect(count(scatterAll(g, pines({ steepest: 17 })).chunks)).toBeGreaterThan(300);
    // Heights run from −10 at x = −64 to 28.4 at x = 64; between 0 and 10 m is x from about −30.7 to 2.7.
    const banded = scatterAll(g, pines({ lowest: 0, highest: 10 })).chunks;
    expect(count(banded)).toBeGreaterThan(70);
    for (const spot of spots(banded)) {
      const x = Number(spot.split(',')[0]);
      expect(x).toBeGreaterThan(-30.8);
      expect(x).toBeLessThan(2.8);
    }
  });

  it('turns, sizes and leans each plant as its record says', () => {
    const g = grid();
    for (let j = 0; j < g.size; j++) for (let i = 0; i < g.size; i++) g.heights[j * g.size + i] = i * 0.5 - 10;
    const plants = [
      ...scatterAll(g, scatterOf('rocks', 0, { model: 'r', lean: 1, smallest: 1, largest: 2 }, 2)).chunks.values(),
    ];
    const upright = [...scatterAll(g, scatterOf('rocks', 0, { model: 'r', turn: false, lean: 0 })).chunks.values()];
    const first = plants[0] as ChunkPlants;
    for (let n = 0; n < first.count; n++) {
      const [, , , yaw, size, ux, uy, uz] = first.data.subarray(n * PLANT_FLOATS, (n + 1) * PLANT_FLOATS);
      expect(size).toBeGreaterThanOrEqual(2);
      expect(size).toBeLessThanOrEqual(4);
      expect(yaw).toBeGreaterThanOrEqual(0);
      expect(yaw).toBeLessThan(2 * Math.PI);
      // Square to a ground rising 0.5 a metre along x: the normal (−0.5, 1, 0), made a unit.
      expect(ux).toBeCloseTo(-0.4472, 3);
      expect(uy).toBeCloseTo(0.8944, 3);
      expect(uz).toBeCloseTo(0, 5);
    }
    const plain = upright[0] as ChunkPlants;
    expect(Array.from(plain.data.subarray(3, 4))).toEqual([0]);
    expect(Array.from(plain.data.subarray(5, 8))).toEqual([0, 1, 0]);
  });

  it('stops at its most, and says so', () => {
    const g = grid();
    const all = scatterAll(g, pines({ density: 100 }), 1000);
    expect(count(all.chunks)).toBe(1000);
    expect(all.capped).toBe(true);
  });
});
