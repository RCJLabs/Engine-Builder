/**
 * What the type designer (M2.6) does, each as one step undo takes back: a type file changed with
 * its records, a type created, renamed or deleted, a record renamed. What shows a type or record
 * follows a rename, so the inspector and the table stay on it. A step refused (a name taken, a
 * rename that would lose data) changes nothing and says why.
 */
import { showPanel } from '../app/panelControl.ts';
import { step } from '../editing/step.ts';
import { chosen } from '../forms/selection.ts';
import { tableType, views } from '../records/viewState.ts';
import type { FieldChange } from './fieldEdits.ts';
import { changeType, createTypeFile, deleteType, renameRecord, renameType } from './typeEdits.ts';

export const changeTypeStep = (type: string, label: string, change: FieldChange, group?: string) =>
  step(label, (copy) => changeType(copy, type, change), group);

/** A new type, shown in the designer and in the Records panel's table; `file` when not a new type's start. */
export async function createType(type: string, title: string, file?: unknown): Promise<void> {
  if (!(await step(`New type ${title}`, (copy) => createTypeFile(copy, type, title, file)))) return;
  tableType.value = type;
  chosen.value = { kind: 'type', type };
  showPanel('inspector');
}

/** A table's view moved to the type's new name, or forgotten with it. */
function moveView(from: string, to: string | null): void {
  const view = views.value.get(from);
  if (!view) return;
  const next = new Map(views.value);
  next.delete(from);
  if (to !== null) next.set(to, view);
  views.value = next;
}

export async function renameTypeAction(from: string, to: string): Promise<void> {
  if (!(await step(`Rename type ${from} to ${to}`, (copy) => renameType(copy, from, to)))) return;
  moveView(from, to);
  if (tableType.value === from) tableType.value = to;
  if (chosen.value?.kind === 'type' && chosen.value.type === from) chosen.value = { kind: 'type', type: to };
}

export async function deleteTypeAction(type: string, title: string): Promise<void> {
  if (!(await step(`Delete type ${title}`, (copy) => deleteType(copy, type)))) return;
  moveView(type, null);
  if (tableType.value === type) tableType.value = null;
  if (chosen.value?.kind === 'type' && chosen.value.type === type) chosen.value = null;
}

/** The record's id changed, and every ref to it (D33); the inspector stays on it. */
export async function renameRecordAction(type: string, from: string, to: string): Promise<void> {
  if (!(await step(`Rename ${from} to ${to}`, (copy) => renameRecord(copy, type, from, to)))) return;
  const shown = chosen.value;
  if (shown?.kind === 'record' && shown.type === type && shown.id === from)
    chosen.value = { kind: 'record', type, id: to };
}
