/**
 * What a melee swing reaches (M6.4, D76, docs/specs/combat.md#a-hit): every body whose capsule lies
 * within the weapon's reach of the wielder's chest, whose chest is within half its arc of the way the
 * wielder faces, with a clear line from chest to chest. The line is the caller's (Rapier's ray, in
 * physics.ts), so this stays plain arithmetic that Node's tests check without a world.
 */
import type { WeaponView } from '@eb/ui';
import { chestOf as chestHeight } from '../spaces/figureLook.ts';
import type { Vec3 } from '../spaces/vec.ts';
import { shortest, yawToward } from './facing.ts';

/** A body a swing or an arrow can hit: an NPC's, or the player's. */
export interface Target {
  readonly actor: string;
  readonly feet: Vec3;
  readonly height: number;
  readonly radius: number;
}

/** Where a swing starts and an arrow aims: the chest, as an NPC's Talk is (figureLook.ts). */
export const chestOf = (feet: Vec3, height: number): Vec3 => [feet[0], feet[1] + chestHeight(height), feet[2]];

/** Within this across, a body is struck whichever way the wielder faces. */
const CLOSE_M = 0.3;

export interface Wielder {
  readonly feet: Vec3;
  readonly height: number;
  readonly yaw: number;
}

/** The targets the swing reaches now, nearest first; `clear` says whether nothing stands between two chests. */
export function reached(
  wielder: Wielder,
  weapon: WeaponView,
  targets: readonly Target[],
  clear: (from: Vec3, to: Target) => boolean,
): Target[] {
  const chest = chestOf(wielder.feet, wielder.height);
  const found: { target: Target; d: number }[] = [];
  for (const target of targets) {
    const across = Math.hypot(target.feet[0] - chest[0], target.feet[2] - chest[2]);
    if (across - target.radius > weapon.reach) continue;
    // A capsule from its feet to its height: the swing passes over or under a body it doesn't meet.
    if (chest[1] < target.feet[1] - weapon.reach || chest[1] > target.feet[1] + target.height + weapon.reach) continue;
    const off = Math.abs(shortest(wielder.yaw, yawToward(chest, target.feet)));
    if (across > CLOSE_M && off > weapon.arc / 2) continue;
    if (!clear(chest, target)) continue;
    found.push({ target, d: across });
  }
  return found.sort((a, b) => a.d - b.d).map((f) => f.target);
}
