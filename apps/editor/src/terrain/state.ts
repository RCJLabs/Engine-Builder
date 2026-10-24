/**
 * The terrain tools' settings (M5.3, D65): the brush chosen, or none for Camera, and its radius,
 * strength and layer. The toolbar sets them; the view's gestures read them as a stroke starts.
 */
import { signal } from '@preact/signals';
import type { Brush, BrushKind } from './brushes.ts';

export const RADIUS = { least: 0.5, most: 64 } as const;
export const STRENGTH = { least: 0.05, most: 1 } as const;

/** The brush chosen; null is Camera, the pointer moving the camera as it does without a terrain. */
export const brushKind = signal<BrushKind | null>(null);
export const brushRadius = signal(4);
export const brushStrength = signal(0.5);
/** The layer Paint paints, from 0. */
export const brushLayer = signal(0);

/** The brush as a stroke starting now uses it, or null with Camera chosen. */
export function brushNow(): Brush | null {
  const kind = brushKind.peek();
  if (kind === null) return null;
  return { kind, radius: brushRadius.peek(), strength: brushStrength.peek(), layer: brushLayer.peek() };
}
