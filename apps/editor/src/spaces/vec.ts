/**
 * Vectors and turns as plain arrays (M5.1), for the gizmo's drags and the camera: what a file
 * holds is arrays, so the math works on them and three only draws the result. Turns are
 * degrees applied as yaw (y), then pitch (x), then roll (z), as three's Euler order 'YXZ' is.
 */
export type Vec3 = readonly [number, number, number];
/** A unit quaternion as [x, y, z, w]. */
export type Quat = readonly [number, number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const times = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: Vec3): Vec3 => {
  const size = length(a);
  return size === 0 ? [0, 0, 0] : times(a, 1 / size);
};

const RAD = Math.PI / 180;

export function quatOfTurn(turn: Vec3): Quat {
  const [cx, cy, cz] = turn.map((deg) => Math.cos((deg * RAD) / 2)) as [number, number, number];
  const [sx, sy, sz] = turn.map((deg) => Math.sin((deg * RAD) / 2)) as [number, number, number];
  // Euler YXZ, as three's Quaternion.setFromEuler writes it.
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ];
}

/** A quaternion's turn in degrees, YXZ: as three's Euler.setFromRotationMatrix reads its matrix. */
export function turnOfQuat(q: Quat): Vec3 {
  const [x, y, z, w] = q;
  const m11 = 1 - 2 * (y * y + z * z);
  const m13 = 2 * (x * z + y * w);
  const m21 = 2 * (x * y + z * w);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - x * w);
  const m31 = 2 * (x * z - y * w);
  const m33 = 1 - 2 * (x * x + y * y);
  const pitch = Math.asin(-Math.min(1, Math.max(-1, m23)));
  // Pointing straight up or down, yaw and roll turn about one axis: the roll is taken as none.
  if (Math.abs(m23) < 0.9999999) return [pitch / RAD, Math.atan2(m13, m33) / RAD, Math.atan2(m21, m22) / RAD];
  return [pitch / RAD, Math.atan2(-m31, m11) / RAD, 0];
}

export function quatOfAxis(axis: Vec3, degrees: number): Quat {
  const half = (degrees * RAD) / 2;
  const [x, y, z] = times(unit(axis), Math.sin(half));
  return [x, y, z, Math.cos(half)];
}

/** `a` after `b`: b's turn, then a's. */
export function mulQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  // v + 2w(q×v) + 2q×(q×v), with q the quaternion's vector part.
  const t = times(cross([x, y, z], v), 2);
  return add(add(v, times(t, w)), cross([x, y, z], t));
}
