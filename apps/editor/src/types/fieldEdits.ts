/**
 * What each of the type designer's field changes makes of a type file and its records (M2.6),
 * for changeType (typeEdits.ts) to make one step. Plain functions of the file's JSON and the
 * records' values as they are when the step runs. A change that would lose data throws instead,
 * before anything is written: a field renamed onto one some records already hold, say.
 */
import type { FieldKind } from '@eb/schema';
import { type DefPath, nodeAt, setInTypeFile } from './defPaths.ts';
import { fillField, removeField, renameChoice, renameClashes, renameField, retargetRefs } from './rewrites.ts';
import type { TypeChange } from './typeEdits.ts';
import {
  addChoice,
  addFieldDef,
  choicesAt,
  moveChoice,
  moveFieldDef,
  removeChoice,
  removeFieldDef,
  renameChoiceDef,
  renameFieldDef,
  replaceDef,
  startingDef,
  targetsValue,
} from './typeFileChanges.ts';

export type FieldChange = (file: unknown) => TypeChange;

const records = (count: number) => (count === 1 ? '1 record' : `${count} records`);

/** A field renamed in the type and in every record (D33). Refused when records hold both names. */
export const renameFieldChange =
  (group: DefPath, from: string, to: string): FieldChange =>
  (file) => ({
    file: renameFieldDef(file, group, from, to),
    rewrite: renameField(file, group, from, to),
    check: (values) => {
      const clashes = values.filter((value) => renameClashes(file, group, from, to, value) > 0).length;
      if (clashes > 0) {
        throw new Error(`${records(clashes)} ${clashes === 1 ? 'holds' : 'hold'} “${to}” already, beside “${from}”`);
      }
    },
  });

/** A field taken out of the type, and its values out of the records: undo brings both back. */
export const removeFieldChange =
  (group: DefPath, name: string): FieldChange =>
  (file) => ({ file: removeFieldDef(file, group, name), rewrite: removeField(file, group, name) });

/**
 * A new field, last in its group. A required one is filled in on the records with `fill`, so no
 * record is left missing it (type-files.md, question 3).
 */
export const addFieldChange =
  (group: DefPath, name: string, def: Record<string, unknown>, fill?: { readonly value: unknown }): FieldChange =>
  (file) => {
    const next = addFieldDef(file, group, name, def);
    return fill ? { file: next, rewrite: fillField(next, group, name, fill.value) } : { file: next };
  };

/** A required field filled in where records leave it out; the type file stays as it is. */
export const fillChange =
  (group: DefPath, name: string, value: unknown): FieldChange =>
  (file) => ({ file, rewrite: fillField(file, group, name, value) });

export const moveFieldChange =
  (group: DefPath, name: string, by: -1 | 1): FieldChange =>
  (file) => ({ file: moveFieldDef(file, group, name, by) });

/** One key of the type file set, or taken out: a title, a label, a bound. The records stay. */
export const setChange =
  (path: readonly (string | number)[], value: unknown): FieldChange =>
  (file) => ({ file: setInTypeFile(file, path, value) });

/**
 * The def at `path` made a def of `kind`. Nothing is converted: the records keep their values,
 * and the designer says how many don't fit. A choice starts from the texts the records hold there.
 */
export const kindChange =
  (path: DefPath, kind: FieldKind, field: boolean, choices: readonly string[], target: string): FieldChange =>
  (file) => ({ file: replaceDef(file, path, startingDef(kind, choices, target), field) });

export const addChoiceChange =
  (at: DefPath, choice: string): FieldChange =>
  (file) => {
    if (choicesAt(file, at).includes(choice)) throw new Error(`“${choice}” is a choice already`);
    return { file: addChoice(file, at, choice) };
  };

/** A choice renamed in the type and in every record that holds it (D33). */
export const renameChoiceChange =
  (at: DefPath, index: number, to: string): FieldChange =>
  (file) => {
    const choices = choicesAt(file, at);
    const from = choices[index];
    if (from === undefined || from === to) return { file };
    if (choices.includes(to)) throw new Error(`“${to}” is a choice already`);
    return { file: renameChoiceDef(file, at, index, to), rewrite: renameChoice(file, at, from, to) };
  };

/** A choice taken off the list. Records that hold it keep it, and won't fit. */
export const removeChoiceChange =
  (at: DefPath, index: number): FieldChange =>
  (file) => ({ file: removeChoice(file, at, index) });

export const moveChoiceChange =
  (at: DefPath, index: number, by: -1 | 1): FieldChange =>
  (file) => ({ file: moveChoice(file, at, index, by) });

/**
 * What a ref may name, changed. Its records' values keep naming the same records between one
 * type and several (retargetRefs); a type taken off leaves its refs, which won't fit.
 */
export const targetsChange =
  (at: DefPath, types: readonly string[]): FieldChange =>
  (file) => {
    if (types.length === 0) throw new Error('A ref names at least one type');
    const before = nodeAt(file, [...at, 'to']);
    const after = targetsValue(types);
    return { file: setInTypeFile(file, [...at, 'to'], after), rewrite: retargetRefs(file, at, before, after) };
  };
