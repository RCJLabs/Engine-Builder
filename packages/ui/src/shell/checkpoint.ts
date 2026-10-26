/**
 * When the shell keeps a slot's checkpoint (M6.4, D76, docs/specs/combat.md#a-fall): after a step
 * the player arrived in a space by, and as a game begins or loads; never in a fallen game, whose
 * fatal step is no place to come back to. Plain functions, so a test holds the rule without a shell.
 */
import type { View } from '../session/types.ts';

/** The fighting kit's mode a fallen player's game stops in. */
export const FALLEN = 'fallen';

export const fallenIn = (view: View): boolean => view.modes.includes(FALLEN);

/** Whether a step's save is kept as the checkpoint: the player arrived somewhere by it, and stands. */
export const keptAfterStep = (beats: readonly { readonly type: string }[], view: View): boolean =>
  !fallenIn(view) && beats.some((beat) => beat.type === 'world/arrived');
