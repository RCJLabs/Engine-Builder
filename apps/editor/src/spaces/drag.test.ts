import { describe, expect, it } from 'vitest';
import { startDrag } from './drag.ts';
import { AXES, type Placed, type Ray } from './gizmoMath.ts';
import { unit, type Vec3 } from './vec.ts';

const crate: Placed = { id: 'crate', at: [0, 0, 0], turn: [0, 0, 0], scale: [1, 1, 1] };
/** A ray straight down onto the ground at (x, z). */
const down = (x: number, z: number): Ray => ({ origin: [x, 10, z], dir: [0, -1, 0] });
/** A ray from the front, level, at height y and across at x. */
const level = (x: number, y: number): Ray => ({ origin: [x, y, 10], dir: [0, 0, -1] });
const start = (handle: Parameters<typeof startDrag>[0]['handle'], ray: Ray, objects = [crate]) =>
  startDrag({ handle, pivot: [0, 0, 0], axes: AXES, objects, ray, screen: [100, 100] });

describe('a drag of the gizmo', () => {
  it('moves along an axis by how far the pointer went along it, landing on the steps', () => {
    const drag = start({ kind: 'move', axis: 0 }, level(0.4, 0.5));
    expect(drag.update(level(1.9, 0.9), [0, 0], true)?.[0]?.at).toEqual([1.5, 0, 0]);
    expect(drag.update(level(1.9, 0.9), [0, 0], false)?.[0]?.at).toEqual([1.5, 0, 0]);
    expect(drag.update(level(-0.3, 3), [0, 0], true)?.[0]?.at).toEqual([-0.5, 0, 0]);
  });

  it('moves on the ground where the ray meets it', () => {
    const drag = start({ kind: 'plane', axis: 1 }, down(0.2, 0.2));
    expect(drag.update(down(2.3, -1.4), [0, 0], true)?.[0]?.at).toEqual([2, 0, -1.5]);
    // A ray along the ground meets it nowhere.
    expect(drag.update({ origin: [0, 0, 10], dir: [0, 0, -1] }, [0, 0], true)).toBeNull();
  });

  it('turns by the angle around the ring, past half way round', () => {
    const drag = start({ kind: 'turn', axis: 1 }, down(1, 0));
    expect(drag.update(down(0, -1), [0, 0], true)?.[0]?.turn).toEqual([0, 90, 0]);
    expect(drag.update(down(-1, 0), [0, 0], true)?.[0]?.turn).toEqual([0, 180, 0]);
    // Past 180 the turn reads as its other way round, -135 for 225.
    const past = drag.update(down(-1, 1), [0, 0], true)?.[0]?.turn;
    expect(past).toEqual([0, -135, 0]);
  });

  it('scales by how far along the axis the pointer is from the pivot, on the object’s own axis', () => {
    const turnedCrate: Placed = { ...crate, turn: [0, 90, 0] };
    // Turned 90° about y, the crate's own x runs along the world's -z.
    const own: Vec3[] = [
      [0, 0, -1],
      [0, 1, 0],
      [1, 0, 0],
    ];
    const drag = startDrag({
      handle: { kind: 'scale', axis: 0 },
      pivot: [0, 0, 0],
      axes: own,
      objects: [turnedCrate],
      ray: down(0, -1),
      screen: [0, 0],
    });
    expect(drag.update(down(0, -2.04), [0, 0], true)?.[0]?.scale).toEqual([2, 1, 1]);
  });

  it('scales all three by the centre block, by how far the pointer rose', () => {
    const drag = start({ kind: 'scale-all' }, down(0, 0));
    expect(drag.update(down(0, 0), [100, -50], true)?.[0]?.scale).toEqual([2, 2, 2]);
    const slant = unit([1, -1, 0]);
    expect(drag.update({ origin: [0, 5, 0], dir: slant }, [100, 250], true)?.[0]?.scale).toEqual([0.5, 0.5, 0.5]);
  });
});
