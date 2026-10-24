/**
 * LOD levels (M5.5, D67): a mesh's triangles cut near a ratio by meshoptimizer's simplifier,
 * the same each time, sharing the mesh's vertices.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { gridArrays } from '../test/shapes.ts';
import { floatPositions, lodReady, simplifyIndices } from './lod.ts';

describe('LOD levels', () => {
  beforeAll(() => lodReady);
  const { positions, indices } = gridArrays(33);
  const triangles = indices.length / 3;

  it('keep about the ratio of the triangles, within a fifth over', () => {
    for (const ratio of [0.5, 0.25, 0.1]) {
      const kept = simplifyIndices(indices, positions, 3, ratio).length / 3;
      expect(kept).toBeGreaterThan(0);
      expect(kept).toBeLessThanOrEqual(Math.ceil(triangles * ratio * 1.2));
    }
  });

  it('are the same triangles each time', () => {
    expect(simplifyIndices(indices, positions, 3, 0.25)).toEqual(simplifyIndices(indices, positions, 3, 0.25));
  });

  it('name only vertices the mesh has', () => {
    const count = positions.length / 3;
    expect(simplifyIndices(indices, positions, 3, 0.1).every((i) => i < count)).toBe(true);
  });

  it('keep every triangle at a ratio of 1 or more', () => {
    expect(simplifyIndices(indices, positions, 3, 1)).toEqual(indices);
  });

  it('read quantised positions back as floats, normalised ones divided by 32,767', () => {
    expect([...floatPositions(new Int16Array([32767, -32767, 0]), true)]).toEqual([1, -1, 0]);
    expect([...floatPositions(new Int16Array([3, -4]), false)]).toEqual([3, -4]);
    const floats = new Float32Array([0.5]);
    expect(floatPositions(floats, false)).toBe(floats);
  });
});
