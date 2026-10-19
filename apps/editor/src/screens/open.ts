/**
 * Showing a screen or the theme in the inspector (M4.1, D51), as its JSON, at a line when a
 * problem names one. Kept apart from the screen editor, which loads when first wanted.
 */
import { signal } from '@preact/signals';
import { showPanel } from '../app/panelControl.ts';
import { chosen } from '../forms/selection.ts';

/** Where the screen editor puts the cursor once it shows the file, then clears: its id is the file's path. */
export const uiLineToFocus = signal<{ readonly id: string; readonly line: number; readonly column?: number } | null>(
  null,
);

/** `path` is the file's: ui/<id>.json, or ui/theme.json. */
export function openUiFile(path: string, at?: { readonly line: number; readonly column?: number }): void {
  uiLineToFocus.value = at ? { id: path, ...at } : null;
  chosen.value = { kind: 'ui', path };
  showPanel('inspector');
}
