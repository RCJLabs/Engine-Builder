/**
 * The starter kit's shapes (M5.5, D67): boxes, cylinders and cones (a cone is a cylinder whose top
 * has no width) and one wedge, each a list of flat faces with their own normals, the low-poly look.
 * Every shape is convex, so each face is turned to face away from the shape's middle, whichever
 * way its corners were listed. Sizes are metres; a shape stands on its `at`.
 */

export type Vec3 = readonly [number, number, number];
type Face = readonly Vec3[];

export interface Shape {
  readonly faces: readonly Face[];
  readonly middle: Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** Rounded to a tenth of a millimetre, so the files are the same bytes wherever they are written. */
const fix = (n: number) => Math.round(n * 1e4) / 1e4 + 0;

/** A box `size` across, standing on `at`. */
export function box(size: Vec3, at: Vec3 = [0, 0, 0]): Shape {
  const [w, h, d] = [size[0] / 2, size[1], size[2] / 2];
  const c = (x: number, y: number, z: number): Vec3 => [at[0] + x, at[1] + y, at[2] + z];
  const [a, b, e, f] = [c(-w, 0, -d), c(w, 0, -d), c(w, 0, d), c(-w, 0, d)];
  const [g, k, m, n] = [c(-w, h, -d), c(w, h, -d), c(w, h, d), c(-w, h, d)];
  return {
    faces: [
      [a, b, e, f],
      [g, k, m, n],
      [a, b, k, g],
      [f, e, m, n],
      [a, f, n, g],
      [b, e, m, k],
    ],
    middle: c(0, h / 2, 0),
  };
}

/**
 * A cylinder of `sides` sides, `bottom` and `top` its radii, standing on `at`: a cone when the top
 * is 0. `turn` is where the first corner sits, in degrees round from +x.
 */
export function cylinder(bottom: number, top: number, height: number, sides: number, at: Vec3 = [0, 0, 0], turn = 0) {
  const ring = (r: number, y: number) =>
    Array.from({ length: sides }, (_, i): Vec3 => {
      const a = ((turn + (360 * i) / sides) * Math.PI) / 180;
      return [at[0] + r * Math.cos(a), at[1] + y, at[2] + r * Math.sin(a)];
    });
  const low = ring(bottom, 0);
  const high = ring(top, height);
  const apex: Vec3 = [at[0], at[1] + height, at[2]];
  const faces: Face[] = [low];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    faces.push(
      top > 0
        ? [low[i] as Vec3, low[j] as Vec3, high[j] as Vec3, high[i] as Vec3]
        : [low[i] as Vec3, low[j] as Vec3, apex],
    );
  }
  if (top > 0) faces.push(high);
  return { faces, middle: [at[0], at[1] + height / 2, at[2]] } satisfies Shape;
}

/** A wedge `size` across, rising from nothing at +z to its full height at -z: a ramp. */
export function wedge(size: Vec3, at: Vec3 = [0, 0, 0]): Shape {
  const [w, h, d] = [size[0] / 2, size[1], size[2] / 2];
  const c = (x: number, y: number, z: number): Vec3 => [at[0] + x, at[1] + y, at[2] + z];
  const [a, b, e, f] = [c(-w, 0, -d), c(w, 0, -d), c(w, 0, d), c(-w, 0, d)];
  const [g, k] = [c(-w, h, -d), c(w, h, -d)];
  return {
    faces: [
      [a, b, e, f],
      [a, b, k, g],
      [g, k, e, f],
      [a, f, g],
      [b, e, k],
    ],
    middle: c(0, h / 3, -d / 3),
  };
}

/** The shapes' faces as triangles: positions, normals and indices, each face its own corners. */
export function arrays(shapes: readonly Shape[]) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const { faces, middle } of shapes) {
    for (const face of faces) {
      let corners = [...face];
      let normal = unit(
        cross(sub(corners[1] as Vec3, corners[0] as Vec3), sub(corners[2] as Vec3, corners[0] as Vec3)),
      );
      if (dot(normal, sub(corners[0] as Vec3, middle)) < 0) {
        corners = corners.reverse();
        normal = [-normal[0], -normal[1], -normal[2]];
      }
      const first = positions.length / 3;
      for (const corner of corners) {
        positions.push(fix(corner[0]), fix(corner[1]), fix(corner[2]));
        normals.push(fix(normal[0]), fix(normal[1]), fix(normal[2]));
      }
      for (let i = 1; i + 1 < corners.length; i++) indices.push(first, first + i, first + i + 1);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}
