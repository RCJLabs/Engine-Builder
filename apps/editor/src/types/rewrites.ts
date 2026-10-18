/**
 * What a change to a type does to its records (M2.6). Renames carry the data, as Evan chose (D33):
 * a field renamed is renamed in every record, a choice renamed changes the records that hold it,
 * and a record or a type renamed changes every reference to it. A field removed goes from the
 * records, and a required field added is filled in on them.
 *
 * Each is a plain function of one record's JSON, given the type file of its type, that gives the
 * record back as it was when there is nothing to change. typeEdits.ts makes them steps.
 */
import { formatRef, isRecordId, parseRef } from '@eb/core';
import { renameKey, withKey } from '../forms/values.ts';
import { type DefPath, eachDef, fieldNames, isKeysPath, isObject, mapAt, valuesAt } from './defPaths.ts';

export type Rewrite = (record: unknown) => unknown;
type Json = Record<string, unknown>;

export const compose =
  (rewrites: readonly Rewrite[]): Rewrite =>
  (record) =>
    rewrites.reduce((value, rewrite) => rewrite(value), record);

/** Applies `change` to each object of the group at `group`: the record itself for []. */
const inGroups = (file: unknown, group: DefPath, change: (object: Json) => Json): Rewrite => {
  return (record) => mapAt(file, group, record, (node) => (isObject(node) ? change(node) : node));
};

/** Counts the objects of the group at `group` in `record` for which `test` holds. */
function countGroups(file: unknown, group: DefPath, record: unknown, test: (object: Json) => boolean): number {
  return valuesAt(file, group, record).filter((node) => isObject(node) && test(node)).length;
}

/** The field `from` renamed `to` where it stands, in each object of the group; an object holding both keeps them. */
export const renameField = (file: unknown, group: DefPath, from: string, to: string): Rewrite =>
  inGroups(file, group, (object) => (Object.hasOwn(object, from) ? (renameKey(object, from, to) ?? object) : object));

/** The objects that hold both `from` and `to`: renaming would lose one, so the rename is refused. */
export const renameClashes = (file: unknown, group: DefPath, from: string, to: string, record: unknown): number =>
  countGroups(file, group, record, (object) => Object.hasOwn(object, from) && Object.hasOwn(object, to));

export const removeField = (file: unknown, group: DefPath, name: string): Rewrite =>
  inGroups(file, group, (object) => (Object.hasOwn(object, name) ? withKey(object, name, undefined) : object));

/** `name` set to `value` in each object of the group that leaves it out, where the type lists it. */
export function fillField(file: unknown, group: DefPath, name: string, value: unknown): Rewrite {
  const order = fieldNames(file, group);
  return inGroups(file, group, (object) =>
    Object.hasOwn(object, name) ? object : withKey(object, name, structuredClone(value), order),
  );
}

/** The objects of the group that leave `name` out: what fillField fills. */
export const missingField = (file: unknown, group: DefPath, name: string, record: unknown): number =>
  countGroups(file, group, record, (object) => !Object.hasOwn(object, name));

/**
 * A map's keys changed by `swap`, each where it stands. A key that would take one already there
 * stays as it is: the map can't hold both.
 */
function swapKeys(map: Json, swap: (key: string) => string): Json {
  const keys = Object.keys(map);
  const staying = new Set(keys.filter((key) => swap(key) === key));
  const used = new Set<string>();
  let changed = false;
  const entries = Object.entries(map).map(([key, value]) => {
    const swapped = swap(key);
    const next = swapped !== key && !staying.has(swapped) && !used.has(swapped) ? swapped : key;
    used.add(next);
    changed ||= next !== key;
    return [next, value] as const;
  });
  return changed ? Object.fromEntries(entries) : map;
}

/** Where a def's values are, for a change to each: the values at its path, or, for a map's keys, the maps' keys. */
function atValues(file: unknown, path: DefPath, key: boolean, swap: (value: string) => string): Rewrite {
  if (key)
    return (record) => mapAt(file, path.slice(0, -1), record, (map) => (isObject(map) ? swapKeys(map, swap) : map));
  return (record) => mapAt(file, path, record, (value) => (typeof value === 'string' ? swap(value) : value));
}

