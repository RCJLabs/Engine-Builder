/**
 * A 2D space's scale (M7.1, D83, docs/specs/2d-scenes.md#the-view): the largest whole number of
 * device pixels an art pixel can take with the space's `fit` still in the box, at least 1; and the
 * canvas of art pixels that fills the box at it. From afterglass's layout (page/stage.js:34-59).
 */
import { FIT_DEFAULT } from '@eb/compiler';

export interface Scaled {
  /** Device pixels an art pixel. */
  readonly scale: number;
  /** The canvas's art pixels across and up: the box at the scale, rounded up so it is covered. */
  readonly cols: number;
  readonly rows: number;
}

export function fitScale(width: number, height: number, dpr: number, fit: readonly [number, number] = FIT_DEFAULT) {
  const w = Math.max(1, width * dpr);
  const h = Math.max(1, height * dpr);
  const scale = Math.max(1, Math.floor(Math.min(w / fit[0], h / fit[1])));
  return { scale, cols: Math.ceil(w / scale), rows: Math.ceil(h / scale) } satisfies Scaled;
}

/** A whole step in from the fitted scale (the editor's zoom), never below 1. */
export const zoomed = (fitted: number, steps: number): number => Math.max(1, fitted + Math.round(steps));
