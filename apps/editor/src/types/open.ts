/**
 * Showing the type designer (M2.6) in the inspector: the dock's or the zone's, or the sheet on a
 * phone. Kept apart from the designer itself, which loads only when first shown.
 */
import { showPanel } from '../app/panelControl.ts';
import { chosen } from '../forms/selection.ts';

export function designType(type: string): void {
  chosen.value = { kind: 'type', type };
  showPanel('inspector');
}

/** The form that names a new type, which then opens in the designer. */
export function startNewType(): void {
  chosen.value = { kind: 'new-type' };
  showPanel('inspector');
}
