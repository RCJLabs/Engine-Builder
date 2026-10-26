/**
 * The starter character kept out of the ground (M6.5): a pose's lowest point worked out bone by
 * bone as the file will play it, and the hips lifted by however far under it is. Only ever
 * lifted, so a run keeps its moment in the air; a walk's trailing toes, turned down as the leg
 * swings back, would otherwise dip 4 cm under.
 */
import { HUMANOID, type HumanBone, PARENT } from '@eb/models/humanoid';
import { PARTS } from './body.ts';
import type { Pose } from './poses.ts';
import { offsetOf, REST, type Vec3 } from './skeleton.ts';
import { mul, type Quat, rotate, turnOf } from './turns.ts';

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Each part's corners from its bone's place at rest: what the bone carries with it. */
const CARRIED = PARTS.map((part) => {
  const rest = REST[part.bone];
  const corners = part.shape.faces.flat().map((c): Vec3 => [c[0] - rest[0], c[1] - rest[1], c[2] - rest[2]]);
  return { bone: part.bone, corners };
});

/** The lowest point of the body in `pose`, in metres. */
export function lowestOf(pose: Pose): number {
  const turns = new Map<HumanBone, Quat>();
  const places = new Map<HumanBone, Vec3>();
  // HUMANOID lists a parent before its children.
  for (const bone of HUMANOID) {
    const q = turnOf(pose.turns[bone] ?? [0, 0, 0]);
    const up = PARENT[bone];
    if (!up) {
      turns.set(bone, q);
      places.set(bone, [...(pose.hips ?? REST.hips)]);
      continue;
    }
    const parent = turns.get(up) as Quat;
    turns.set(bone, mul(parent, q));
    places.set(bone, add(places.get(up) as Vec3, rotate(parent, offsetOf(bone))));
  }
  let lowest = Number.POSITIVE_INFINITY;
  for (const { bone, corners } of CARRIED) {
    const q = turns.get(bone) as Quat;
    const at = places.get(bone) as Vec3;
    for (const c of corners) lowest = Math.min(lowest, at[1] + rotate(q, c)[1]);
  }
  return lowest;
}

/** `pose` with its hips lifted until nothing is under the ground. */
export function grounded(pose: Pose): Pose {
  const under = lowestOf(pose);
  if (under >= 0) return pose;
  const [x, y, z] = pose.hips ?? REST.hips;
  return { ...pose, hips: [x, y - under, z] };
}
