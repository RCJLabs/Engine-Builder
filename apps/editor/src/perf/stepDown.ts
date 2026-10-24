/**
 * Auto's step down (M5.7, D69, docs/specs/performance.md#choosing-a-tier): of the frames drawn back
 * to back, the last 3 seconds' 95th percentile longer than 50 ms says the tier is too much for the
 * device, and the view steps down one. It counts afresh after a step, never steps up, and a frame
 * drawn after a pause starts no interval. 50 ms waits on the phone's reading for its tier targets.
 */
import { percentile } from './frames.ts';

/** A frame longer than this is long at any tier: under 20 frames a second. */
export const LONG_FRAME = 50;
/** How much drawing the step down judges at once, in milliseconds. */
export const WINDOW = 3000;
/** How many intervals the overlay's numbers are of. */
export const SHOWN = 120;

export interface FrameClock {
  /**
   * A frame drawn at `at` (ms). `backToBack` when it was asked for as the one before ended, so the
   * time between them is drawing, not waiting. True when the view should step down.
   */
  frame(at: number, backToBack: boolean): boolean;
  /** The last SHOWN intervals, oldest first. */
  intervals(): readonly number[];
}

export function createFrameClock(): FrameClock {
  let last: number | null = null;
  let window: number[] = [];
  let shown: number[] = [];
  return {
    frame(at, backToBack) {
      const before = last;
      last = at;
      if (!backToBack || before === null) return false;
      const interval = at - before;
      shown = [...shown.slice(-(SHOWN - 1)), interval];
      window.push(interval);
      let span = window.reduce((sum, n) => sum + n, 0);
      while (window.length > 1 && span - (window[0] as number) >= WINDOW) span -= window.shift() as number;
      if (span < WINDOW) return false;
      const long =
        percentile(
          [...window].sort((a, b) => a - b),
          95,
        ) > LONG_FRAME;
      if (long) window = [];
      return long;
    },
    intervals: () => shown,
  };
}
