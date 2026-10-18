/**
 * Going from a problem to where it is fixed (M2.8): a record's form at the field, the type
 * designer, an asset, or a panel. Kept apart from the panel, so others can send people there too.
 */
import { showPanel } from '../app/panelControl.ts';
import { openAsset } from '../assets/open.ts';
import { recordFile } from '../forms/catalog.ts';
import { fieldToFocus } from '../forms/focusField.ts';
import { openRecord } from '../records/actions.ts';
import { designType } from '../types/open.ts';
import type { Place } from './problemList.ts';

export function openPlace(place: Place): void {
  switch (place.kind) {
    case 'record':
      fieldToFocus.value = { file: recordFile(place.type, place.id), at: place.at };
      openRecord(place.type, place.id);
      return;
    case 'type':
      designType(place.type);
      return;
    case 'asset':
      openAsset(place.path);
      return;
    case 'panel':
      showPanel(place.panel);
  }
}
