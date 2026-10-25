/**
 * Bounds snap and Drop (M5.10, D72, docs/specs/streaming.md#snapping), as plain functions: boxes
 * along the world's axes, what is moved latching onto another object's box, touching or flush, and
 * an object stood on what is under it. Three measures the boxes (snapView.ts); this is arithmetic.
 */
import type { Axis } from './gizmoMath.ts';
import type { Vec3 } from './vec.ts';

/** A box along the world's axes. */
export interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Another object's box, by the file's id. */
export interface Boxed {
  readonly id: string;
  readonly box: Box;
}

/** A latch: on which axis, onto whose box, and how: a face against the other's opposite face, or in line with its same face. */
export interface Latch {
  readonly axis: Axis;
  readonly to: string;
  readonly kind: 'touching' | 'flush';
}

/** On screen, how near a face comes to another's before it latches. */
export const LATCH_PX = 12;

export function union(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const pick = (f: (...v: number[]) => number, side: 'min' | 'max', i: number) =>
    f(...boxes.map((b) => b[side][i] as number));
  return {
    min: [pick(Math.min, 'min', 0), pick(Math.min, 'min', 1), pick(Math.min, 'min', 2)],
    max: [pick(Math.max, 'max', 0), pick(Math.max, 'max', 1), pick(Math.max, 'max', 2)],
  };
}

/** How far apart two boxes are along an axis: 0 or less where they overlap. */
const gapOn = (a: Box, b: Box, i: number) =>
  Math.max((a.min[i] as number) - (b.max[i] as number), (b.min[i] as number) - (a.max[i] as number));

/**
 * The move `delta` with what latches: on each axis moved, the nearest face of another box that the
 * moved box's face comes within `tolerance` metres of, touching or flush, among the boxes it is
 * beside on the other two axes (overlapping them, or within `tolerance`). Axes that latch say so.
 */
export function latch(
  moving: Box,
  others: readonly Boxed[],
  delta: Vec3,
  axes: readonly Axis[],
  tolerance: number,
): { readonly delta: Vec3; readonly latched: readonly Latch[] } {
  const out: [number, number, number] = [delta[0], delta[1], delta[2]];
  const latched: Latch[] = [];
  const moved: Box = {
    min: [moving.min[0] + delta[0], moving.min[1] + delta[1], moving.min[2] + delta[2]],
    max: [moving.max[0] + delta[0], moving.max[1] + delta[1], moving.max[2] + delta[2]],
  };
  for (const axis of axes) {
    const [lo, hi] = [moving.min[axis] as number, moving.max[axis] as number];
    let best: { miss: number; delta: number; latch: Latch } | null = null;
    for (const { id, box } of others) {
      const beside = [0, 1, 2].every((i) => i === axis || gapOn(moved, box, i) <= tolerance);
      if (!beside) continue;
      const [min, max] = [box.min[axis] as number, box.max[axis] as number];
      // The moves that put a face of the moved box on a face of this one.
      const ways: [number, Latch['kind']][] = [
        [max - lo, 'touching'],
        [min - hi, 'touching'],
        [min - lo, 'flush'],
        [max - hi, 'flush'],
      ];
      for (const [to, kind] of ways) {
        const miss = Math.abs(to - (delta[axis] as number));
        if (miss <= tolerance && (!best || miss < best.miss)) best = { miss, delta: to, latch: { axis, to: id, kind } };
      }
    }
    if (!best) continue;
    out[axis] = best.delta;
    latched.push(best.latch);
  }
  return { delta: out, latched };
}

/**
 * Where Drop stands a box: on the highest top of the others under its footprint, below its bottom;
 * else on the terrain's highest under its corners and middle, so it is never sunk; else on 0 m.
 * Says how far it moves up or down.
 */
export function dropBy(
  box: Box,
  others: readonly Box[],
  ground: ((x: number, z: number) => number | null) | null,
): number {
  const bottom = box.min[1];
  const under = others.filter((o) => gapOn(box, o, 0) < 0 && gapOn(box, o, 2) < 0 && o.max[1] <= bottom + 1e-6);
  if (under.length > 0) return Math.max(...under.map((o) => o.max[1])) - bottom;
  const [x0, z0, x1, z1] = [box.min[0], box.min[2], box.max[0], box.max[2]];
  const heights = [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
    [(x0 + x1) / 2, (z0 + z1) / 2],
  ].flatMap(([x, z]) => {
    const h = ground?.(x as number, z as number);
    return h === null || h === undefined ? [] : [h];
  });
  return (heights.length > 0 ? Math.max(...heights) : 0) - bottom;
}
