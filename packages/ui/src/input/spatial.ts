/**
 * The nearest box in a direction (M4.2, docs/specs/input.md#focus), as a plain function of boxes, so
 * the rule is tested without a page. The rule is Chooser's (chooser-of-the-dead's spatial.ts): a
 * 45° cone ahead, scored by the distance ahead plus twice the gap across.
 */

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/** How far a box may reach back past the focused one's edge and still be ahead of it. */
const SLACK = 4;

/** A box's score from `from`, lower nearer, or undefined when it isn't that way. */
export function scoreOf(from: Box, to: Box, direction: Direction): number | undefined {
  const ahead =
    direction === 'down'
      ? to.top - from.bottom
      : direction === 'up'
        ? from.top - to.bottom
        : direction === 'right'
          ? to.left - from.right
          : from.left - to.right;
  if (ahead < -SLACK) return undefined;
  const sideways = direction === 'left' || direction === 'right';
  const [a0, a1] = sideways ? [from.top, from.bottom] : [from.left, from.right];
  const [b0, b1] = sideways ? [to.top, to.bottom] : [to.left, to.right];
  const across = Math.max(0, b0 - a1, a0 - b1);
  if (across > Math.max(0, ahead) + SLACK) return undefined;
  const offset = Math.abs((a0 + a1) / 2 - (b0 + b1) / 2);
  return Math.max(0, ahead) + 2 * across + offset / 10;
}

/** The index of the nearest box that way, the first in order on a tie, or undefined when none is. */
export function nearest(from: Box, boxes: readonly Box[], direction: Direction): number | undefined {
  let best: number | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const [i, box] of boxes.entries()) {
    const score = scoreOf(from, box, direction);
    if (score !== undefined && score < bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}
