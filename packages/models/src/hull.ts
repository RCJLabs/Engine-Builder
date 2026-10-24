/**
 * A convex hull fitted to a model (M5.5, D67): the corners three's ConvexHull finds around every
 * vertex, at most HULL_MOST of them, the farthest first: the corner farthest from the middle, then
 * each time the corner farthest from all those already kept. Corners of the whole hull stay corners
 * of the kept ones' hull, so the physics' hull is inside the model's and touches it at each. A flat
 * model has no hull of its own, so it gets its box's corners.
 */
import { HULL_MOST, type ModelCollider, type Vec3 } from '@eb/schema';
import { Vector3 } from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { fitBox, round } from './colliders.ts';

const at = (points: readonly Vec3[], i: number): Vec3 => points[i] as Vec3;
const gap = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The hull's corners, in a stable order: by x, then y, then z. */
function corners(points: Float32Array): Vec3[] {
  const vectors: Vector3[] = [];
  for (let i = 0; i < points.length; i += 3) {
    vectors.push(new Vector3(points[i] as number, points[i + 1] as number, points[i + 2] as number));
  }
  const hull = new ConvexHull().setFromPoints(vectors);
  const found = new Map<string, Vec3>();
  for (const face of hull.faces) {
    let edge = face.edge;
    do {
      const p = edge.head().point;
      const corner: Vec3 = [round(p.x), round(p.y), round(p.z)];
      found.set(corner.join(','), corner);
      edge = edge.next;
    } while (edge !== face.edge);
  }
  return [...found.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
}

/** At most `most` of `points`, the farthest first, ties to the earlier. */
export function farthest(points: readonly Vec3[], most: number): Vec3[] {
  if (points.length <= most) return [...points];
  const n = points.length;
  const middle: Vec3 = [0, 1, 2].map((c) => points.reduce((s, p) => s + p[c as 0 | 1 | 2], 0) / n) as unknown as Vec3;
  const near = points.map((p) => gap(p, middle));
  const kept: Vec3[] = [];
  for (let k = 0; k < most; k++) {
    let best = 0;
    for (let i = 1; i < n; i++) if ((near[i] as number) > (near[best] as number)) best = i;
    kept.push(at(points, best));
    for (let i = 0; i < n; i++)
      near[i] =
        k === 0
          ? gap(at(points, i), at(points, best))
          : Math.min(near[i] as number, gap(at(points, i), at(points, best)));
    near[best] = -1;
  }
  return kept;
}

const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Whether the corners lie within a tenth of a millimetre of one plane (or a line, or a point). */
function flat(found: readonly Vec3[]): boolean {
  if (found.length < 4) return true;
  const p0 = at(found, 0);
  const p1 = found.reduce((best, p) => (gap(p, p0) > gap(best, p0) ? p : best), p0);
  const area = (p: Vec3) => Math.hypot(...cross(minus(p1, p0), minus(p, p0)));
  const p2 = found.reduce((best, p) => (area(p) > area(best) ? p : best), p0);
  const normal = cross(minus(p1, p0), minus(p2, p0));
  const size = Math.hypot(...normal);
  if (size === 0) return true;
  return found.every((p) => Math.abs(minus(p, p0).reduce((s, v, c) => s + v * (normal[c] as number), 0)) / size < 1e-4);
}

/** A hull of at most HULL_MOST corners around every point; a flat model's box corners. */
export function fitHull(points: Float32Array): ModelCollider {
  let found: Vec3[] = [];
  try {
    found = corners(points);
  } catch {
    // ConvexHull can throw for points that lie on a line.
  }
  if (flat(found)) {
    const box = fitBox(points);
    const [cx, cy, cz] = box.center as Vec3;
    const [sx, sy, sz] = (box.size as Vec3).map((s) => s / 2) as [number, number, number];
    found = [-1, 1].flatMap((x) =>
      [-1, 1].flatMap((y) => [-1, 1].map((z): Vec3 => [round(cx + x * sx), round(cy + y * sy), round(cz + z * sz)])),
    );
  }
  return { shape: 'hull', points: farthest(found, HULL_MOST) };
}
