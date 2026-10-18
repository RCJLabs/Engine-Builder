/**
 * Showing a script in the inspector (M3.2): the dock's or the zone's, or the sheet on a phone, at
 * a line when a problem names one. Kept apart from the script editor, which loads when first wanted.
 */
import { signal } from '@preact/signals';
import { showPanel } from '../app/panelControl.ts';
import { chosen } from '../forms/selection.ts';

/** Where the script editor puts the cursor once it shows the script, then clears. */
export const lineToFocus = signal<{ readonly id: string; readonly line: number; readonly column?: number } | null>(
  null,
);

export function openScript(id: string, at?: { readonly line: number; readonly column?: number }): void {
  lineToFocus.value = at ? { id, ...at } : null;
  chosen.value = { kind: 'script', id };
  showPanel('inspector');
}
