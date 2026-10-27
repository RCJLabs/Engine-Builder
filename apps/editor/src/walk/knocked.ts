/**
 * Essential NPCs down (M6.10, D82, docs/specs/combat.md#essential-actors): laid down as a fallen one is,
 * its body out of the way but kept, and stood up again once the sim has it up. The stage asks for that
 * RISE_S after it saw the NPC go down, on the walk's fixed steps, and again each RISE_S while the sim
 * still has it down: a rise refused under a talk, or lost with the page, is asked for again.
 */
import type { Action } from '@eb/core';
import { STEP } from './motion.ts';
import type { Walker } from './physics.ts';

/** Seconds an essential NPC lies down before the stage asks the sim to stand it up. */
export const RISE_S = 10;
/** The same in the walk's fixed steps, counted whole so the sum of steps never falls a step short. */
export const RISE_STEPS = Math.round(RISE_S / STEP);

export interface Knocked {
  /** One fixed step: `down`, the actors the sim has down now; `npcs`, the space's, by path. */
  step(
    steps: number,
    npcs: readonly { readonly actor: string; readonly path: string }[],
    down: readonly string[],
  ): void;
  /** The actors laid down now, with the step each was seen going down. */
  list(): readonly { readonly actor: string; readonly since: number }[];
}

export function createKnocked(walker: Pick<Walker, 'knocked'>, post: (action: Action) => void): Knocked {
  const laid = new Map<string, { path: string; since: number; asked: number }>();
  return {
    step(steps, npcs, down) {
      for (const n of npcs) {
        const was = laid.get(n.actor);
        if (!down.includes(n.actor)) {
          if (!was) continue;
          walker.knocked(was.path, false);
          laid.delete(n.actor);
          continue;
        }
        if (!was) {
          walker.knocked(n.path, true);
          laid.set(n.actor, { path: n.path, since: steps, asked: steps });
          continue;
        }
        if (steps - was.asked < RISE_STEPS) continue;
        was.asked = steps;
        post({ type: 'fighting/rise', actor: n.actor });
      }
    },
    list: () => [...laid].map(([actor, { since }]) => ({ actor, since })),
  };
}
