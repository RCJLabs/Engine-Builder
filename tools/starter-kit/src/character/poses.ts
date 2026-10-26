/**
 * The starter character's poses (M6.5, D77): each bone's turn from its T-pose rest, as Euler angles
 * in radians taken Y·X·Z (three's "YXZ": about z first, then x, then y, each in the parent's axes,
 * which at rest are the world's). Facing −z: a turn of +x swings a hanging limb forward, +z lowers
 * the left arm from the T to the side and −z the right one, and +y turns toward the left.
 */
import type { HumanBone } from '@eb/models/humanoid';

export type Turn = readonly [number, number, number];

export interface Pose {
  readonly turns: Partial<Record<HumanBone, Turn>>;
  /** The hips' place, in metres; their rest when left out. */
  readonly hips?: readonly [number, number, number];
}

/** Arms hanging a little out from the sides, elbows a little bent: every clip starts from here. */
export const STAND: Pose = {
  turns: {
    leftUpperArm: [0, 0, 1.35],
    rightUpperArm: [0, 0, -1.35],
    leftLowerArm: [0, -0.15, 0],
    rightLowerArm: [0, 0.15, 0],
  },
};

/** `pose`'s turns added to the standing pose's, bone by bone. */
export function standing(pose: Pose): Pose {
  const turns: Partial<Record<HumanBone, Turn>> = { ...STAND.turns };
  for (const [bone, turn] of Object.entries(pose.turns) as [HumanBone, Turn][]) {
    const base = turns[bone] ?? [0, 0, 0];
    turns[bone] = [base[0] + turn[0], base[1] + turn[1], base[2] + turn[2]];
  }
  return { turns, ...(pose.hips ? { hips: pose.hips } : {}) };
}

/** A pose `e` of the way from `a` to `b`, each bone's angles and the hips' place straight between. */
export function between(a: Pose, b: Pose, e: number): Pose {
  const bones = new Set([...Object.keys(a.turns), ...Object.keys(b.turns)] as HumanBone[]);
  const turns: Partial<Record<HumanBone, Turn>> = {};
  const lerp = (x: number, y: number) => x + (y - x) * e;
  for (const bone of bones) {
    const from = a.turns[bone] ?? [0, 0, 0];
    const to = b.turns[bone] ?? [0, 0, 0];
    turns[bone] = [lerp(from[0], to[0]), lerp(from[1], to[1]), lerp(from[2], to[2])];
  }
  const rest = [0, 0.95, 0] as const;
  const ha = a.hips ?? rest;
  const hb = b.hips ?? rest;
  const moved = a.hips || b.hips;
  return { turns, ...(moved ? { hips: [lerp(ha[0], hb[0]), lerp(ha[1], hb[1]), lerp(ha[2], hb[2])] as const } : {}) };
}

/** 0 to 1 eased in and out. */
export const ease = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};
