/**
 * The gizmo's math as plain functions (M5.1, docs/specs/viewport.md#the-gizmo): where a pointer's
 * ray meets an axis, a plane or a ring; what a drag does to the objects it holds, snapped or not;
 * and which handle a pointer is on, measured on the screen, so every hit area is 44 px across
 * however small the handle is drawn.
 */
import { LEAST_SCALE, STEPS, snapTo, tidy } from './snap.ts';
import {
  add,
  cross,
  dot,
  mulQuat,
  type Quat,
  quatOfAxis,
  quatOfTurn,
  rotate,
  sub,
  times,
  turnOfQuat,
  type Vec3,
} from './vec.ts';

export interface Ray {
  readonly origin: Vec3;
  /** A unit vector. */
  readonly dir: Vec3;
}

export interface Transform {
  readonly at: Vec3;
  readonly turn: Vec3;
  readonly scale: Vec3;
}

export interface Placed extends Transform {
  readonly id: string;
}

export type Axis = 0 | 1 | 2;
export const AXES: readonly [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
export const AXIS_NAMES = ['x', 'y', 'z'] as const;

export type Mode = 'move' | 'turn' | 'scale';

/** A handle: an axis's arrow, ring or block, the square on the plane across an axis, or the centre block. */
export type Handle =
  | { readonly kind: 'move' | 'plane' | 'turn' | 'scale'; readonly axis: Axis }
  | { readonly kind: 'scale-all' };

export const handleName = (handle: Handle): string =>
  handle.kind === 'scale-all' ? 'scale-all' : `${handle.kind}-${AXIS_NAMES[handle.axis]}`;

/** The t of the point p + t·a nearest the ray, or null when they run side by side (a is a unit vector). */
export function alongAxis(ray: Ray, p: Vec3, a: Vec3): number | null {
  const w = sub(p, ray.origin);
  const b = dot(a, ray.dir);
  const across = 1 - b * b;
  if (Math.abs(across) < 1e-6) return null;
  return (b * dot(ray.dir, w) - dot(a, w)) / across;
}

/** Where the ray meets the plane through p across n, or null when it runs along it or away. */
export function onPlane(ray: Ray, p: Vec3, n: Vec3): Vec3 | null {
  const facing = dot(n, ray.dir);
  if (Math.abs(facing) < 1e-6) return null;
  const s = dot(n, sub(p, ray.origin)) / facing;
  return s < 0 ? null : add(ray.origin, times(ray.dir, s));
}

/** The angle from u to v around the axis a, in degrees, between -180 and 180. */
export const angleAround = (u: Vec3, v: Vec3, a: Vec3): number =>
  (Math.atan2(dot(a, cross(u, v)), dot(u, v)) * 180) / Math.PI;

/** The middle of the objects' places: their bounds' centre. */
export function pivotOf(objects: readonly Transform[]): Vec3 {
  const mid = (i: number) => {
    const values = objects.map((o) => o.at[i] as number);
    return (Math.min(...values) + Math.max(...values)) / 2;
  };
  return objects.length === 0 ? [0, 0, 0] : [mid(0), mid(1), mid(2)];
}

const tidied = (v: Vec3): Vec3 => [tidy(v[0]), tidy(v[1]), tidy(v[2])];

/**
 * The objects moved by `delta` along `axes`. Snapped, one object lands on the grid's steps; several
 * move by whole steps, so each keeps its place beside the others. An axis `latched` onto another
 * object's box (M5.10) moves by its delta as it is.
 */
export function moved(
  objects: readonly Placed[],
  delta: Vec3,
  axes: readonly Axis[],
  snap: boolean,
  grid: number = STEPS.move,
  latched: readonly Axis[] = [],
): Placed[] {
  const only = objects.length === 1 ? objects[0] : undefined;
  const step = delta.map((d, i) => {
    if (!axes.includes(i as Axis)) return 0;
    if (!snap || latched.includes(i as Axis)) return d;
    if (!only) return snapTo(d, grid);
    const from = only.at[i] as number;
    return snapTo(from + d, grid) - from;
  }) as unknown as Vec3;
  return objects.map((o) => ({ ...o, at: tidied(add(o.at, step)) }));
}

/** The objects turned by `degrees` about a world axis through the pivot; snapped, by whole steps. */
export function turned(objects: readonly Placed[], pivot: Vec3, axis: Axis, degrees: number, snap: boolean): Placed[] {
  const q: Quat = quatOfAxis(AXES[axis], snap ? snapTo(degrees, STEPS.turn) : degrees);
  return objects.map((o) => ({
    ...o,
    at: tidied(add(pivot, rotate(q, sub(o.at, pivot)))),
    turn: tidied(turnOfQuat(mulQuat(q, quatOfTurn(o.turn)))),
  }));
}

/**
 * The objects scaled by `factor` on their own axis `axis`, or on all three; several spread from
 * the pivot along the world's axis as they grow. Snapped, each scale lands on the steps.
 */
export function scaled(
  objects: readonly Placed[],
  pivot: Vec3,
  axis: Axis | null,
  factor: number,
  snap: boolean,
): Placed[] {
  const f = Math.max(factor, 0.01);
  const grows = (i: number) => axis === null || i === axis;
  const least = snap ? LEAST_SCALE : 0.001;
  return objects.map((o) => {
    const scale = o.scale.map((s, i) => {
      const next = grows(i) ? s * f : s;
      return grows(i) ? Math.max(least, snap ? snapTo(next, STEPS.scale) : tidy(next)) : s;
    }) as unknown as Vec3;
    const offset = sub(o.at, pivot).map((v, i) => (grows(i) ? v * f : v)) as unknown as Vec3;
    return { ...o, scale, at: tidied(add(pivot, offset)) };
  });
}

/** The centre block's factor: a drag up grows, down shrinks, doubling every 150 px. */
export const factorOfRise = (risePx: number): number => 2 ** (risePx / 150);

/** How many metres make `pixels` on screen at `distance` from a camera of `fovDeg`, `viewPx` tall. */
export const metresFor = (pixels: number, distance: number, fovDeg: number, viewPx: number): number =>
  (2 * distance * Math.tan((fovDeg * Math.PI) / 360) * pixels) / Math.max(1, viewPx);
