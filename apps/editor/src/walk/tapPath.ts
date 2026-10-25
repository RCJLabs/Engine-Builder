/**
 * Tap to move (M6.2, D74, docs/specs/navigation.md#the-stage): the player walked along Detour's
 * corners from their feet to where they tapped, as if the stick were pushed toward the next corner.
 * The stick, the keys or a pad take over at once; it ends within ARRIVE_M of the last. Plain arithmetic.
 */
import type { Vec3 } from '../spaces/vec.ts';
import type { Intent } from './controls.ts';

export const ARRIVE_M = 0.3;

export interface TapPath {
  readonly corners: readonly Vec3[];
  /** The corner walked to now. */
  readonly next: number;
}

const RAD = Math.PI / 180;
const across = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** A path from the corners Detour found, or null for none worth walking. */
export const tapPathOf = (corners: readonly Vec3[] | null): TapPath | null =>
  corners && corners.length > 0 ? { corners, next: 0 } : null;

export const targetOf = (path: TapPath): Vec3 => path.corners[path.corners.length - 1] as Vec3;

/**
 * The push toward the next corner, in the yaw's frame as intents are (motion.ts's pushed, turned
 * back), and the path after it: past each corner within ARRIVE_M, null once at the last.
 */
export function pushAlong(path: TapPath, feet: Vec3, yaw: number): { path: TapPath | null; move: [number, number] } {
  // At the last corner it ends, however it got there: pushed aside, say, past the others.
  if (across(feet, targetOf(path)) < ARRIVE_M) return { path: null, move: [0, 0] };
  let next = path.next;
  while (next < path.corners.length && across(feet, path.corners[next] as Vec3) < ARRIVE_M) next++;
  if (next >= path.corners.length) return { path: null, move: [0, 0] };
  const corner = path.corners[next] as Vec3;
  const [dx, dz] = [corner[0] - feet[0], corner[2] - feet[2]];
  const d = Math.hypot(dx, dz);
  const [x, z] = [dx / d, dz / d];
  const y = yaw * RAD;
  // Forward is (−sin y, −cos y) and right (cos y, −sin y): the push is the way along each.
  const forward = -Math.sin(y) * x - Math.cos(y) * z;
  const right = Math.cos(y) * x - Math.sin(y) * z;
  return { path: { corners: path.corners, next }, move: [right, forward] };
}

/** Whether anything else is moving the player: then the tapped path ends. */
export const pushedElsewhere = (intent: Intent): boolean => intent.move[0] !== 0 || intent.move[1] !== 0;