/** The choice `from` renamed `to` in every value of the enum at `at`: fields, items, map values, or a map's keys. */
export const renameChoice = (file: unknown, at: DefPath, from: string, to: string): Rewrite =>
  atValues(file, at, isKeysPath(at), (value) => (value === from ? to : value));

/** A ref def: a field or item, or a map's keys, with the types it may name, and whether it names one alone. */
export interface RefSite {
  readonly path: DefPath;
  readonly key: boolean;
  readonly to: readonly string[];
  /** `to` is one type, so the values are bare ids; otherwise "type:id". */
  readonly single: boolean;
}

export function refSites(file: unknown): RefSite[] {
  const sites: RefSite[] = [];
  eachDef(file, (def, kind, path, key) => {
    if (kind !== 'ref') return;
    const single = typeof def.to === 'string';
    const to = single ? [def.to as string] : Array.isArray(def.to) ? def.to.filter((t) => typeof t === 'string') : [];
    sites.push({ path, key, to, single });
  });
  return sites;
}

/** Every reference to the record `type:from` made to name `type:to`, wherever a record of this type file makes one. */
export function renameRecordRefs(file: unknown, type: string, from: string, to: string): Rewrite {
  const was = formatRef(type, from);
  const now = formatRef(type, to);
  return compose(
    refSites(file)
      .filter((site) => site.to.includes(type))
      .map((site) =>
        atValues(file, site.path, site.key, site.single ? (v) => (v === from ? to : v) : (v) => (v === was ? now : v)),
      ),
  );
}

/** Every "from:id" a field of several types holds made "to:id". A field of one type holds bare ids, which stay. */
export function renameTypeRefs(file: unknown, from: string, to: string): Rewrite {
  const swap = (value: string) => {
    const ref = parseRef(value);
    return ref?.type === from ? formatRef(to, ref.id) : value;
  };
  return compose(
    refSites(file)
      .filter((site) => !site.single && site.to.includes(from))
      .map((site) => atValues(file, site.path, site.key, swap)),
  );
}

/**
 * A ref's values kept naming the same records when what it may name changes between one type
 * and several: from one type, its bare ids take that type ("ludus-magnus" becomes
 * "school:ludus-magnus"); to one type, refs of that type drop it. Others are left, and won't fit.
 */
export function retargetRefs(file: unknown, at: DefPath, before: unknown, after: unknown): Rewrite {
  const key = isKeysPath(at);
  if (typeof before === 'string' && Array.isArray(after)) {
    return atValues(file, at, key, (v) => (isRecordId(v) ? formatRef(before, v) : v));
  }
  if (Array.isArray(before) && typeof after === 'string') {
    return atValues(file, at, key, (v) => {
      const ref = parseRef(v);
      return ref?.type === after ? ref.id : v;
    });
  }
  return (record) => record;
}

/**
 * Where a record's conditions mention `id` as a word: they may name the record, and the editor
 * can't tell, since it doesn't know the game's facts (Phase 3). They aren't changed; a rename lists
 * them. Gives the def paths of the condition fields that do.
 */
export function conditionMentions(file: unknown, record: unknown, id: string): DefPath[] {
  const word = new RegExp(`(?<![A-Za-z0-9_.-])(?:[a-z0-9-]+:)?${id}(?![A-Za-z0-9_.:-])`);
  const mentions = (value: unknown): boolean =>
    typeof value === 'string'
      ? word.test(value)
      : Array.isArray(value)
        ? value.some(mentions)
        : isObject(value) && Object.values(value).some(mentions);
  const found: DefPath[] = [];
  eachDef(file, (_def, kind, path) => {
    if (kind === 'condition' && valuesAt(file, path, record).some(mentions)) found.push(path);
  });
  return found;
}
