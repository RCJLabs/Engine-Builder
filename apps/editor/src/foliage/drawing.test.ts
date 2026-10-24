import { describe, expect, it } from 'vitest';
import { levelFor, plantsNear } from './drawing.ts';

describe('a chunk’s foliage', () => {
  it('draws the model’s level for its distance, and none past the type’s distance', () => {
    expect(levelFor(5, 60, [0])).toBe(0);
    expect(levelFor(60, 60, [0])).toBe(0);
    expect(levelFor(60.5, 60, [0])).toBe(-1);
    expect(levelFor(14.9, 400, [0, 15, 30, 60])).toBe(0);
    expect(levelFor(15, 400, [0, 15, 30, 60])).toBe(1);
    expect(levelFor(45, 400, [0, 15, 30, 60])).toBe(2);
    expect(levelFor(390, 400, [0, 15, 30, 60])).toBe(3);
  });

  it('counts the plants standing within a radius of a point', () => {
    const plants = {
      count: 3,
      data: Float32Array.from([0, 0, 0, 0, 1, 0, 1, 0, 3, 0, 4, 0, 1, 0, 1, 0, -6, 0, 0, 0, 1, 0, 1, 0]),
    };
    expect(plantsNear([plants], 0, 0, 5)).toBe(2);
    expect(plantsNear([plants], 0, 0, 4.9)).toBe(1);
    expect(plantsNear([plants, plants], -6, 0, 1)).toBe(2);
  });
});
