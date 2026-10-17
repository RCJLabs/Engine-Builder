import { fnv1a64 } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { extentOf, heightAt, makeHeightmap } from './heightmap.ts';
import { HIGHEST, LOWEST, PROP_COUNT, placeProps, STEEPEST, slopeAt } from './props.ts';

describe('placeProps', () => {
  const map = makeHeightmap('spike-3d');
  const placements = placeProps(map, 'spike-3d');

  it('plants every tree on the drawn ground, in the band, where it is gentle', () => {
    expect(placements).toHaveLength(PROP_COUNT);
    const extent = extentOf(map);
    const wrong = placements.filter(
      (p) =>
        Math.abs(p.x) > extent ||
        Math.abs(p.z) > extent ||
        p.y !== heightAt(map, p.x, p.z) ||
        p.y < LOWEST ||
        p.y > HIGHEST ||
        slopeAt(map, p.x, p.z) > STEEPEST ||
        p.turn < 0 ||
        p.turn >= 2 * Math.PI ||
        p.scale < 0.7 ||
        p.scale > 1.3,
    );
    expect(wrong).toEqual([]);
  });

  // The forest every reading is taken on; see the terrain's golden in heightmap.test.ts.
  it('plants the same forest from the same seed', () => {
    expect(placeProps(map, 'spike-3d')).toEqual(placements);
    expect(fnv1a64(JSON.stringify(placements))).toBe('d04e0e8edd3b8969');
  });

  it('says so when the ground has too few spots', () => {
    const flat = { size: 4, spacing: 1, heights: new Float32Array(16) };
    expect(() => placeProps(flat, 'x', 10)).toThrow('only 0 of 10 spots found');
  });
});
