/**
 * Paths into a type file's JSON (M2.6), and the values in records that each one describes. A path
 * names what the type file holds there: ['fields', 'might'] is a field, ['fields', 'skills', 'of']
 * a list's items, ['fields', 'kit', 'key'] a map's keys, ['fields', 'record', 'fields', 'wins'] a
 * field of a group, and [] the record itself, as a group of the type's fields.
 *
 * Type files with problems are walked too, as far as they make sense: a type file being fixed is
 * still the type of its records. So nothing here trusts the file's shape.
 */
import { FIELD_KINDS, type FieldKind } from '@eb/schema';
import { type Path, setInOrder, withKey } from '../forms/values.ts';

export type DefPath = readonly string[];
type Json = Record<string, unknown>;

export const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The kind of the def at `node`, or undefined when it isn't one. */
export function kindOf(node: unknown): FieldKind | undefined {
  const kind = isObject(node) ? node.kind : undefined;
  return typeof kind === 'string' && (FIELD_KINDS as readonly string[]).includes(kind)
    ? (kind as FieldKind)
    : undefined;
}

/** The node at `path` in the type file's JSON, or undefined when there is none. */
export function nodeAt(file: unknown, path: Path): unknown {
  let node = file;
  for (const key of path) {
    if (typeof key === 'number' ? !Array.isArray(node) : !isObject(node) || !Object.hasOwn(node, key)) return undefined;
    node = (node as Record<string | number, unknown>)[key];
  }
  return node;
}

/** A step from a def to the next: into one of a group's fields, a list's items or a map's values or keys. */
export type Step = { readonly field: string } | { readonly into: 'of' | 'key' };

/** A def path as steps, or undefined when it isn't one: ['fields', 'kit', 'key'] is kit, then its keys. */
export function stepsOf(path: DefPath): Step[] | undefined {
  const steps: Step[] = [];
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    if (key === 'fields' && i + 1 < path.length) steps.push({ field: path[++i] as string });
    else if (key === 'of' || key === 'key') steps.push({ into: key });
    else return undefined;
  }
  return steps;
}

/** Whether the def at `path` is a map's keys: read from the start, since a field may be named "key". */
export function isKeysPath(path: DefPath): boolean {
  const last = stepsOf(path)?.at(-1);
  return last !== undefined && 'into' in last && last.into === 'key';
}

/** What the object at `at` in a type file is, from where it sits: the file, a list of fields, or a def. */
function roleOf(at: Path): 'file' | 'fields' | 'def' | 'other' {
  let role: 'file' | 'fields' | 'def' | 'other' = 'file';
  for (const key of at) {
    if (role === 'fields') role = 'def';
    else if (role === 'file') role = key === 'fields' ? 'fields' : 'other';
    else if (role === 'def') role = key === 'fields' ? 'fields' : key === 'of' || key === 'key' ? 'def' : 'other';
  }
  return role;
}

// The order the format lists keys in (type-files.md): a new key goes where it belongs among these.
const FILE_KEYS = ['title', 'description', 'nameField', 'fields'];
const DEF_KEYS = ['kind', 'to', 'values', 'key', 'of', 'fields', 'min', 'max', 'multiline'];
const INFO_KEYS = ['label', 'description', 'optional'];

/**
 * The type file with the value at `path` set, or taken out when `next` is undefined. A new key
 * goes where the format lists it; a new field goes last.
 */
export function setInTypeFile(file: unknown, path: Path, next: unknown): unknown {
  return setInOrder(file, path, next, (at) => {
    const role = roleOf(at);
    return role === 'file' ? FILE_KEYS : role === 'def' ? [...DEF_KEYS, ...INFO_KEYS] : [];
  });
}

/** Where a field's group sits: [] for the type's own fields, the group's def path for a group's. */
export const groupOf = (field: DefPath): DefPath => field.slice(0, -2);

/** The names of the fields of the group at `group`, in order. */
export function fieldNames(file: unknown, group: DefPath): string[] {
  const fields = nodeAt(file, [...group, 'fields']);
  return isObject(fields) ? Object.keys(fields) : [];
}

/**
 * Every def in the file, depth first in file order: its fields, each list's items, each map's
 * keys and values, each group's fields. `key` is true for a map's keys.
 */
export function eachDef(file: unknown, visit: (def: Json, kind: FieldKind, path: DefPath, key: boolean) => void): void {
  const value = (node: unknown, path: DefPath, key: boolean): void => {
    const kind = kindOf(node);
    if (kind === undefined) return;
    const def = node as Json;
    visit(def, kind, path, key);
    if (kind === 'list') value(def.of, [...path, 'of'], false);
    if (kind === 'map') {
      value(def.key, [...path, 'key'], true);
      value(def.of, [...path, 'of'], false);
    }
    if (kind === 'group') fields(def.fields, [...path, 'fields']);
  };
  const fields = (node: unknown, path: DefPath) => {
    if (!isObject(node)) return;
    for (const [name, def] of Object.entries(node)) value(def, [...path, name], false);
  };
  if (isObject(file)) fields(file.fields, ['fields']);
}

export type Change = (value: unknown) => unknown;

/**
 * `record` with `change` made to each value the def at `path` describes: the field's value in it,
 * in every item of a list on the way and in every value of a map. A path ending in a map's keys
 * reaches nothing: change the map instead. Gives back `record` itself, and every object on the
 * way, when nothing changed, so a record the change doesn't touch keeps its bytes.
 */
export function mapAt(file: unknown, path: DefPath, record: unknown, change: Change): unknown {
  const steps = stepsOf(path);
  return steps ? walk(file, true, steps, record, change) : record;
}

function walk(node: unknown, top: boolean, steps: readonly Step[], value: unknown, change: Change): unknown {
  const [step, ...rest] = steps;
  if (!step) return change(value);
  const kind = top ? 'group' : kindOf(node);
  if ('field' in step) {
    const fields = kind === 'group' && isObject(node) ? node.fields : undefined;
    const { field } = step;
    if (!isObject(fields) || !Object.hasOwn(fields, field) || !isObject(value) || !Object.hasOwn(value, field)) {
      return value;
    }
    const next = walk(fields[field], false, rest, value[field], change);
    return next === value[field] ? value : withKey(value, field, next);
  }
  if (step.into === 'key' || (kind !== 'list' && kind !== 'map')) return value;
  const of = (node as Json).of;
  const each = (item: unknown) => walk(of, false, rest, item, change);
  if (kind === 'list') {
    if (!Array.isArray(value)) return value;
    const items = value.map(each);
    return items.every((item, i) => item === value[i]) ? value : items;
  }
  if (!isObject(value)) return value;
  const entries = Object.entries(value).map(([key, item]) => [key, each(item)] as const);
  return entries.every(([key, item]) => item === value[key]) ? value : Object.fromEntries(entries);
}

/** Every value in `record` that the def at `path` describes. */
export function valuesAt(file: unknown, path: DefPath, record: unknown): unknown[] {
  const found: unknown[] = [];
  mapAt(file, path, record, (value) => {
    found.push(value);
    return value;
  });
  return found;
}
