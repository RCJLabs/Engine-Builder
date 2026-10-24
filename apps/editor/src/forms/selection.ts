import { signal } from '@preact/signals';

/**
 * What the inspector shows: a record's form, a type's designer (M2.6), the form that names a new
 * type, an asset (M2.7), by its path inside assets/, a script (M3.2) or an ink scene (M3.11), by
 * its id, a screen or the theme under ui/ (M4.1), by its file, or the objects chosen in the space
 * or prefab open in the Scene panel (M5.1), by its file.
 */
export type Chosen =
  | { readonly kind: 'record'; readonly type: string; readonly id: string }
  | { readonly kind: 'type'; readonly type: string }
  | { readonly kind: 'new-type' }
  | { readonly kind: 'asset'; readonly path: string }
  | { readonly kind: 'script'; readonly id: string }
  | { readonly kind: 'scene'; readonly id: string }
  | { readonly kind: 'ui'; readonly path: string }
  | { readonly kind: 'space'; readonly path: string };

/** A project opening or closing clears it. */
export const chosen = signal<Chosen | null>(null);

/** The record the inspector shows, if it shows one. */
export const chosenRecord = (): { readonly type: string; readonly id: string } | null =>
  chosen.value?.kind === 'record' ? chosen.value : null;
