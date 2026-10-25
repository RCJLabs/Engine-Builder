/**
 * Bounds snap and Drop as plain functions (M5.10, D72, docs/specs/streaming.md#snapping): a moved
 * box latching onto another's, touching or flush, only within the tolerance and only beside it; the
 * grid taking the axes that didn't latch; and Drop standing a box on what is under it.
 */
import { describe, expect, it } from 'vitest';
import { type Box, dropBy, latch, union } from './bounds.ts';
import { startDrag } from './drag.ts';
import type { Placed } from './gizmoMath.ts';
import type { Vec3 } from './vec.ts';

const box = (min: Vec3, max: Vec3): Box => ({ min, max });
/** The starter kit's floor, 2 × 0.1 × 2 on the ground about the origin; a wall 2 × 2.5 × 0.2. */
const floor = box([-1, 0, -1], [1, 0.1, 1]);
const wallAt = (z: number): Box => box([-1, 0, z - 0.1], [1, 2.5, z + 0.1]);

describe('latch', () => {
  it('puts a wall’s face against the floor’s edge, touching, when it comes within the tolerance', () => {
    const wall = wallAt(3);
    // Dragged 1.85 m towards the floor: its near face at 1.05, 0.05 m from the floor's edge.
    const { delta, latched } = latch(wall, [{ id: 'floor', box: floor }], [0, 0, -1.85], [2], 0.1);
    expect(delta[2]).toBeCloseTo(-1.9, 9);
    expect(latched).toEqual([{ axis: 2, to: 'floor', kind: 'touching' }]);
  });

  it('lines a face up with the same face, flush, whichever is nearer', () => {
    const wall = wallAt(3);
    // Its far face at 0.98: 0.02 from the floor's far edge, flush; touching would be 0.18 away.
    const { delta, latched } = latch(wall, [{ id: 'floor', box: floor }], [0, 0, -2.12], [2], 0.1);
    expect(delta[2]).toBeCloseTo(-2.1, 9);
    expect(latched).toEqual([{ axis: 2, to: 'floor', kind: 'flush' }]);
  });

  it('leaves the move as it is past the tolerance, beside nothing, or on an axis not moved', () => {
    const wall = wallAt(3);
    expect(latch(wall, [{ id: 'floor', box: floor }], [0, 0, -1.7], [2], 0.1).latched).toEqual([]);
    // A floor 5 m off across x isn't beside it.
    const away = box([4, 0, -1], [6, 0.1, 1]);
    expect(latch(wall, [{ id: 'away', box: away }], [0, 0, -1.85], [2], 0.1).latched).toEqual([]);
    expect(latch(wall, [{ id: 'floor', box: floor }], [0, 0, -1.85], [0], 0.1).delta).toEqual([0, 0, -1.85]);
  });

  it('picks the nearest of several, and latches on each axis of a plane on its own', () => {
    const near = box([-1, 0, -3], [1, 0.1, -1]);
    const { delta, latched } = latch(
      box([1.07, 0, -0.5], [2.07, 1, 0.5]),
      [
        { id: 'floor', box: floor },
        { id: 'near', box: near },
      ],
      [0, 0, -0.43],
      [0, 2],
      0.1,
    );
    // x: its left face 0.07 from the floor's right edge, touching; z: its far face, -0.93, 0.07 from -1, flush with the floor.
    expect(delta[0]).toBeCloseTo(-0.07, 9);
    expect(delta[2]).toBeCloseTo(-0.5, 9);
    expect(latched.map((l) => [l.axis, l.to, l.kind])).toEqual([
      [0, 'floor', 'touching'],
      [2, 'floor', 'flush'],
    ]);
  });

  it('joins several chosen objects’ boxes into one', () => {
    expect(union([floor, wallAt(3)])).toEqual(box([-1, 0, -1], [1, 2.5, 3.1]));
    expect(union([])).toBeNull();
  });
});

describe('a drag with boxes', () => {
  const wall: Placed = { id: 'wall', at: [0, 0, 3], turn: [0, 0, 0], scale: [1, 1, 1] };
  const start = (step: number) =>
    startDrag({
      handle: { kind: 'move', axis: 2 },
      pivot: [0, 0, 3],
      axes: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      objects: [wall],
      // Looking down from above, so the ray meets the z axis where it points.
      ray: { origin: [0, 10, 3], dir: [0, -1, 0] },
      screen: [0, 0],
      step,
      boxes: { moving: wallAt(3), others: [{ id: 'floor', box: floor }], tolerance: 0.1 },
    });
  const at = (z: number) => ({ origin: [0, 10, z] as Vec3, dir: [0, -1, 0] as Vec3 });

  it('latches where it comes near, and lands on the grid’s step elsewhere', () => {
    const drag = start(0.5);
    expect(drag.update(at(1.17), [0, 0], true)?.[0]?.at).toEqual([0, 0, 1.1]);
    expect(drag.latched()).toEqual([{ axis: 2, to: 'floor', kind: 'touching' }]);
    expect(drag.update(at(2.3), [0, 0], true)?.[0]?.at).toEqual([0, 0, 2.5]);
    expect(drag.latched()).toEqual([]);
  });

  it('takes its step from the toolbar, and snaps nothing with snap off', () => {
    expect(start(1).update(at(2.3), [0, 0], true)?.[0]?.at).toEqual([0, 0, 2]);
    expect(start(0.25).update(at(2.3), [0, 0], true)?.[0]?.at).toEqual([0, 0, 2.25]);
    const off = start(0.5);
    expect(off.update(at(1.17), [0, 0], false)?.[0]?.at).toEqual([0, 0, 1.17]);
    expect(off.latched()).toEqual([]);
  });
});

describe('dropBy', () => {
  const roof = box([-1, 5, -1], [1, 5.1, 1]);
  it('stands a box on the highest top under it, below its bottom', () => {
    const walls = [wallAt(-0.9), wallAt(0.9)];
    expect(dropBy(roof, [floor, ...walls], null)).toBeCloseTo(-2.5, 9);
    // A box below the floor's top has nothing under it: with no terrain it stands on 0 m.
    expect(dropBy(box([-0.5, -1, -0.5], [0.5, 0, 0.5]), [floor], null)).toBe(1);
  });

  it('else stands it on the terrain’s highest under its corners and middle, else on 0', () => {
    const slope = (x: number) => x;
    expect(dropBy(box([2, 4, 2], [4, 5, 4]), [floor], slope)).toBe(4 - 4);
    expect(dropBy(box([2, 4, 2], [4, 5, 4]), [], () => null)).toBe(-4);
    expect(dropBy(box([2, 4, 2], [4, 5, 4]), [], null)).toBe(-4);
  });
});
