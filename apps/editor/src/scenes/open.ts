/**
 * Showing an ink scene in the inspector (M3.11, D49): the dock's or the zone's, or the sheet on a
 * phone, at a line when a problem or a box of its map names one. Kept apart from the scene
 * editor, which loads when first wanted.
 */
import { signal } from '@preact/signals';
import { showPanel } from '../app/panelControl.ts';
import { chosen } from '../forms/selection.ts';

/** Where the scene editor puts the cursor once it shows the scene, then clears. */
export const sceneLineToFocus = signal<{ readonly id: string; readonly line: number; readonly column?: number } | null>(
  null,
);

export function openScene(id: string, at?: { readonly line: number; readonly column?: number }): void {
  sceneLineToFocus.value = at ? { id, ...at } : null;
  chosen.value = { kind: 'scene', id };
  showPanel('inspector');
}
