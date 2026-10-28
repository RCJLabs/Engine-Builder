/**
 * The frame a stage is given (M7.4, D86, docs/specs/stages.md#the-api), as a plain function of what
 * stage2d's sim side and the page know: the times on the page's clock, the box, the walkers as stage2d
 * walks them (art pixels, facing by their flip), what the Space widget reads, what was taken, and the
 * input since the last frame the worker took.
 */
import type { Frame, StageInput } from './api.ts';

/** The most a frame moves anything, in seconds, as stage2d's: a hidden tab's long gap isn't a leap. */
export const FRAME_CAP_S = 0.1;
/** Device pixels to a CSS pixel, at most: a stage on a 3x phone draws a third fewer pixels. */
export const MOST_DPR = 2;

export interface FrameFacts {
  /** Now, when the stage started and when the worker last took a frame, in ms on the page's clock. */
  readonly now: number;
  readonly born: number;
  readonly sentAt: number;
  readonly box: { readonly w: number; readonly h: number };
  readonly devicePixelRatio: number;
  readonly still: boolean;
  readonly walkers: Iterable<{
    readonly actor: string;
    readonly at: readonly [number, number];
    readonly flip: boolean;
    readonly moving: boolean;
  }>;
  readonly world: Frame['world'];
  readonly taken: Iterable<string>;
  readonly input: readonly StageInput[];
}

export function frameOf(facts: FrameFacts): Frame {
  return {
    t: (facts.now - facts.born) / 1000,
    dt: Math.min(FRAME_CAP_S, Math.max(0, (facts.now - facts.sentAt) / 1000)),
    w: facts.box.w,
    h: facts.box.h,
    dpr: Math.min(MOST_DPR, facts.devicePixelRatio || 1),
    still: facts.still,
    walkers: [...facts.walkers].map((w) => ({
      actor: w.actor,
      at: [w.at[0], w.at[1]] as const,
      facing: w.flip ? -1 : 1,
      moving: w.moving,
    })),
    ...(facts.world !== undefined ? { world: facts.world } : {}),
    taken: [...facts.taken].sort(),
    input: facts.input,
  };
}
