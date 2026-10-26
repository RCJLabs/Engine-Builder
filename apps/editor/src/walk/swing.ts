/**
 * A swing or a shot as the stage times it (M6.4, D76, docs/specs/combat.md#a-hit): a melee weapon
 * winds up, strikes for a window in which it can hit, and recovers; a ranged one draws, looses once,
 * and recovers. Stepped on the walk's fixed steps, so a headless run times them as the page does.
 * Plain arithmetic: what it reaches is strike.ts's, where an arrow goes arrows.ts's.
 */
import type { WeaponView } from '@eb/ui';

export type SwingPhase = 'windup' | 'strike' | 'recover';

export interface Swing {
  readonly weapon: WeaponView;
  readonly phase: SwingPhase;
  /** Milliseconds into the phase. */
  readonly ms: number;
  /** The actors this swing has hit: a swing hits each at most once. */
  readonly struck: readonly string[];
}

export interface Stepped {
  /** The swing after the step, or null once it has recovered. */
  readonly swing: Swing | null;
  /** In its strike window on this step: melee looks for what it reaches. */
  readonly striking: boolean;
  /** Its draw ended on this step: a ranged weapon looses now. */
  readonly loose: boolean;
}

export const startSwing = (weapon: WeaponView): Swing => ({ weapon, phase: 'windup', ms: 0, struck: [] });

/** How long a phase lasts: a ranged weapon's wind-up is its draw, and it has no strike window. */
function lasts(weapon: WeaponView, phase: SwingPhase): number {
  if (phase === 'windup') return weapon.kind === 'melee' ? weapon.windup : weapon.draw;
  if (phase === 'strike') return weapon.kind === 'melee' ? weapon.strike : 0;
  return weapon.recover;
}

const NEXT: Readonly<Record<SwingPhase, SwingPhase | null>> = { windup: 'strike', strike: 'recover', recover: null };

/** One step of `dt` milliseconds on: into the next phase as one ends, a phase of no length passed through. */
export function stepSwing(swing: Swing, dt: number): Stepped {
  let { phase, ms } = swing;
  let loose = false;
  ms += dt;
  for (let left = lasts(swing.weapon, phase); ms >= left; left = lasts(swing.weapon, phase)) {
    if (phase === 'windup' && swing.weapon.kind === 'ranged') loose = true;
    const next = NEXT[phase];
    if (next === null) return { swing: null, striking: false, loose };
    ms -= left;
    phase = next;
  }
  return { swing: { ...swing, phase, ms }, striking: phase === 'strike', loose };
}

/** The swing having hit `actor`. */
export const struckBy = (swing: Swing, actor: string): Swing => ({ ...swing, struck: [...swing.struck, actor] });

/** How far through its wind-up, 0 to 1: soft aim turns the wielder over it. */
export function windupDone(swing: Swing): number {
  if (swing.phase !== 'windup') return 1;
  const left = lasts(swing.weapon, 'windup');
  return left <= 0 ? 1 : Math.min(1, swing.ms / left);
}
