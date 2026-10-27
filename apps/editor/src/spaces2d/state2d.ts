/**
 * What the 2D view and its toolbar share (M7.1, D83): where Add puts an object (the view's middle,
 * in world art pixels), and the zoom buttons' presses. Small, so it rides with the Scene panel; the
 * view itself loads with the first 2D space opened.
 */
import { signal } from '@preact/signals';
import type { Point } from '../stage2d/camera.ts';

/** The world art pixel in the middle of the 2D view: the view keeps it up to date. */
export const aim2d = signal<Point>([0, 0]);

/** The zoom buttons' presses: each one a whole step in or out, counted so the same step twice zooms twice. */
export const zoomAsked = signal<{ readonly by: number; readonly n: number }>({ by: 0, n: 0 });

export function askZoom(by: number): void {
  zoomAsked.value = { by, n: zoomAsked.value.n + 1 };
}

/** The view's zoom as drawn, for the toolbar to say. */
export const zoomShown = signal(0);
