/**
 * Showing an asset in the inspector (M2.7): the dock's or the zone's, or the sheet on a phone.
 * Kept apart from the asset inspector and its steps, which load only when first wanted.
 */
import { showPanel } from '../app/panelControl.ts';
import { chosen } from '../forms/selection.ts';

export function openAsset(path: string): void {
  chosen.value = { kind: 'asset', path };
  showPanel('inspector');
}
