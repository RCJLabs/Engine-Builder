/**
 * The changes the type designer (M2.6) makes to a type file's JSON, as plain functions: fields
 * added, removed, moved and renamed, a def's kind changed, choices and ref targets edited, and a
 * type's name changed where other types refer to it. Each gives the file back as it was when it
 * can't apply, and keeps every key where it stands (setInTypeFile), so a diff shows the change.
 */
import type { FieldKind } from '@eb/schema';
import { moveItem, renameKey } from '../forms/values.ts';
import { type DefPath, eachDef, isObject, nodeAt, setInTypeFile } from './defPaths.ts';

type Json = Record<string, unknown>;

const fieldsAt = (group: DefPath): DefPath => [...group, 'fields'];

/** The file's `nameField` when it names a top-level field, or undefined. */
const nameFieldOf = (file: unknown) =>
  isObject(file) && typeof file.nameField === 'string' ? file.nameField : undefined;

/** A field renamed where it stands. Records are known by it still when it was the name field. */
export function renameFieldDef(file: unknown, group: DefPath, from: string, to: string): unknown {
  const fields = nodeAt(file, fieldsAt(group));
  if (!isObject(fields) || !Object.hasOwn(fields, from)) return file;
  const renamed = renameKey(fields, from, to);
  if (!renamed) return file;
  const next = setInTypeFile(file, fieldsAt(group), renamed);
  return group.length === 0 && nameFieldOf(file) === from ? setInTypeFile(next, ['nameField'], to) : next;
}

/** A field taken out. Its records are known by their ids when it was the name field. */
export function removeFieldDef(file: unknown, group: DefPath, name: string): unknown {
  const next = setInTypeFile(file, [...fieldsAt(group), name], undefined);
  return group.length === 0 && nameFieldOf(file) === name ? setInTypeFile(next, ['nameField'], undefined) : next;
}

/** A new field, last in its group. */
export const addFieldDef = (file: unknown, group: DefPath, name: string, def: Json): unknown =>
  setInTypeFile(file, [...fieldsAt(group), name], def);

/** A field moved up (-1) or down (1) among its group's fields: the order forms show them in. */
export function moveFieldDef(file: unknown, group: DefPath, name: string, by: -1 | 1): unknown {
  const fields = nodeAt(file, fieldsAt(group));
  if (!isObject(fields)) return file;
  const entries = Object.entries(fields);
  const from = entries.findIndex(([key]) => key === name);
  const to = from + by;
  if (from < 0 || to < 0 || to >= entries.length) return file;
  return setInTypeFile(file, fieldsAt(group), Object.fromEntries(moveItem(entries, from, to)));
}

/** What a def of `kind` starts as: the options its kind can't do without, the simplest of each. */
export function startingDef(kind: FieldKind, choices: readonly string[], target: string): Json {
  switch (kind) {
    case 'enum':
      return { kind, values: [...choices] };
    case 'ref':
      return { kind, to: target };
    case 'list':
    case 'map':
      return { kind, of: { kind: 'text' } };
    case 'group':
      return { kind, fields: {} };
    default:
      return { kind };
  }
}

const INFO = ['label', 'description', 'optional'] as const;

/**
 * The def at `path` replaced by `def`, a def of another kind. A field keeps its label, its
 * description and whether it is optional; nothing else of the old kind carries over.
 */
export function replaceDef(file: unknown, path: DefPath, def: Json, field: boolean): unknown {
  const old = nodeAt(file, path);
  const kept: Json = { ...def };
  if (field && isObject(old)) for (const key of INFO) if (Object.hasOwn(old, key)) kept[key] = old[key];
  return setInTypeFile(file, path, kept);
}

/** The values of the enum at `at`, or [] when it has none. */
export function choicesAt(file: unknown, at: DefPath): string[] {
  const values = nodeAt(file, [...at, 'values']);
  return Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string') : [];
}

/** The enum's list of choices changed by `change`. */
function withChoices(file: unknown, at: DefPath, change: (values: unknown[]) => unknown[]): unknown {
  const values = nodeAt(file, [...at, 'values']);
  return setInTypeFile(file, [...at, 'values'], change(Array.isArray(values) ? [...values] : []));
}

export const addChoice = (file: unknown, at: DefPath, choice: string) =>
  withChoices(file, at, (values) => [...values, choice]);

export const removeChoice = (file: unknown, at: DefPath, index: number) =>
  withChoices(file, at, (values) => values.filter((_, i) => i !== index));

export const renameChoiceDef = (file: unknown, at: DefPath, index: number, to: string) =>
  withChoices(file, at, (values) => values.map((v, i) => (i === index ? to : v)));

export function moveChoice(file: unknown, at: DefPath, index: number, by: -1 | 1): unknown {
  const to = index + by;
  return withChoices(file, at, (values) => (to < 0 || to >= values.length ? values : moveItem(values, index, to)));
}

/** What a ref may name: one type is written as its name, several as a list. */
export const targetsValue = (types: readonly string[]): string | string[] =>
  types.length === 1 ? (types[0] as string) : [...types];

/** Every `to` in the file that names `from` made to name `to`: a type renamed. */
export function renameTypeInFile(file: unknown, from: string, to: string): unknown {
  let next = file;
  eachDef(file, (def, kind, path) => {
    if (kind !== 'ref') return;
    if (def.to === from) next = setInTypeFile(next, [...path, 'to'], to);
    else if (Array.isArray(def.to)) {
      for (const [i, type] of def.to.entries()) if (type === from) next = setInTypeFile(next, [...path, 'to', i], to);
    }
  });
  return next;
}

/** Where the file's refs name `type`: each ref def's path. */
export function refersTo(file: unknown, type: string): DefPath[] {
  const found: DefPath[] = [];
  eachDef(file, (def, kind, path) => {
    if (kind === 'ref' && (def.to === type || (Array.isArray(def.to) && def.to.includes(type)))) found.push(path);
  });
  return found;
}
