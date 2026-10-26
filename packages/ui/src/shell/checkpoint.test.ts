/**
 * The checkpoint's rule (M6.4, D76): a step's save is kept when the player arrived in a space by it
 * and still stands; a step that only moves, or that fells the player, keeps nothing.
 */
import { describe, expect, it } from 'vitest';
import type { View } from '../session/types.ts';
import { fallenIn, keptAfterStep } from './checkpoint.ts';

const view = (...modes: string[]) => ({ modes }) as unknown as View;
const ARRIVED = [{ type: 'world/at' }, { type: 'world/arrived' }];

describe('the checkpoint after a step', () => {
  it('is kept as the player arrives in a space', () => {
    expect(keptAfterStep(ARRIVED, view('out'))).toBe(true);
  });

  it('is not kept for a step with no arrival, nor for one the player fell in', () => {
    expect(keptAfterStep([{ type: 'world/at' }], view('out'))).toBe(false);
    expect(keptAfterStep(ARRIVED, view('out', 'fallen'))).toBe(false);
    expect(fallenIn(view('out', 'fallen'))).toBe(true);
    expect(fallenIn(view('out'))).toBe(false);
  });
});
