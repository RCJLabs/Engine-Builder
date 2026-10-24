import { describe, expect, it } from 'vitest';
import {
  alongAxis,
  angleAround,
  factorOfRise,
  metresFor,
  moved,
  onPlane,
  type Placed,
  pivotOf,
  scaled,
  turned,
} from './gizmoMath.ts';
import { snaps, snapTo, tidy } from './snap.ts';
import { quatOfTurn, rotate } from './vec.ts';

const box = (id: string, at: Placed['at'], more: Partial<Placed> = {}): Placed => ({
  id,
  at,
  turn: [0, 0, 0],
  scale: [1, 1, 1],
  ...more,
});

describe('where a pointer’s ray meets', () => {
  it('an axis: the nearest point along it, and nowhere when they run side by side', () => {
    // From above the x axis looking straight down at x = 3.
    expect(alongAxis({ origin: [3, 10, 0], dir: [0, -1, 0] }, [0, 0, 0], [1, 0, 0])).toBeCloseTo(3);
    // A slanted ray passing over x = -2, from a pivot at x = 1: t is -3.
    const dir: [number, number, number] = [0, -Math.SQRT1_2, -Math.SQRT1_2];
    expect(alongAxis({ origin: [-2, 5, 5], dir }, [1, 0, 0], [1, 0, 0])).toBeCloseTo(-3);
    expect(alongAxis({ origin: [0, 1, 0], dir: [1, 0, 0] }, [0, 0, 0], [1, 0, 0])).toBeNull();
  });

  it('a plane: where it crosses, and nowhere along it or behind the camera', () => {
    expect(onPlane({ origin: [2, 5, -1], dir: [0, -1, 0] }, [0, 0, 0], [0, 1, 0])).toEqual([2, 0, -1]);
    expect(onPlane({ origin: [0, 5, 0], dir: [1, 0, 0] }, [0, 0, 0], [0, 1, 0])).toBeNull();
    expect(onPlane({ origin: [0, 5, 0], dir: [0, 1, 0] }, [0, 0, 0], [0, 1, 0])).toBeNull();
  });

  it('a ring: the angle around its axis, counterclockwise looking down the axis', () => {
    expect(angleAround([1, 0, 0], [0, 0, -1], [0, 1, 0])).toBeCloseTo(90);
    expect(angleAround([1, 0, 0], [0, 0, 1], [0, 1, 0])).toBeCloseTo(-90);
    expect(angleAround([1, 0, 0], [-1, 0, 0.0001], [0, 1, 0])).toBeCloseTo(-180, 1);
  });
});

describe('a move', () => {
  it('lands one object on the 0.5 m steps along the axes dragged, and leaves the others', () => {
    const [one] = moved([box('a', [0.3, 1, 2])], [0.9, 0.4, 0], [0], true);
    expect(one?.at).toEqual([1, 1, 2]);
    const [free] = moved([box('a', [0.3, 1, 2])], [0.9, 0.4, 0], [0], false);
    expect(free?.at).toEqual([1.2, 1, 2]);
  });

  it('moves several by whole steps, so each keeps its place beside the others', () => {
    const after = moved([box('a', [0.3, 0, 0]), box('b', [1, 0, 0])], [0.8, 0, 0.2], [0, 2], true);
    expect(after.map((o) => o.at)).toEqual([
      [1.3, 0, 0],
      [2, 0, 0],
    ]);
  });
});

describe('a turn', () => {
  it('turns by whole 15° steps about the pivot, places included', () => {
    const [one] = turned([box('a', [0, 0, 0])], [0, 0, 0], 1, 37, true);
    expect(one?.turn).toEqual([0, 30, 0]);
    const [left, right] = turned([box('a', [-1, 0, 0]), box('b', [1, 0, 0])], [0, 0, 0], 1, 89, true);
    expect(left?.at).toEqual([0, 0, 1]);
    expect(right?.at).toEqual([0, 0, -1]);
    expect(right?.turn).toEqual([0, 90, 0]);
  });

  it('adds to a turn the object has, about the world’s axis', () => {
    const [one] = turned([box('a', [0, 0, 0], { turn: [0, 90, 0] })], [0, 0, 0], 1, -45, true);
    expect(one?.turn).toEqual([0, 45, 0]);
    // About another axis, order counts: yawed 90°, its front faces +x, and a turn about the world's
    // x leaves it there; about its own x, the front would tip down.
    const [tipped] = turned([box('a', [0, 0, 0], { turn: [0, 90, 0] })], [0, 0, 0], 0, 90, true);
    const front = rotate(quatOfTurn(tipped?.turn ?? [0, 0, 0]), [0, 0, 1]);
    expect(front.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([1, 0, 0]);
    const [free] = turned([box('a', [0, 0, 0])], [0, 0, 0], 0, 10.4, false);
    expect(free?.turn).toEqual([10.4, 0, 0]);
  });
});

describe('a scale', () => {
  it('lands each scale on the 0.1 steps, never below 0.1', () => {
    const [one] = scaled([box('a', [0, 0, 0])], [0, 0, 0], 0, 1.77, true);
    expect(one?.scale).toEqual([1.8, 1, 1]);
    const [least] = scaled([box('a', [0, 0, 0])], [0, 0, 0], null, 0.01, true);
    expect(least?.scale).toEqual([0.1, 0.1, 0.1]);
    const [free] = scaled([box('a', [0, 0, 0], { scale: [2, 1, 1] })], [0, 0, 0], null, 1.2345, false);
    expect(free?.scale).toEqual([2.469, 1.235, 1.235]);
  });

  it('spreads several from the pivot as they grow', () => {
    const after = scaled([box('a', [-1, 0, 0]), box('b', [1, 0, 2])], [0, 0, 1], 0, 2, true);
    expect(after.map((o) => o.at)).toEqual([
      [-2, 0, 0],
      [2, 0, 2],
    ]);
  });

  it('grows the centre block by a drag up and shrinks it by one down', () => {
    expect(factorOfRise(150)).toBe(2);
    expect(factorOfRise(-150)).toBe(0.5);
    expect(factorOfRise(0)).toBe(1);
  });
});

describe('the gizmo’s footing', () => {
  it('pivots on the middle of the objects’ places', () => {
    expect(pivotOf([box('a', [0, 0, 0]), box('b', [4, 2, -2]), box('c', [1, 0, 0])])).toEqual([2, 1, -1]);
    expect(pivotOf([])).toEqual([0, 0, 0]);
  });

  it('keeps its size on screen however far the camera is', () => {
    expect(metresFor(100, 10, 90, 1000)).toBeCloseTo(2);
    expect(metresFor(100, 20, 90, 1000)).toBeCloseTo(4);
  });

  it('snaps to the steps, and the other way with Ctrl held', () => {
    expect(snapTo(0.74, 0.5)).toBe(0.5);
    expect(snapTo(0.1 * 3, 0.1)).toBe(0.3);
    expect(tidy(-0.0001)).toBe(0);
    expect(Object.is(tidy(-0.0001), 0)).toBe(true);
    expect([snaps(true, false), snaps(true, true), snaps(false, true), snaps(false, false)]).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });
});
