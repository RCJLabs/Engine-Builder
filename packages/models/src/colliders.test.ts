/**
 * Colliders fitted to a model (M5.5, D67): each shape around every vertex, in the model's own metres
 * through its nodes, rounded to a tenth of a millimetre; a hull of at most 64 corners, the farthest
 * first; a flat model's thickness kept above nothing.
 */
import { HULL_MOST, type Vec3 } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { crateModel, gridArrays, gridModel } from '../test/shapes.ts';
import { fitBox, fitCapsule, fitSphere, modelPositions, round, THINNEST } from './colliders.ts';
import { farthest, fitHull } from './hull.ts';

const points = (...list: number[][]) => new Float32Array(list.flat());
const each = (p: Float32Array, fn: (x: number, y: number, z: number) => void) => {
  for (let i = 0; i < p.length; i += 3) fn(p[i] as number, p[i + 1] as number, p[i + 2] as number);
};

describe('a model’s vertices', () => {
  it('are each mesh’s, through its node’s place, turn and scale', () => {
    const crate = modelPositions(crateModel());
    expect(crate.length).toBe(16 * 3);
    const grid = modelPositions(gridModel());
    // The grid's first vertex is (0, 0, 0): scaled by 2, turned 90° about y, moved to (5, 0, -2).
    expect([...grid.subarray(0, 3)].map(round)).toEqual([5, 0, -2]);
    // Its last, (3.2, y, 3.2), turns to (3.2, y, -3.2) and doubles.
    const last = [...grid.subarray(grid.length - 3)].map(round);
    expect(last[0]).toBeCloseTo(5 + 6.4, 4);
    expect(last[2]).toBeCloseTo(-2 - 6.4, 4);
  });
});

describe('fitted colliders', () => {
  const crate = modelPositions(crateModel());

  it('a box is the points’ bounds', () => {
    expect(fitBox(crate)).toEqual({ shape: 'box', center: [0, 0.75, 0], size: [1, 1.5, 1] });
  });

  it('a box of a flat model is THINNEST thick, and of nothing is THINNEST all round', () => {
    expect(fitBox(points([0, 0, 0], [2, 0, 1]))).toEqual({ shape: 'box', center: [1, 0, 0.5], size: [2, THINNEST, 1] });
    expect(fitBox(new Float32Array())).toEqual({
      shape: 'box',
      center: [0, 0, 0],
      size: [THINNEST, THINNEST, THINNEST],
    });
  });

  it('a sphere holds every point, from the middle of their bounds', () => {
    const sphere = fitSphere(crate);
    expect(sphere.center).toEqual([0, 0.75, 0]);
    each(crate, (x, y, z) => {
      const [cx, cy, cz] = sphere.center as Vec3;
      expect(Math.hypot(x - cx, y - cy, z - cz)).toBeLessThanOrEqual((sphere.radius as number) + 1e-4);
    });
    expect(sphere.radius).toBe(round(Math.hypot(0.5, 0.75, 0.5)));
  });

  it('a capsule holds every point and is no longer than it needs be', () => {
    const capsule = fitCapsule(crate);
    const [cx, cy, cz] = capsule.center as Vec3;
    const r = capsule.radius as number;
    const half = (capsule.height as number) / 2 - r;
    let tightest = Infinity;
    each(crate, (x, y, z) => {
      // Distance from the point to the capsule's middle segment.
      const along = Math.max(-half, Math.min(half, y - cy));
      const d = Math.hypot(x - cx, y - cy - along, z - cz);
      expect(d).toBeLessThanOrEqual(r + 1e-4);
      tightest = Math.min(tightest, r - d);
    });
    // Some point touches it: a capsule a millimetre shorter would leave one out.
    expect(tightest).toBeLessThan(1e-3);
    expect(capsule.radius).toBe(round(Math.SQRT1_2));
  });

  it('a capsule is at least as long as it is wide', () => {
    const flat = fitCapsule(points([-1, 0, 0], [1, 0, 0], [0, 0, 1], [0, 0, -1]));
    expect(flat.height).toBe(2 * (flat.radius as number));
  });

  it('a hull has the corners of what it holds, and only those', () => {
    const hull = fitHull(crate);
    expect(hull.shape).toBe('hull');
    const corners = new Set((hull.points as Vec3[]).map((p) => p.join(',')));
    // The lid's top four and the box's bottom four; the box's top corners are wider than the lid,
    // so they stay too; the lid's bottom four are inside.
    expect(corners.size).toBe(12);
    expect(corners.has('-0.25,1.5,-0.25')).toBe(true);
    expect(corners.has('-0.5,0,-0.5')).toBe(true);
    expect(corners.has('-0.25,1,-0.25')).toBe(false);
  });

  it('a hull keeps at most 64 corners, the farthest first', () => {
    const { positions } = gridArrays(65);
    const ball: number[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      // Every grid point onto a unit sphere: all of them hull corners.
      const u = ((positions[i] as number) / 6.4) * Math.PI;
      const v = ((positions[i + 2] as number) / 6.4) * 2 * Math.PI;
      ball.push(Math.sin(u) * Math.cos(v), Math.cos(u), Math.sin(u) * Math.sin(v));
    }
    const hull = fitHull(new Float32Array(ball));
    expect(hull.points?.length).toBe(HULL_MOST);
  });

  it('farthest picks the point farthest from the middle, then each farthest from those picked', () => {
    const line: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [10, 0, 0],
    ];
    expect(farthest(line, 3)).toEqual([
      [10, 0, 0],
      [0, 0, 0],
      [3, 0, 0],
    ]);
    expect(farthest(line, 9)).toEqual(line);
  });

  it('a flat model’s hull is its box’s corners', () => {
    const hull = fitHull(points([0, 0, 0], [2, 0, 0], [2, 0, 1], [0, 0, 1]));
    expect(new Set((hull.points as Vec3[]).map((p) => p.join(',')))).toEqual(
      new Set([
        '0,-0.005,0',
        '0,0.005,0',
        '0,-0.005,1',
        '0,0.005,1',
        '2,-0.005,0',
        '2,0.005,0',
        '2,-0.005,1',
        '2,0.005,1',
      ]),
    );
  });

  it('rounds to a tenth of a millimetre, and never writes -0', () => {
    expect(round(0.123456)).toBe(0.1235);
    expect(Object.is(round(-0.00001), 0)).toBe(true);
  });
});
