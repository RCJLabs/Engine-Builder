/**
 * Soft aim (M6.4, D76, docs/specs/combat.md#aiming): as a swing or a draw starts, the wielder turns
 * toward the nearest standing foe within 30° of where they face and within reach (melee, with half a
 * metre's slack) or range, over the wind-up; with none, they strike straight ahead. Plain arithmetic.
 */
import type { WeaponView } from '@eb/ui';
import type { Vec3 } from '../spaces/vec.ts';
import { shortest, yawToward } from './facing.ts';

export const AIM_CONE = 30;
export const AIM_SLACK = 0.5;

export interface Foe {
  readonly actor: string;
  readonly path: string;
  /** Its feet. */
  readonly at: Vec3;
}

const across = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** How far the weapon aims: a swing's reach and the slack, or a shot's range. */
export const aimReach = (weapon: WeaponView): number =>
  weapon.kind === 'melee' ? weapon.reach + AIM_SLACK : weapon.range;

/** The foe to turn to, or none: the nearest within the cone and the weapon's aim. */
export function aimAt(foes: readonly Foe[], feet: Vec3, yaw: number, weapon: WeaponView): Foe | undefined {
  const most = aimReach(weapon);
  let best: { foe: Foe; d: number } | undefined;
  for (const foe of foes) {
    const d = across(feet, foe.at);
    if (d > most) continue;
    if (d > 0.05 && Math.abs(shortest(yaw, yawToward(feet, foe.at))) > AIM_CONE) continue;
    if (!best || d < best.d) best = { foe, d };
  }
  return best?.foe;
}

/** The yaw `done` of the way from `from` to facing `foe`, the short way round. */
export function turnedToward(from: number, feet: Vec3, foe: Vec3, done: number): number {
  return from + shortest(from, yawToward(feet, foe)) * Math.max(0, Math.min(1, done));
}
