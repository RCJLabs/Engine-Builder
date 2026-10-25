/**
 * What Recast bakes a navmesh from (M6.2, D74, docs/specs/navigation.md#the-navmesh): the still
 * solids as the compiler's navSolids lists them, placed in the world as the walk places them, and the
 * terrain, as one soup of triangles. Each triangle faces out of its solid, the ground's up, as Recast
 * reads a walkable surface from its normal. Plain arithmetic, so Node's tests bake what the editor does.
 */
import type { NavSolid } from '@eb/compiler';
import type { ModelCollider } from '@eb/schema';
import { Vector3 } from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { add, cross, dot, type Quat, quatOfTurn, rotate, sub, times, type Vec3 } from '../spaces/vec.ts';
import type { Ground } from '../walk/physics.ts';
import { colliderSolid, type Frame, modelSolid, type Solid, WORLD_FRAME, within } from '../walk/solids.ts';

export interface Soup {
  readonly positions: number[];
  readonly indices: number[];
}

/** Each listed solid where the walk puts it: the frames composed, the collider sized by them. */
export function bakedSolids(listed: readonly NavSolid[]): Solid[] {
  return listed.flatMap((solid): Solid[] => {
    const frame = solid.frames.reduce<Frame>(
      (parent, f) =>
        within(parent, {
          at: f.at as unknown as Vec3,
          turn: quatOfTurn(f.turn as unknown as Vec3),
          scale: f.scale as unknown as Vec3,
        }),
      WORLD_FRAME,
    );
    if ('collider' in solid) return [colliderSolid(solid.path, frame, solid.shape, solid.collider)];
    const made = modelSolid(solid.path, frame, solid.model as unknown as ModelCollider, solid.scale);
    return made ? [made] : [];
  });
}

/** Adds a triangle facing away from `inside`, as Recast's normal (v1 − v0) × (v2 − v0) reads it. */
function triangle(soup: Soup, a: Vec3, b: Vec3, c: Vec3, inside: Vec3): void {
  const normal = cross(sub(b, a), sub(c, a));
  const middle = times(add(add(a, b), c), 1 / 3);
  const [p, q] = dot(normal, sub(middle, inside)) >= 0 ? [b, c] : [c, b];
  const base = soup.positions.length / 3;
  soup.positions.push(...a, ...p, ...q);
  soup.indices.push(base, base + 1, base + 2);
}

const at = (center: Vec3, turn: Quat, local: Vec3): Vec3 => add(center, rotate(turn, local));

function box(soup: Soup, center: Vec3, turn: Quat, half: Vec3): void {
  const corner = (x: number, y: number, z: number) => at(center, turn, [x * half[0], y * half[1], z * half[2]]);
  const faces: [number, number, number][][] = [
    [
      [-1, 1, -1],
      [1, 1, -1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
    [
      [-1, -1, -1],
      [1, -1, -1],
      [1, -1, 1],
      [-1, -1, 1],
    ],
    [
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
    [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
    ],
    [
      [1, -1, -1],
      [1, 1, -1],
      [1, 1, 1],
      [1, -1, 1],
    ],
    [
      [-1, -1, -1],
      [-1, 1, -1],
      [-1, 1, 1],
      [-1, -1, 1],
    ],
  ];
  for (const face of faces) {
    const [a, b, c, d] = face.map(([x, y, z]) => corner(x, y, z)) as [Vec3, Vec3, Vec3, Vec3];
    triangle(soup, a, b, c, center);
    triangle(soup, a, c, d, center);
  }
}

const AROUND = 8;
const DOWN = 4;

/** A ball, or a capsule with `straight` between its halves: rings of AROUND, DOWN to each pole. */
function rounded(soup: Soup, center: Vec3, turn: Quat, radius: number, straight: number): void {
  const rings: Vec3[][] = [];
  for (let i = 0; i <= DOWN * 2; i++) {
    const tilt = (Math.PI * i) / (DOWN * 2);
    const y = radius * Math.cos(tilt) + (i <= DOWN ? straight : -straight);
    const r = radius * Math.sin(tilt);
    const ring: Vec3[] = [];
    for (let j = 0; j < AROUND; j++) {
      const a = (2 * Math.PI * j) / AROUND;
      ring.push(at(center, turn, [r * Math.cos(a), y, r * Math.sin(a)]));
    }
    rings.push(ring);
    // The straight part between the halves: the same ring again, the other side of the middle.
    if (i === DOWN && straight > 0) rings.push(ring.map((p) => sub(p, rotate(turn, [0, 2 * straight, 0]))));
  }
  for (let i = 0; i + 1 < rings.length; i++) {
    const [top, bottom] = [rings[i] as Vec3[], rings[i + 1] as Vec3[]];
    for (let j = 0; j < AROUND; j++) {
      const k = (j + 1) % AROUND;
      // A pole's ring is one point: a band beside it has one triangle a segment, not two.
      if (i > 0) triangle(soup, top[j] as Vec3, top[k] as Vec3, bottom[k] as Vec3, center);
      if (i + 2 < rings.length) triangle(soup, top[j] as Vec3, bottom[k] as Vec3, bottom[j] as Vec3, center);
    }
  }
}

function hull(soup: Soup, points: readonly Vec3[]): void {
  const inside = times(points.reduce(add, [0, 0, 0] as Vec3), 1 / points.length);
  const made = new ConvexHull().setFromPoints(points.map((p) => new Vector3(...p)));
  for (const face of made.faces) {
    const corners: Vec3[] = [];
    let edge = face.edge;
    do {
      const p = edge.head().point;
      corners.push([p.x, p.y, p.z]);
      edge = edge.next;
    } while (edge !== face.edge);
    for (let i = 1; i + 1 < corners.length; i++)
      triangle(soup, corners[0] as Vec3, corners[i] as Vec3, corners[i + 1] as Vec3, inside);
  }
}

/** The ground's squares, each split from its (i + 1, j) corner to its (i, j + 1) one, as the view draws them. */
function ground(soup: Soup, g: Ground): void {
  const e = ((g.size - 1) * g.spacing) / 2;
  const vertex = (i: number, j: number): Vec3 => [
    i * g.spacing - e,
    g.heights[j * g.size + i] as number,
    j * g.spacing - e,
  ];
  for (let j = 0; j + 1 < g.size; j++) {
    for (let i = 0; i + 1 < g.size; i++) {
      const [a, b, c, d] = [vertex(i, j), vertex(i + 1, j), vertex(i, j + 1), vertex(i + 1, j + 1)];
      // Under each triangle, so each faces up.
      triangle(soup, a, b, c, sub(a, [0, 1, 0]));
      triangle(soup, b, d, c, sub(b, [0, 1, 0]));
    }
  }
}

/** The soup Recast bakes: every solid's surface and the ground's. */
export function soupOf(solids: readonly Solid[], g: Ground | null): Soup {
  const soup: Soup = { positions: [], indices: [] };
  for (const solid of solids) {
    if (solid.kind === 'box') box(soup, solid.center, solid.turn, solid.half);
    else if (solid.kind === 'ball') rounded(soup, solid.center, solid.turn, solid.radius, 0);
    else if (solid.kind === 'capsule') rounded(soup, solid.center, solid.turn, solid.radius, solid.halfHeight);
    else hull(soup, solid.points);
  }
  if (g) ground(soup, g);
  return soup;
}
