/**
 * Going from a problem to where it is fixed (M2.8): a record's form at the field, the type
 * designer, an asset, a script, a scene or a screen at its line (M3.2, M3.11, M4.1), a space's
 * object (M5.1), or a panel. Kept apart from the panel, so others
 * can send people there too.
 */
import { showPanel } from '../app/panelControl.ts';
import { openAsset } from '../assets/open.ts';
import { recordFile } from '../forms/catalog.ts';
import { fieldToFocus } from '../forms/focusField.ts';
import { openRecord } from '../records/actions.ts';
import { openScene } from '../scenes/open.ts';
import { openUiFile } from '../screens/open.ts';
import { openScript } from '../scripts/open.ts';
import { openSpaceAt } from '../spaces/open.ts';
import { designKind, designType } from '../types/open.ts';
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
    case 'component':
      designKind(place.id);
      return;
    case 'asset':
      openAsset(place.path);
      return;
    case 'script':
      openScript(place.id, place.line === undefined ? undefined : { line: place.line, column: place.column });
      return;
    case 'scene':
      openScene(place.id, place.line === undefined ? undefined : { line: place.line, column: place.column });
      return;
    case 'ui':
      openUiFile(place.path, place.line === undefined ? undefined : { line: place.line, column: place.column });
      return;
    case 'space':
      openSpaceAt(place.path, place.object);
      return;
    case 'panel':
      showPanel(place.panel);
  }
}
