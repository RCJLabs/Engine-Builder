/**
 * Snapping (M5.1, docs/specs/viewport.md#the-gizmo): moves in 0.5 m, turns in 15° and scales in
 * 0.1, on unless the toolbar turns it off; Ctrl or ⌘ held while dragging snaps the other way.
 */
export const STEPS = { move: 0.5, turn: 15, scale: 0.1 } as const;

/** The smallest scale a drag leaves: a scale is above 0 (E058). */
export const LEAST_SCALE = 0.1;

/**
 * A number as a file keeps it: to the millimetre, the hundredth of a degree being finer than a
 * drag can aim, and never -0. A snapped 0.1 × 3 is 0.3, not 0.30000000000000004.
 */
export function tidy(value: number): number {
  const kept = Math.round(value * 1000) / 1000;
  return kept === 0 ? 0 : kept;
}

export const snapTo = (value: number, step: number): number => tidy(Math.round(value / step) * step);

/** Whether a drag snaps: the toolbar's setting, the other way while Ctrl or ⌘ is held. */
export const snaps = (on: boolean, flipped: boolean): boolean => on !== flipped;
