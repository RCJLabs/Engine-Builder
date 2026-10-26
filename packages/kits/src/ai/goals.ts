/**
 * What a behaviour's run reads and changes, apart from the module so it tests without a game: the
 * NPC's run in the slice, where the world module says it last arrived, its stream, effects; and the
 * goals it gives the world module (walk-to, follow, stand, and attack since M6.4), which the stage
 * walks (D74, D75, D76).
 */
import type { Effect } from '@eb/core';
import type { AiNpc, Leaf } from './types.ts';

export interface Ai {
  npc(actor: string): AiNpc | undefined;
  save(actor: string, run: AiNpc): void;
  /** Said as ai/doing when the leaf changes. */
  doing(actor: string, leaf: Leaf | undefined): void;
  /** A length in the calendar's units, in ticks. */
  ticks(length: Readonly<Record<string, number>>): number;
  /** world.npc-at: where it last arrived, if it hasn't been sent on since. */
  arrivedAt(actor: string): string | undefined;
  /** A whole number from 0 to below `n`, from the NPC's own stream. */
  draw(actor: string, n: number): number;
  apply(effect: Effect): void;
}

export function goals(ai: Ai, actor: string) {
  return {
    walkTo: (to: string) => ai.apply({ effect: 'walk-to', actor, to }),
    follow: (distance?: number) =>
      ai.apply({ effect: 'follow', actor, ...(distance !== undefined ? { distance } : {}) }),
    stand: (facing = false) => ai.apply({ effect: 'stand', actor, ...(facing ? { facing: 'player' } : {}) }),
    attack: () => ai.apply({ effect: 'attack', actor }),
  };
}
