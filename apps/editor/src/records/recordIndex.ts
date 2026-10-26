/**
 * Every record of the open project, read and checked (M2.5): each record's value, its problems
 * and what it refers to, and the other way round, what refers to it. The Records panel's rows and
 * the inspector's "used by" read it. The checks are the compiler's own (validateRecords), so a
 * table and `eb validate` never disagree.
 *
 * It is kept up to date by file. A record's problems depend on its own value, on which records
 * exist (for its references) and on the types and assets, nothing else. So an edit checks again
 * only the records it changed; creating or deleting a record also checks those that refer to it,
 * which "used by" already knows, references to missing records included; and a change to the
 * types or the assets checks them all. Flags are the exception (M3.1): a flag's lint reads every
 * record that names it, and a set-flag's check reads the flag, so a change to any record that
 * names a flag checks all of them again (flagRelated), and so do loot tables and shops (M3.3,
 * lootRelated), and stats, actors and, with gear, items (M3.4, statRelated, wornRelated). The game's facts, events and effects (M3.2) are grounds like the types: a script
 * that changes what the game declares checks them all.
 *
 * A scene (M3.11, D49) is a talk whose file is scenes/<id>.ink: it is compiled as it is read, and
 * again when the grounds change, since its EXTERNALs name the game's facts; its own problems
 * stand in for its checks, and its checks are given at the scene's lines.
 */
import { atSceneLine, type ProjectSource, parseJsonFile, readFiles, type SpaceUse, scenePath } from '@eb/compiler';
import { type FactCatalog, FLAG, formatRef } from '@eb/core';
import { compileScene, type SourceMap } from '@eb/ink';
import { TALK } from '@eb/kits';
import {
  compareText,
  type Diagnostic,
  type FlagUses,
  knownFrom,
  type RecordInput,
  type SpaceSpawns,
  type SpaceTags,
  severityOf,
  type Usage,
  validateRecords,
  type Walkers,
} from '@eb/schema';
import { type Catalog, recordFile } from '../forms/catalog.ts';
import type { GameChecks } from '../scripts/gameState.ts';
import { relatedFor } from './flagRelated.ts';

/** A reference out of a record: the "type:id" it names, and where in the record. */
export interface Ref {
  readonly to: string;
  readonly path: string;
}

export interface IndexedRecord {
  /** "type:id". */
  readonly key: string;
  readonly type: string;
  readonly id: string;
  readonly file: string;
  /** The file as read, to tell whether it changed. */
  readonly bytes: Uint8Array;
  /** Undefined when the file isn't JSON; `unreadable` says why. */
  readonly value: unknown;
  readonly unreadable?: string;
  /** False when its type has no sound type file: the record is there, but nothing checks it. */
  readonly checked: boolean;
  readonly problems: readonly Diagnostic[];
  readonly refs: readonly Ref[];
  /** The files under assets/ its asset fields name (M2.7): `to` is the path inside assets/. */
  readonly assets: readonly Ref[];
  /** A talk compiled from a scene (M3.11): where each part of it was written, and the scene's own problems. */
  readonly scene?: { readonly map: SourceMap; readonly problems: readonly Diagnostic[] };
}

export interface RecordIndex {
  /** By "type:id". */
  readonly records: ReadonlyMap<string, IndexedRecord>;
  /**
   * What refers to each "type:id", sorted by record, path and file as validateRecords sorts them.
   * References to records that aren't there are kept, so a deleted record's users can be found.
   */
  readonly usedBy: ReadonlyMap<string, readonly Usage[]>;
  /** What names each file under assets/ (M2.7), by its path inside assets/, files that aren't there included. */
  readonly assetUsers: ReadonlyMap<string, readonly Usage[]>;
  /** The types, assets and game the records were checked against (groundsOf). */
  readonly grounds: string;
  /** The flags' uses outside the records the flags were linted with (M5.8): the zones' and the screens'. */
  readonly flagsElsewhere?: FlagUses;
  /** The problems of the screens under ui/ (M4.1), checked against the game once the records are (screenChecks.ts). */
  readonly screens?: readonly Diagnostic[];
  /** export.json's problems (M4.10), checked once the records are, since editions read their used-by (exportChecks.ts). */
  readonly exports?: readonly Diagnostic[];
  /** guide.json's problems (M4.11), checked against the project's files (guideChecks.ts). */
  readonly guide?: readonly Diagnostic[];
  /** The spaces' and prefabs' problems that need the records (M5.2), checked once they are (spaceChecks.ts). */
  readonly spaces?: readonly Diagnostic[];
  /** What in spaces/ and prefabs/ names each "type:id" (M5.2): a placed record, a ref in a component or an override. */
  readonly spaceUsers?: ReadonlyMap<string, readonly SpaceUse[]>;
  /** The model records' files' problems (M5.5), E070 and W146, checked once the records are (modelChecks.ts). */
  readonly models?: readonly Diagnostic[];
}

