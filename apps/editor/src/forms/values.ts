/**
 * The values forms write, as plain functions of JSON: what a new record or a new list item holds,
 * and a record with one value changed. A change copies only the objects on its way, keeps every
 * key where it was, and puts a new key where the type lists its field, so a diff shows one line.
 */
import type { Fields, TypeFile, ValueDef } from '@eb/schema';

/** Where a value sits in a record: object keys and list indexes, from the top. */
export type Path = readonly (string | number)[];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * What a new field holds before anyone fills it in. Some of these break the field's own rules (an
 * empty name, a ref not yet chosen), so the form shows at once what is left to fill in.
 */
export function emptyValue(def: ValueDef): unknown {
  switch (def.kind) {
    case 'text':
    case 'ref':
    case 'asset':
    case 'condition':
      return '';
    case 'int':
    case 'number':
      // Zero when the bounds allow it, else the bound nearest zero (an int's bounds are whole).
      return Math.min(Math.max(0, def.min ?? Number.NEGATIVE_INFINITY), def.max ?? Number.POSITIVE_INFINITY);
    case 'bool':
      return false;
    case 'enum':
      return def.values[0];
    case 'list':
    case 'effects':
      return [];
    case 'map':
      return {};
    case 'group':
      return newGroup(def.fields);
    case 'colour':
      return '#000000';
  }
}

/** A group's required fields, each empty; optional ones are left out. */
export function newGroup(fields: Fields): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(fields)) if (!def.optional) value[name] = emptyValue(def);
  return value;
}

export const newRecord = (file: TypeFile): Record<string, unknown> => newGroup(file.fields);

/** The field model for the value at `path`, or undefined when the type doesn't describe one there. */
export function defAt(file: TypeFile, path: Path): ValueDef | undefined {
  let def: ValueDef = { kind: 'group', fields: file.fields };
  for (const key of path) {
    if (def.kind === 'group' && typeof key === 'string' && Object.hasOwn(def.fields, key))
      def = def.fields[key] as ValueDef;
    else if (def.kind === 'list' && typeof key === 'number') def = def.of;
    else if (def.kind === 'map' && typeof key === 'string') def = def.of;
    else return undefined;
  }
  return def;
}

/** The value at `path`, or undefined when something on the way isn't there. */
export function getIn(root: unknown, path: Path): unknown {
  let node = root;
  for (const key of path) {
    if (typeof key === 'number' ? !Array.isArray(node) : !isObject(node)) return undefined;
    node = (node as Record<string | number, unknown>)[key];
  }
  return node;
}

/**
 * `root` with the value at `path` set to `next`, or removed when `next` is undefined. Objects and
 * lists on the way are copied, never changed. A key that isn't there yet goes where the type lists
 * it among the keys that are, or last when the type doesn't say.
 */
export function setIn(root: unknown, path: Path, next: unknown, file: TypeFile): unknown {
  return setInOrder(root, path, next, (at) => {
    const def = defAt(file, at);
    return def?.kind === 'group' ? Object.keys(def.fields) : [];
  });
}

/**
 * setIn for any JSON: a key that isn't there yet goes where `order` ranks it among the keys of
 * the object at `at`, or last. Type files (M2.6) rank theirs by the format's own key order.
 */
export function setInOrder(
  node: unknown,
  path: Path,
  next: unknown,
  order: (at: Path) => readonly string[],
  at: Path = [],
): unknown {
  if (path.length === 0) return next;
  const [key, ...rest] = path as [string | number, ...(string | number)[]];
  if (typeof key === 'number') {
    const list = Array.isArray(node) ? [...node] : [];
    const value = setInOrder(list[key], rest, next, order, [...at, key]);
    if (value === undefined && rest.length === 0) list.splice(key, 1);
    else list[key] = value;
    return list;
  }
  const object = isObject(node) ? node : {};
  const value = setInOrder(object[key], rest, next, order, [...at, key]);
  return withKey(object, key, value, order(at));
}

/** `object` with `key` set or removed in place among its keys, or, when new, placed by the type's `order`. */
export function withKey(
  object: Record<string, unknown>,
  key: string,
  value: unknown,
  order: readonly string[] = [],
): Record<string, unknown> {
  const entries = Object.entries(object);
  const index = entries.findIndex(([k]) => k === key);
  if (index >= 0) {
    if (value === undefined) entries.splice(index, 1);
    else entries[index] = [key, value];
  } else if (value !== undefined) {
    entries.splice(
      insertAt(
        entries.map(([k]) => order.indexOf(k)),
        order.indexOf(key),
      ),
      0,
      [key, value],
    );
  }
  // fromEntries makes "__proto__" an ordinary key, as JSON.parse does, never the object's prototype.
  return Object.fromEntries(entries);
}

/**
 * Where a new key goes among keys of these ranks in the type (-1 for keys it doesn't list): just
 * after the last key the type lists before it, else before the first it lists after it, else last.
 */
function insertAt(ranks: readonly number[], rank: number): number {
  if (rank < 0) return ranks.length;
  const before = ranks.findLastIndex((r) => r >= 0 && r < rank);
  if (before >= 0) return before + 1;
  const after = ranks.findIndex((r) => r > rank);
  return after >= 0 ? after : ranks.length;
}

/** `object` with the key `from` renamed `to` where it stands; null when `to` is taken already. */
export function renameKey(object: Record<string, unknown>, from: string, to: string): Record<string, unknown> | null {
  if (from === to) return object;
  if (Object.hasOwn(object, to)) return null;
  return Object.fromEntries(Object.entries(object).map(([k, v]) => (k === from ? [to, v] : [k, v])));
}

/** A list with the item at `from` moved to `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item as T);
  return out;
}

// What JSON writes as a number, and no more: no hex, no Infinity, no stray letters.
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** The number typed, or null when the text isn't one yet ("-", "1e", "12a"). */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!NUMBER.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * A slider's step for a number field: a power of ten near a hundredth of its range, so dragging
 * gives round values (0.01 for 0 to 1, 1 for 0 to 100). Whole numbers step by 1 at least.
 */
export function sliderStep(min: number, max: number, whole: boolean): number {
  const span = max - min;
  const step = span > 0 ? 10 ** Math.floor(Math.log10(span / 100)) : 1;
  return whole ? Math.max(1, step) : step;
}

/** `n` rounded to the step's decimals, so 0.1 + 0.2 lands as 0.3, not 0.30000000000000004. */
export function roundToStep(n: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return Number(n.toFixed(Math.min(decimals, 20)));
}
