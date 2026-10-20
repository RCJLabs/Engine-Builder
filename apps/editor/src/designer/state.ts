/**
 * What the designer keeps while the editor is open (M4.5): each file's selection, the device the
 * frame shows and whether it is turned, and whether layout fields change every size or the frame's
 * alone. Not saved: a reload starts from the screen's top.
 */
import { type Signal, signal } from '@preact/signals';
import { editing } from '../editing/current.ts';
import { changeRecord } from '../forms/recordEdits.ts';
import { DEVICES, type Device } from './frame.ts';

const selections = new Map<string, Signal<string>>();

/** The selection in a file, a JSON Pointer: '' for the screen itself. */
export function selectionOf(file: string): Signal<string> {
  let selected = selections.get(file);
  if (!selected) {
    selected = signal('');
    selections.set(file, selected);
  }
  return selected;
}

export const device = signal<Device>(DEVICES[1] as Device);
export const turned = signal(false);
/** Layout fields change every size, or only the frame's breakpoint, written to the widget's `at`. */
export const onlyHere = signal(false);

/** A change to the file's JSON as one step of the editor's undo; typing in one field joins into one (`key`). */
export function editFile(file: string, label: string, change: (now: unknown) => unknown, key?: string): void {
  void editing.edit(label, (copy) => changeRecord(copy, file, change), key);
}
