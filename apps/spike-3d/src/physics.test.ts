import { describe, expect, it } from 'vitest';
import { extentOf, makeHeightmap } from './heightmap.ts';
import { AGREE, agrees, loadPhysics, probePoints, rapierHeights } from './physics.ts';

describe('rapierHeights', () => {
  it('reads our row-by-row grid column by column', () => {
    const map = { size: 3, spacing: 1, heights: Float32Array.from([0, 1, 2, 10, 11, 12, 20, 21, 22]) };
    expect(Array.from(rapierHeights(map))).toEqual([0, 10, 20, 1, 11, 21, 2, 12, 22]);
  });
});

describe('probePoints', () => {
  it('keeps off edges and the grid’s diagonal, alternating between a cell’s triangles', () => {
    const map = makeHeightmap('spike-3d');
    const extent = extentOf(map);
    const points = probePoints(map);
    expect(points).toHaveLength(64);
    for (const [i, { x, z }] of points.entries()) {
      const fx = (x + extent) / map.spacing;
      const fz = (z + extent) / map.spacing;
      const [tx, tz] = [fx - Math.floor(fx), fz - Math.floor(fz)];
      expect(Math.min(tx, tz, Math.abs(tx + tz - 1))).toBeGreaterThan(0.05);
      expect(tx + tz < 1, `point ${i}`).toBe(i % 2 === 0);
      expect(Math.floor(fx), `point ${i}`).not.toBe(Math.floor(fz));
    }
  });
});

describe('loadPhysics', () => {
  it('stands Rapier on the drawn ground', async () => {
    let now = 0;
    const report = await loadPhysics(makeHeightmap('spike-3d'), () => (now += 5));
    expect(report).toMatchObject({ importMs: 5, initMs: 5, rays: 64, misses: 0 });
    expect(report.worstError).toBeLessThan(AGREE / 10);
    expect(agrees(report)).toBe(true);
  });
});

describe('agrees', () => {
  it('fails on any miss, or a gap past AGREE', () => {
    const report = { importMs: 0, initMs: 0, rays: 64, misses: 0, worstError: AGREE };
    expect(agrees(report)).toBe(true);
    expect(agrees({ ...report, misses: 1, worstError: 0 })).toBe(false);
    expect(agrees({ ...report, worstError: AGREE * 1.01 })).toBe(false);
  });
});
