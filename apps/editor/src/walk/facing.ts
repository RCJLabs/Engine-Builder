/**
 * NPCs turning to face the player as they talk (M6.1, D73, docs/specs/npcs.md#talking), as plain
 * arithmetic: the yaw toward the player, the short way round, and a turn eased over its time. The
 * turn is the stage's alone: no save holds it, and an NPC's solid, a capsule, is the same any way round.
 */
import type { Vec3 } from '../spaces/vec.ts';

/** How long an NPC takes to face the player, and to turn back once the walk goes on. */
export const FACE_MS = 250;
export const BACK_MS = 500;

/** The yaw, in degrees, that faces from one place to another: −z is 0°, as solids.ts's yawOf reads a turn. */
export function yawToward(from: Vec3, to: Vec3): number {
  const [dx, dz] = [to[0] - from[0], to[2] - from[2]];
  if (dx === 0 && dz === 0) return 0;
  return (Math.atan2(-dx, -dz) * 180) / Math.PI + 0;
}

/** The shortest way round from one yaw to another, in degrees, from −180 up to 180. */
export const shortest = (from: number, to: number): number => {
  const d = (((to - from) % 360) + 540) % 360;
  return d - 180;
};

export interface Turn {
  readonly path: string;
  readonly from: number;
  readonly to: number;
  readonly start: number;
  readonly ms: number;
}

/** Where a turn has got to at `now`, eased in and out; its end once its time is up. */
export function yawAt(turn: Turn, now: number): number {
  const t = Math.min(1, Math.max(0, (now - turn.start) / turn.ms));
  const eased = t * t * (3 - 2 * t);
  return turn.from + shortest(turn.from, turn.to) * eased;
}

export interface Facing {
  /** An NPC used: it turns from the yaw it has now toward the player. */
  face(path: string, now: number, placed: number, current: number, toward: number): void;
  /** The walk goes on: the NPC that faced the player turns back to its placed yaw. */
  back(now: number): void;
  /** The turn under way, or null: what the view lays on the NPC's node this frame. */
  turn(now: number): { readonly path: string; readonly yaw: number } | null;
  /** Whether anything is still turning: the stage draws while it is, paused or not. */
  turning(now: number): boolean;
}

export function createFacing(): Facing {
  let turn: Turn | null = null;
  let faced: { path: string; placed: number } | null = null;
  return {
    face(path, now, placed, current, toward) {
      faced = { path, placed };
      turn = { path, from: current, to: toward, start: now, ms: FACE_MS };
    },
    back(now) {
      if (!faced) return;
      const from = turn && turn.path === faced.path ? yawAt(turn, now) : faced.placed;
      turn = { path: faced.path, from, to: faced.placed, start: now, ms: BACK_MS };
      faced = null;
    },
    turn(now) {
      return turn ? { path: turn.path, yaw: yawAt(turn, now) } : null;
    },
    turning(now) {
      if (!turn) return false;
      if (now - turn.start <= turn.ms) return true;
      // Its last frame drawn, a turn back is over: an NPC still facing the player keeps its turn.
      if (!faced) turn = null;
      return false;
    },
  };
}
