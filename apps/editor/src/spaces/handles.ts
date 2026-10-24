/**
 * Where each of the gizmo's handles sits and which one a pointer is on (M5.1). Hit areas are
 * measured on the screen, REACH either side of a handle's line or point, so each is 44 px across
 * whatever the gizmo looks like; the nearest handle wins where two reach.
 */
import { AXES, type Handle, handleName, type Mode } from './gizmoMath.ts';
import { add, type Quat, rotate, sub, times, type Vec3 } from './vec.ts';

export type Screen = readonly [number, number];
/** A world point on the screen in CSS pixels, or null behind the camera. */
export type Project = (point: Vec3) => Screen | null;

/** Half of 44 px. */
export const REACH = 22;

/** The gizmo's proportions, as fractions of its size: what draws it uses the same. */
export const SHAPE = { arrowFrom: 0.25, square: 0.35, ring: 0.85, rim: 48 } as const;

export interface HandleShape {
  readonly handle: Handle;
  /** One point, or the line through these points. */
  readonly points: readonly Vec3[];
  /** A ring: its line closes. */
  readonly closed?: true;
}

const others = (axis: number): [number, number] => [(axis + 1) % 3, (axis + 2) % 3];

/** The handles of a mode around `pivot`, `size` metres long, along `axes` (the world's, or one object's own). */
export function shapesOf(mode: Mode, pivot: Vec3, size: number, axes: readonly Vec3[] = AXES): HandleShape[] {
  const along = (axis: number, k: number) => add(pivot, times(axes[axis] as Vec3, k * size));
  const each = [0, 1, 2] as const;
  if (mode === 'move') {
    return [
      ...each.map((axis) => ({
        handle: { kind: 'move', axis } as const,
        points: [along(axis, SHAPE.arrowFrom), along(axis, 1)],
      })),
      ...each.map((axis) => {
        const [u, v] = others(axis);
        const corner = add(times(axes[u] as Vec3, SHAPE.square * size), times(axes[v] as Vec3, SHAPE.square * size));
        return { handle: { kind: 'plane', axis } as const, points: [add(pivot, corner)] };
      }),
    ];
  }
  if (mode === 'turn') {
    return each.map((axis) => {
      const [u, v] = others(axis);
      const points = Array.from({ length: SHAPE.rim }, (_, i) => {
        const angle = (2 * Math.PI * i) / SHAPE.rim;
        const rim = add(times(axes[u] as Vec3, Math.cos(angle)), times(axes[v] as Vec3, Math.sin(angle)));
        return add(pivot, times(rim, SHAPE.ring * size));
      });
      return { handle: { kind: 'turn', axis } as const, points, closed: true as const };
    });
  }
  return [
    ...each.map((axis) => ({ handle: { kind: 'scale', axis } as const, points: [along(axis, 1)] })),
    { handle: { kind: 'scale-all' }, points: [pivot] },
  ];
}

/** An object's own axes, for the scale gizmo with one object chosen. */
export const ownAxes = (turn: Quat): Vec3[] => AXES.map((a) => rotate(turn, a));

function toSegment(p: Screen, a: Screen, b: Screen): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const span = dx * dx + dy * dy;
  const t = span === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / span));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** How far `pointer` is from a handle on the screen, or Infinity when it is out of sight. */
export function screenDistance(shape: HandleShape, project: Project, pointer: Screen): number {
  const seen = shape.points.map(project);
  if (seen.some((p) => p === null)) return Number.POSITIVE_INFINITY;
  const points = seen as Screen[];
  const first = points[0] as Screen;
  if (points.length === 1) return Math.hypot(pointer[0] - first[0], pointer[1] - first[1]);
  const line = shape.closed ? [...points, first] : points;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < line.length; i++)
    best = Math.min(best, toSegment(pointer, line[i - 1] as Screen, line[i] as Screen));
  return best;
}

/** The handle within REACH of `pointer`, the nearest if several are. */
export function hitHandle(shapes: readonly HandleShape[], project: Project, pointer: Screen): Handle | null {
  let best: { handle: Handle; distance: number } | null = null;
  for (const shape of shapes) {
    const distance = screenDistance(shape, project, pointer);
    if (distance <= REACH && (!best || distance < best.distance)) best = { handle: shape.handle, distance };
  }
  return best?.handle ?? null;
}

export interface Grip {
  readonly name: string;
  /** Where to take hold of it, on the screen. */
  readonly at: Screen;
  /** Which way its axis, or its ring, runs on the screen there: a unit vector. */
  readonly along: Screen;
}

const towards = (from: Screen | null, to: Screen | null): Screen => {
  if (!from || !to) return [1, 0];
  const size = Math.hypot(to[0] - from[0], to[1] - from[1]);
  return size === 0 ? [1, 0] : [(to[0] - from[0]) / size, (to[1] - from[1]) / size];
};

/**
 * Where to take hold of each handle, for the e2e (window.__ebViewport): the spot along it farthest
 * from every other handle, so a press there is on that handle alone, among the spots `seen` says
 * the view shows.
 */
export function gripsOf(
  shapes: readonly HandleShape[],
  project: Project,
  pivot: Vec3,
  seen: (at: Screen) => boolean = () => true,
): Grip[] {
  return shapes.flatMap((shape, index) => {
    const spots = candidates(shape);
    let best: { at: Screen; spot: number; room: number } | null = null;
    spots.forEach((point, spot) => {
      const at = project(point);
      if (!at || !seen(at)) return;
      const room = Math.min(
        ...shapes.filter((_, i) => i !== index).map((other) => screenDistance(other, project, at)),
        Number.POSITIVE_INFINITY,
      );
      if (!best || room > best.room) best = { at, spot, room };
    });
    if (!best) return [];
    const { at, spot } = best;
    return [{ name: handleName(shape.handle), at, along: alongOf(shape, spot, spots, project, pivot) }];
  });
}

function candidates(shape: HandleShape): Vec3[] {
  if (shape.points.length === 1) return [shape.points[0] as Vec3];
  if (shape.closed) return [...shape.points];
  const [from, to] = shape.points as [Vec3, Vec3];
  return Array.from({ length: 9 }, (_, i) => add(from, times(sub(to, from), 0.2 + (0.8 * i) / 8)));
}

function alongOf(shape: HandleShape, spot: number, spots: Vec3[], project: Project, pivot: Vec3): Screen {
  const { handle } = shape;
  if (handle.kind === 'scale-all') return [0, -1];
  if (shape.closed) {
    const prev = spots[(spot - 1 + spots.length) % spots.length] as Vec3;
    const next = spots[(spot + 1) % spots.length] as Vec3;
    return towards(project(prev), project(next));
  }
  if (handle.kind === 'plane') return towards(project(pivot), project(spots[0] as Vec3));
  const point = spots[spot] as Vec3;
  return towards(project(pivot), project(point));
}