export const EMPTY_INDEX: RecordIndex = { records: new Map(), usedBy: new Map(), assetUsers: new Map(), grounds: '' };

/**
 * What a record's checks depend on besides the records: the sound types' fields, the assets, the
 * kits and their calendar, and the game's checks. What only names things (a type's title and description, its name field, a
 * field's label and help) changes no check, so typing a label in the type designer (M2.6) checks
 * nothing again, and nor does a script edit that leaves what the game declares as it was.
 */
const groundsOf = (catalog: Catalog, game: GameChecks): string =>
  JSON.stringify([
    [...catalog.types].map(([type, data]) => [type, checked(data.file.fields)]),
    catalog.assets,
    // A kit brings facts, events and effects as well as types (M3.3), the time kit's effects in the
    // calendar's units (M3.5).
    catalog.kits,
    catalog.calendar ?? null,
    [game.facts ?? null, game.events ?? null, game.effectNames ?? null],
  ]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Fields without their labels and help, all the way down: what checks a record. */
function checked(fields: unknown): unknown {
  if (!isObject(fields)) return fields;
  const bare = (def: unknown): unknown => {
    if (!isObject(def)) return def;
    const { label: _label, description: _help, ...rest } = def;
    if (rest.of !== undefined) rest.of = bare(rest.of);
    if (rest.key !== undefined) rest.key = bare(rest.key);
    if (rest.fields !== undefined) rest.fields = checked(rest.fields);
    return rest;
  };
  return Object.fromEntries(Object.entries(fields).map(([name, def]) => [name, bare(def)]));
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/** A record as its file reads, before it is checked. */
function readRecord(type: string, id: string, file: string, bytes: Uint8Array, catalog: Catalog): IndexedRecord {
  const parsed = parseJsonFile(bytes);
  const at = {
    key: formatRef(type, id),
    type,
    id,
    file,
    bytes,
    checked: catalog.types.has(type),
    refs: [],
    assets: [],
  };
  return parsed.ok
    ? { ...at, value: parsed.value, problems: [] }
    : { ...at, value: undefined, unreadable: parsed.message, problems: [] };
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

/** A scene as its file reads, compiled into its talk with the game's facts: the talk to check, or its own problems. */
function readScene(id: string, file: string, bytes: Uint8Array, catalog: Catalog, facts: FactCatalog): IndexedRecord {
  const at = {
    key: formatRef(TALK, id),
    type: TALK,
    id,
    file,
    bytes,
    checked: catalog.types.has(TALK),
    refs: [],
    assets: [],
  };
  const own = (code: Diagnostic['code'], message: string, line?: number, column?: number): Diagnostic => ({
    code,
    severity: severityOf(code),
    message,
    type: TALK,
    id,
    file,
    path: '',
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
  });
  let text: string;
  try {
    text = utf8.decode(bytes);
  } catch {
    const problems = [own('E046', 'Not valid UTF-8 text')];
    return { ...at, value: undefined, unreadable: 'not UTF-8', scene: { map: {}, problems }, problems: [] };
  }
  const { talk, map, problems } = compileScene(text, { facts });
  if (talk !== undefined) return { ...at, value: talk, scene: { map, problems: [] }, problems: [] };
  const found = problems.map((p) => own(p.code, p.message, p.line, p.column));
  return { ...at, value: undefined, unreadable: 'scene', scene: { map, problems: found }, problems: [] };
}

/** The facts a scene's EXTERNALs name: the game's and the kits', as compileProject reads them. */
const factsOf = (catalog: Catalog, game: GameChecks): FactCatalog =>
  knownFrom({ ...game, kits: catalog.kits, ...(catalog.calendar ? { calendar: catalog.calendar } : {}) }).facts;

/**
 * The index after `paths` changed, or after anything may have changed (`paths` null, as when the
 * project opens). Only files that are named, or not in the index yet, are read; a record whose
 * bytes come back the same keeps its entry, checks and all.
 */
export async function updateIndex(
  before: RecordIndex,
  source: ProjectSource,
  catalog: Catalog,
  paths: readonly string[] | null,
  game: GameChecks = {},
  flagsElsewhere?: FlagUses,
): Promise<RecordIndex> {
  const named = new Set(paths ?? []);
  const listed: { type: string; id: string; file: string; key: string }[] = [];
  const sceneOf = (type: string, id: string) => type === TALK && catalog.scenes.has(id);
  for (const [type, ids] of catalog.records) {
    for (const id of ids) {
      const file = sceneOf(type, id) ? scenePath(id) : recordFile(type, id);
      listed.push({ type, id, file, key: formatRef(type, id) });
    }
  }
  const grounds = groundsOf(catalog, game);
  const facts = factsOf(catalog, game);
  const reread = (type: string, id: string, file: string, bytes: Uint8Array) =>
    sceneOf(type, id) ? readScene(id, file, bytes, catalog, facts) : readRecord(type, id, file, bytes, catalog);
  const stale = listed.filter(({ file, key }) => paths === null || named.has(file) || !before.records.has(key));
  const read = await readFiles(
    source,
    stale.map(({ file }) => file),
  );
  const reading = new Set(stale.map(({ key }) => key));
  const records = new Map<string, IndexedRecord>();
  const dirty = new Set<string>();
  for (const { type, id, file, key } of listed) {
    const known = before.records.get(key);
    // A type file that came or went since: checked again below, with everything else.
    const old = known && known.checked !== catalog.types.has(type) ? { ...known, checked: !known.checked } : known;
    const bytes = read.get(file);
    // A record that became a scene or stopped being one, or a scene whose EXTERNALs' facts may have changed.
    const recompiled = old && (old.file !== file || (sceneOf(type, id) && grounds !== before.grounds));
    if (recompiled) {
      records.set(key, reread(type, id, file, bytes ?? old.bytes));
      dirty.add(key);
    } else if (!reading.has(key) && old) records.set(key, old);
    // Read again and the same: nothing about it changed.
    else if (bytes !== undefined && old && sameBytes(old.bytes, bytes)) records.set(key, old);
    // Gone between the listing and the read: left out, like a file deleted.
    else if (bytes !== undefined) {
      records.set(key, reread(type, id, file, bytes));
      dirty.add(key);
    }
  }
  // A record created or deleted changes the problems of those that refer to it.
  const appeared = [...records.keys()].filter((key) => !before.records.has(key));
  const went = [...before.records.keys()].filter((key) => !records.has(key));
  for (const key of [...appeared, ...went]) {
    for (const usage of before.usedBy.get(key) ?? []) if (records.has(usage.from)) dirty.add(usage.from);
  }
  // The zones or the screens set or read other flags: each flag's lint again (M5.8).
  if (usesKey(flagsElsewhere) !== usesKey(before.flagsElsewhere)) {
    for (const record of records.values()) if (record.type === FLAG) dirty.add(record.key);
  }
  // What the zones and interacts hold changed (M5.9): every record again, as the kits' checks hear it all.
  const held = heldKey(flagsElsewhere) !== heldKey(before.flagsElsewhere);
  const checking = grounds === before.grounds && !held ? dirty : new Set(records.keys());
  // A record's enter-space names a space and a spawn point (E076): the spaces' read gives them (M5.9),
  // and where each actor stands for a walk-to (E079, M6.2).
  const spawned = {
    ...(flagsElsewhere?.spawns ? { spaces: flagsElsewhere.spawns } : {}),
    ...(flagsElsewhere?.walkers ? { walkers: flagsElsewhere.walkers } : {}),
    // A quest's targets name spaces' objects (E086, M6.6).
    ...(flagsElsewhere?.objects ? { objects: flagsElsewhere.objects } : {}),
    // A quest's world slots find spaces and objects by their tags (E088, W127, M6.7).
    ...(flagsElsewhere?.tags ? { tags: flagsElsewhere.tags } : {}),
  };
  const checks = flagsElsewhere ? { ...game, flagsElsewhere, ...spawned } : game;
  check(records, checking, catalog, checks);
  // Read after the check, so the records just checked count by what they name now.
  const touched = (related: (r: IndexedRecord | undefined) => boolean) =>
    [...checking, ...went].some((key) => related(records.get(key)) || related(before.records.get(key)));
  const widen = relatedFor(catalog.kits).filter(touched);
  const more = [...records.values()].filter((r) => widen.some((related) => related(r)) && !checking.has(r.key));
  if (more.length > 0) check(records, new Set([...checking, ...more.map((r) => r.key)]), catalog, checks);
  return {
    records,
    usedBy: usedByOf(records, 'refs'),
    assetUsers: usedByOf(records, 'assets'),
    grounds,
    ...(flagsElsewhere ? { flagsElsewhere } : {}),
  };
}

/**
 * Checks the `dirty` records, in place. Every other record goes to validateRecords as there but
 * unread, so references to it resolve and nothing about it is checked again.
 */
/** The uses as text, each list sorted: two reads of the same project give the same key. */
export const usesKey = (uses: FlagUses | undefined): string => {
  if (!uses) return '';
  const listed = (map: ReadonlyMap<string, ReadonlySet<string>>) =>
    [...map].map(([flag, from]) => [flag, [...from].sort()] as const).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return JSON.stringify([listed(uses.set), listed(uses.read), heldKey(uses)]);
};

/**
 * What the zones and interacts hold (M5.9), each space's spawn points and where each actor stands
 * (M6.2), as text: the spaces are walked in one order, so it is the same each read. Any of them
 * changing checks the records again, a space with no zone or use at all as much as any.
 */
const heldKey = (uses: FlagUses | undefined): string => {
  if (!uses) return '';
  const held = uses.held ?? { effects: [], conditions: [] };
  const effects = held.effects.map(({ file, path, effect }) => [file, path, effect]);
  const conditions = held.conditions.map(({ file, sound }) => [file, sound.at(''), sound.tree]);
  const spawns = [...(uses.spawns ?? [])]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([space, points]) => [space, [...points].sort()]);
  const walkers = [...(uses.walkers ?? [])]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([actor, w]) => [actor, w.space, w.navmesh, [...w.objects].sort()]);
  const objects = [...(uses.objects ?? [])]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([space, paths]) => [space, [...paths].sort()]);
  // The spaces' tags (M6.7): a tag added or taken off checks the quests' world slots again.
  const tags = uses.tags
    ? [uses.tags.spaces, uses.tags.actors, ...uses.tags.objects.values()].map((map) =>
        [...map].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
      )
    : [];
  const tagged = [...(uses.tags?.objects.keys() ?? [])].sort();
  return JSON.stringify([effects, conditions, spawns, walkers, objects, tagged, tags]);
};

