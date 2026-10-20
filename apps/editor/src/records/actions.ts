/**
 * What the Records panel and the inspector do to records (M2.5), each as one step undo takes
 * back: a new record, a copy, several deleted, a field set on several. Each names its record or
 * its count, as M2.4's steps do: "Duplicate spiculus as spiculus-2", "Set Might on 3 records".
 */
import { TALK } from '@eb/kits';
import type { DataType, TypeFile } from '@eb/schema';
import { showPanel } from '../app/panelControl.ts';
import { editing } from '../editing/current.ts';
import { recordFile } from '../forms/catalog.ts';
import { changeRecords, createRecordFile, deleteRecordFiles, duplicateRecordFile } from '../forms/recordEdits.ts';
import { chosen } from '../forms/selection.ts';
import { newRecord, setIn } from '../forms/values.ts';
import { current } from '../projects/opened.ts';
import { openScene } from '../scenes/open.ts';

/**
 * Shows the record in the inspector: the dock's or the zone's, or the sheet on a phone. A talk
 * that is an ink scene's opens the scene (M3.11), from a table, Used by or the Problems panel.
 */
export function openRecord(type: string, id: string): void {
  if (type === TALK && current.value?.catalog.scenes.has(id)) {
    openScene(id);
    return;
  }
  chosen.value = { kind: 'record', type, id };
  showPanel('inspector');
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A record's name written in, when its type names records; a record that isn't an object is left as it is. */
const named = (file: TypeFile, name: string) => (value: unknown) =>
  file.nameField && isObject(value) ? setIn(value, [file.nameField], name.trim(), file) : value;

const records = (count: number) => (count === 1 ? '1 record' : `${count} records`);

/** A new record with the type's required fields empty and, when the type names records, the name typed. */
export function createRecord(data: DataType, id: string, typed: string): void {
  createRecordFrom(data, id, typed, newRecord(data.file));
}

/** A new record that starts as `value`, such as a new map's rules (M4.6), with the name typed. */
export function createRecordFrom(data: DataType, id: string, typed: string, value: unknown): void {
  const written = named(data.file, typed)(value);
  void editing.edit(`New ${data.file.title.toLowerCase()} ${id}`, (copy) =>
    createRecordFile(copy, recordFile(data.type, id), written),
  );
  openRecord(data.type, id);
}

/** A copy of `from` saved as `id`, in its file's own layout, renamed when the type names records. */
export function duplicateRecord(data: DataType, from: string, id: string, typed: string): void {
  void editing.edit(`Duplicate ${from} as ${id}`, (copy) =>
    duplicateRecordFile(copy, recordFile(data.type, from), recordFile(data.type, id), named(data.file, typed)),
  );
  openRecord(data.type, id);
}

export function deleteRecords(type: string, ids: readonly string[]): void {
  const label = ids.length === 1 ? `Delete ${ids[0]}` : `Delete ${records(ids.length)}`;
  void editing.edit(label, (copy) =>
    deleteRecordFiles(
      copy,
      ids.map((id) => recordFile(type, id)),
    ),
  );
}

/** `field` set to `value` on every record, or taken out of each (`value` undefined). */
export function setField(data: DataType, ids: readonly string[], field: string, label: string, value: unknown): void {
  const said =
    value === undefined ? `Clear ${label} on ${records(ids.length)}` : `Set ${label} on ${records(ids.length)}`;
  void editing.edit(said, (copy) =>
    changeRecords(
      copy,
      ids.map((id) => recordFile(data.type, id)),
      (now) => (isObject(now) ? setIn(now, [field], value, data.file) : now),
    ),
  );
}
