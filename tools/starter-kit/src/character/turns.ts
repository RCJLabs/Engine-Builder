/** Quaternions for the starter character's poses (M6.5): x, y, z, w, as glTF keeps them. */
import type { Turn } from './poses.ts';
import type { Vec3 } from './skeleton.ts';

export type Quat = [number, number, number, number];

const round = (n: number) => Math.round(n * 1e5) / 1e5 + 0;

export const mul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

const about = (axis: 0 | 1 | 2, angle: number): Quat => {
  const q: Quat = [0, 0, 0, Math.cos(angle / 2)];
  q[axis] = Math.sin(angle / 2);
  return q;
};

/** A pose's Euler angles as a quaternion, taken Y·X·Z as three's "YXZ" order takes them, rounded as the file keeps it. */
export const turnOf = (turn: Turn): Quat =>
  mul(mul(about(1, turn[1]), about(0, turn[0])), about(2, turn[2])).map(round) as Quat;

/** `v` turned by `q`. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
