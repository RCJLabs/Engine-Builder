/**
 * Where Bake map looks from (M6.6, docs/specs/markers.md#baking): a terrain's ground, or the objects'
 * boxes with 4 m round, squared up; high over a terrain, or 2.4 m over the highest spawn point.
 */
import type { SpaceJson } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { CUT_ABOVE_SPAWN, MAP_PIXELS, pixelOf, shotOf } from './shot.ts';

const box = (min: [number, number, number], max: [number, number, number]) => ({ min, max });
const flat: SpaceJson = { name: 'Bothy', objects: [] };

describe('shotOf', () => {
  it('covers the objects with 4 m round, square, cut over the highest spawn point', () => {
    const shot = shotOf(flat, [box([-3, 0, -2], [3, 2.5, 2]), box([5, 0, 0], [6, 1, 1])], [0, 0.4]);
    expect(shot.bounds).toEqual([-7, -8.5, 10, 8.5]);
    expect(shot.top).toBeCloseTo(0.4 + CUT_ABOVE_SPAWN);
    expect(shot.pixels).toBe(MAP_PIXELS);
  });

  it('covers a terrain whole, from over its highest point', () => {
    const terrain = { size: 65, spacing: 1, low: 0, high: 12, layers: [{ name: 'Grass', color: '#7a8b5c' }] };
    const shot = shotOf({ ...flat, terrain } as SpaceJson, [box([0, 0, 0], [1, 20, 1])], [0]);
    expect(shot.bounds).toEqual([-32, -32, 32, 32]);
    expect(shot.top).toBe(30);
  });

  it('puts north at the top of the image', () => {
    const shot = { bounds: [-10, -10, 10, 10] as const, pixels: 1000 };
    expect(pixelOf(shot, 0, 0)).toEqual([500, 500]);
    expect(pixelOf(shot, -10, -10)).toEqual([0, 0]);
    expect(pixelOf(shot, 10, 5)).toEqual([1000, 750]);
  });
});
