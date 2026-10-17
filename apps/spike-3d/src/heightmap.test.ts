import { fnv1a64 } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { extentOf, heightAt, makeHeightmap, PEAK } from './heightmap.ts';
import { terrainMesh } from './scene.ts';

const fingerprint = (heights: Float32Array) => fnv1a64(Array.from(heights).join(','));

describe('makeHeightmap', () => {
  it('makes the same terrain from the same seed, and another from another', () => {
    const map = makeHeightmap('spike-3d');
    expect(makeHeightmap('spike-3d').heights).toEqual(map.heights);
    expect(fingerprint(makeHeightmap('elsewhere').heights)).not.toBe(fingerprint(map.heights));
  });

  // The scene every reading is taken on. If this changes, readings from before and after it
  // measure different scenes: say so in ROADMAP's Readings in the same change.
  it('keeps the terrain the readings are taken on', () => {
    const map = makeHeightmap('spike-3d');
    expect([map.size, map.spacing, extentOf(map)]).toEqual([256, 2, 255]);
    expect(fingerprint(map.heights)).toBe('907204cb125bbb89');
  });

  it('stays between zero and the peak, with valleys and hills', () => {
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (const h of makeHeightmap('spike-3d').heights) {
      low = Math.min(low, h);
      high = Math.max(high, h);
    }
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThanOrEqual(PEAK);
    expect(high - low).toBeGreaterThan(PEAK / 4);
  });

  it('refuses a size that is not a whole number of at least 2', () => {
    for (const size of [1, 2.5, Number.NaN]) expect(() => makeHeightmap('x', size)).toThrow(RangeError);
  });
});

describe('heightAt', () => {
  it('lies on the triangles scene.ts draws, whichever of a cell’s two holds the point', () => {
    const map = makeHeightmap('triangles', 9, 1.5);
    const geometry = terrainMesh(map).geometry;
    const position = geometry.getAttribute('position');
    const index = Array.from(geometry.getIndex()?.array ?? []);
    expect(index).toHaveLength(8 * 8 * 6);
    const gaps: number[] = [];
    for (let t = 0; t < index.length; t += 3) {
      const corners = index.slice(t, t + 3).map((i) => [position.getX(i), position.getY(i), position.getZ(i)]);
      for (const weights of [
        [1 / 3, 1 / 3, 1 / 3],
        [0.6, 0.2, 0.2],
        [0.2, 0.6, 0.2],
        [0.2, 0.2, 0.6],
      ]) {
        const [x, y, z] = [0, 1, 2].map((axis) =>
          weights.reduce((sum, w, c) => sum + w * (corners[c]?.[axis] ?? 0), 0),
        );
        gaps.push(Math.abs(heightAt(map, x as number, z as number) - (y as number)));
      }
    }
    expect(Math.max(...gaps)).toBeLessThan(1e-9);
  });

  it('is the vertex height at each vertex', () => {
    const map = makeHeightmap('vertices', 5, 3);
    const extent = extentOf(map);
    for (let z = 0; z < map.size; z++) {
      for (let x = 0; x < map.size; x++) {
        const at = heightAt(map, x * map.spacing - extent, z * map.spacing - extent);
        expect(at).toBeCloseTo(map.heights[z * map.size + x] as number, 12);
      }
    }
  });

  it('holds the nearest edge outside the terrain', () => {
    const map = makeHeightmap('edges', 5, 3);
    const extent = extentOf(map);
    expect(heightAt(map, -extent - 50, -extent - 50)).toBe(map.heights[0]);
    expect(heightAt(map, extent + 50, extent + 50)).toBe(map.heights[map.heights.length - 1]);
    expect(heightAt(map, 0, extent + 50)).toBe(heightAt(map, 0, extent));
  });
});
