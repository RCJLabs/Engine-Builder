/**
 * The starter character's skeleton (M6.5, D77, docs/specs/animation.md#the-starter-character): the
 * engine's humanoid at rest in the T-pose, 1.75 m tall, facing −z, so its left is −x. Already
 * normalised: every joint rests at the identity, its node offset from its parent in world axes, so
 * the import has nothing to turn and a clip's rotations mean what they say.
 */
import { HUMANOID, type HumanBone, PARENT } from '@eb/models/humanoid';

export type Vec3 = readonly [number, number, number];

/** Where each joint sits at rest, in metres. Its height is 1.75 to the top of the head. */
export const REST: Readonly<Record<HumanBone, Vec3>> = {
  hips: [0, 0.95, 0],
  spine: [0, 1.05, 0],
  chest: [0, 1.2, 0],
  upperChest: [0, 1.34, 0],
  neck: [0, 1.48, 0],
  head: [0, 1.56, 0],
  leftShoulder: [-0.04, 1.44, 0],
  leftUpperArm: [-0.17, 1.44, 0],
  leftLowerArm: [-0.45, 1.44, 0],
  leftHand: [-0.7, 1.44, 0],
  rightShoulder: [0.04, 1.44, 0],
  rightUpperArm: [0.17, 1.44, 0],
  rightLowerArm: [0.45, 1.44, 0],
  rightHand: [0.7, 1.44, 0],
  leftUpperLeg: [-0.09, 0.92, 0],
  leftLowerLeg: [-0.09, 0.5, 0],
  leftFoot: [-0.09, 0.09, 0],
  leftToes: [-0.09, 0.03, -0.12],
  rightUpperLeg: [0.09, 0.92, 0],
  rightLowerLeg: [0.09, 0.5, 0],
  rightFoot: [0.09, 0.09, 0],
  rightToes: [0.09, 0.03, -0.12],
};

export const HEIGHT = 1.75;

/** Each joint's offset from its parent, the hips' from the origin at its feet. */
export function offsetOf(bone: HumanBone): Vec3 {
  const at = REST[bone];
  const up = PARENT[bone];
  const from = up ? REST[up] : ([0, 0, 0] as Vec3);
  return [at[0] - from[0], at[1] - from[1], at[2] - from[2]];
}

/** The joints in the humanoid's order, each after its parent. */
export const JOINTS: readonly HumanBone[] = HUMANOID;