function check(
  records: Map<string, IndexedRecord>,
  dirty: ReadonlySet<string>,
  catalog: Catalog,
  game: GameChecks & {
    readonly flagsElsewhere?: FlagUses;
    readonly spaces?: SpaceSpawns;
    readonly walkers?: Walkers;
    readonly objects?: ReadonlyMap<string, ReadonlySet<string>>;
    readonly tags?: SpaceTags;
  },
): void {
  if (dirty.size === 0) return;
  // As the compiler does: a record of a type whose file has problems isn't checked, and one of a
  // type with no file at all is, for its E002 (M2.8: the Problems panel lists it).
  const validated = (record: IndexedRecord) => record.unreadable === undefined && !catalog.broken.has(record.type);
  const inputs: RecordInput[] = [];
  for (const record of records.values()) {
    const { type, id, file, value } = record;
    const checks = dirty.has(record.key) && validated(record);
    inputs.push(checks ? { type, id, file, value } : { type, id, file, value: undefined, unreadable: true });
  }
  const { diagnostics, usedBy, assetsUsedBy } = validateRecords(catalog.recordTypes, inputs, {
    ...game,
    kits: catalog.kits,
    ...(catalog.calendar ? { calendar: catalog.calendar } : {}),
    assets: new Set(catalog.assets),
  });
  const problems = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics)
    push(problems, formatRef(diagnostic.type ?? '', diagnostic.id ?? ''), diagnostic);
  const byRecord = (used: ReadonlyMap<string, readonly Usage[]>) => {
    const found = new Map<string, Ref[]>();
    for (const [to, usages] of used) for (const { from, path } of usages) push(found, from, { to, path });
    return found;
  };
  const refs = byRecord(usedBy);
  const assets = byRecord(assetsUsedBy);
  for (const key of dirty) {
    const record = records.get(key) as IndexedRecord;
    const checked = record.checked && record.unreadable === undefined;
    records.set(key, {
      ...record,
      problems:
        record.unreadable === undefined
          ? validated(record)
            ? placed(record, problems.get(key) ?? [])
            : []
          : (record.scene?.problems ?? [unreadable(record)]),
      refs: checked ? (refs.get(key) ?? []) : [],
      assets: checked ? (assets.get(key) ?? []) : [],
    });
  }
}

