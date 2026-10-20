/**
 * The outline's actions on the selected row (M4.5, docs/specs/designer.md#the-outline): Add a
 * widget of a kind, Duplicate, Up, Down, In, Out, Wrap, Delete, and Add tab. Each is a button a
 * single tap or a key reaches, so nothing needs the drag (WCAG 2.5.7); each is one step of undo.
 */
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import type { Row } from './tree.ts';
import {
  addPlace,
  addTab,
  addWidget,
  duplicate,
  type Edited,
  moveBy,
  moveIn,
  moveOut,
  remove,
  wrap,
} from './treeEdits.ts';
import { KIND_NAMES, WIDGETS, type WidgetKind } from './widgets.ts';

interface Props {
  readonly screen: unknown;
  readonly row: Row;
  readonly canEdit: boolean;
  /** Writes an action's result as one step, saying what it did, and selects what it says. */
  readonly apply: (label: string, edit: (screen: unknown) => Edited | null) => void;
}

export function OutlineBar({ screen, row, canEdit, apply }: Props) {
  const id = useUniqueId();
  const [kind, setKind] = useState<WidgetKind>('text');
  const place = addPlace(screen, row);
  const can = (edit: (screen: unknown) => Edited | null) => canEdit && edit(screen) !== null;
  const act = (label: string, edit: (screen: unknown) => Edited | null) => (
    <button type="button" class="button" disabled={!can(edit)} onClick={() => apply(label, edit)}>
      {label}
    </button>
  );
  const where =
    place === null
      ? ''
      : place.kind === 'slot'
        ? `into ${row.slot ?? 'the slot'}`
        : row.role === 'widget' && row.among && place.list === row.among.list
          ? 'after it'
          : 'inside it';
  return (
    <fieldset class="designer-bar">
      <legend class="visually-hidden">Change the outline</legend>
      <div class="form-actions">
        <label for={id}>Add</label>
        <select
          id={id}
          class="field form-select"
          value={kind}
          onChange={(event) => setKind(event.currentTarget.value as WidgetKind)}
        >
          {WIDGETS.map((each) => (
            <option key={each} value={each}>
              {KIND_NAMES[each]}
            </option>
          ))}
        </select>
        <button
          type="button"
          class="button primary"
          disabled={!canEdit || place === null}
          onClick={() => apply(`Add ${KIND_NAMES[kind].toLowerCase()}`, (s) => addWidget(s, row, kind))}
        >
          {place === null ? 'Add' : `Add ${where}`}
        </button>
      </div>
      <div class="form-actions">
        {act('Up', (s) => moveBy(s, row, -1))}
        {act('Down', (s) => moveBy(s, row, 1))}
        {act('In', (s) => moveIn(s, row))}
        {act('Out', (s) => moveOut(s, row))}
        {act('Duplicate', (s) => duplicate(s, row))}
        {act('Wrap in stack', (s) => wrap(s, row))}
        {row.role === 'tab' || row.kind === 'tabs' ? act('Add tab', (s) => addTab(s, row)) : null}
        {act('Delete', (s) => remove(s, row))}
      </div>
    </fieldset>
  );
}