/** A scene's checks at the scene's lines, as `eb` gives them. */
const placed = (record: IndexedRecord, found: readonly Diagnostic[]): readonly Diagnostic[] => {
  const map = record.scene?.map;
  if (map === undefined) return found;
  const maps = new Map([[record.file, map]]);
  return found.map((d) => atSceneLine(d, maps));
};

function push<T>(map: Map<string, T[]>, key: string, item: T): void {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

/** The diagnostic the compiler gives a record file that isn't JSON. */
const unreadable = ({ type, id, file, unreadable }: IndexedRecord): Diagnostic => ({
  code: 'E007',
  severity: 'error',
  message: unreadable ?? '',
  type,
  id,
  file,
  path: '',
});

const byUsage = (a: Usage, b: Usage) =>
  compareText(a.from, b.from) || compareText(a.path, b.path) || compareText(a.file ?? '', b.file ?? '');

/** "Used by" from every record's references, or from the assets they name, in validateRecords's order. */
function usedByOf(records: ReadonlyMap<string, IndexedRecord>, what: 'refs' | 'assets'): Map<string, readonly Usage[]> {
  const found = new Map<string, Usage[]>();
  for (const record of records.values()) {
    for (const { to, path } of record[what]) push(found, to, { from: record.key, file: record.file, path });
  }
  for (const list of found.values()) list.sort(byUsage);
  return found;
}

/** The records that refer to `key`, each once, in order. */
export const usersOf = (index: RecordIndex, key: string): string[] => [
  ...new Set((index.usedBy.get(key) ?? []).map((usage) => usage.from)),
];

/** The records whose asset fields name the file at `path` inside assets/, each once, in order (M2.7). */
export const assetUsersOf = (index: RecordIndex, path: string): string[] => [
  ...new Set((index.assetUsers.get(path) ?? []).map((usage) => usage.from)),
];

/**
 * The records outside `keys` that refer to one of them: whose references deleting them all would
 * break. A record that refers to another being deleted with it doesn't count.
 */
export function usersOutside(index: RecordIndex, keys: ReadonlySet<string>): string[] {
  const users = new Set<string>();
  for (const key of keys) for (const user of usersOf(index, key)) if (!keys.has(user)) users.add(user);
  return [...users].sort(compareText);
}
