/**
 * Record ids, references and the runtime record store (docs/specs/records.md).
 *
 * Records are the engine's Creation Kit forms: typed data with stable ids, such as items, actors
 * and loot tables. A project's records are checked when it compiles (@eb/schema); at runtime the
 * sim only looks them up, so this part is small and pure.
 */

export const MAX_ID_LENGTH = 64;

// Words of a-z and 0-9 joined by single hyphens. The lookahead caps the length, so the same
// piece works alone and on either side of the colon in "type:id", and JSON Schema can carry
// the whole rule as a `pattern`.
const ID = `(?=[a-z0-9-]{1,${MAX_ID_LENGTH}}(?![a-z0-9-]))[a-z0-9]+(?:-[a-z0-9]+)*`;

/** A record id or type name: `medkit`, `dead-hauler`, `loot-table`. No flags, so `test` keeps no state. */
export const RECORD_ID_PATTERN = new RegExp(`^${ID}$`);
/** A qualified reference: `item:medkit`. */
export const QUALIFIED_REF_PATTERN = new RegExp(`^${ID}:${ID}$`);

/**
 * A valid record id: lowercase kebab-case, at most 64 characters. Record type names follow the
 * same rule.
 */
export const isRecordId = (text: unknown): text is string => typeof text === 'string' && RECORD_ID_PATTERN.test(text);

export interface RecordKey {
  readonly type: string;
  readonly id: string;
}

/**
 * "type:id". A field whose schema names one target type holds the bare id ("salvage"); a field
 * that allows several types holds this qualified form.
 */
export const formatRef = (type: string, id: string): string => `${type}:${id}`;

/** Reads "type:id", or returns null when the text isn't a valid qualified reference. */
export function parseRef(text: string): RecordKey | null {
  if (!QUALIFIED_REF_PATTERN.test(text)) return null;
  const colon = text.indexOf(':');
  return { type: text.slice(0, colon), id: text.slice(colon + 1) };
}

/** Compiled records: `{ [type]: { [id]: value } }`. */
export type RecordPack = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

export interface RecordStore {
  /** Types that have at least one record, sorted. */
  types(): readonly string[];
  /** A type's ids, sorted, so iteration never depends on file or load order. */
  ids(type: string): readonly string[];
  /** A type's records as [id, value] pairs, sorted by id. */
  entries<T = unknown>(type: string): readonly (readonly [string, T])[];
  has(type: string, id: string): boolean;
  get<T = unknown>(type: string, id: string): T | undefined;
  /** Like get, but a missing record throws, naming it: content refs are checked at compile time. */
  getOrThrow<T = unknown>(type: string, id: string): T;
}

interface TypeIndex {
  ids: readonly string[];
  entries: readonly (readonly [string, unknown])[];
  byId: ReadonlyMap<string, unknown>;
}

const EMPTY: TypeIndex = { ids: Object.freeze([]), entries: Object.freeze([]), byId: new Map() };

/**
 * Indexes a compiled pack for lookups. Values are frozen in place, so sim code that tries to
 * change content throws instead of changing it for every later read.
 */
export function createRecordStore(pack: RecordPack): RecordStore {
  const index = new Map<string, TypeIndex>();
  const seen = new Set<object>();
  for (const type of Object.keys(pack).sort()) {
    if (!isRecordId(type)) throw new RangeError(`"${type}" is not a valid record type name`);
    const group = pack[type] ?? {};
    const ids = Object.keys(group).sort();
    if (ids.length === 0) continue;
    const entries = ids.map((id) => {
      if (!isRecordId(id)) throw new RangeError(`"${formatRef(type, id)}" does not have a valid record id`);
      return Object.freeze([id, deepFreeze(group[id], seen)] as const);
    });
    index.set(type, { ids: Object.freeze(ids), entries: Object.freeze(entries), byId: new Map(entries) });
  }
  const types = Object.freeze([...index.keys()]);
  const of = (type: string): TypeIndex => index.get(type) ?? EMPTY;

  return {
    types: () => types,
    ids: (type) => of(type).ids,
    entries: <T>(type: string) => of(type).entries as readonly (readonly [string, T])[],
    has: (type, id) => of(type).byId.has(id),
    get: <T>(type: string, id: string) => of(type).byId.get(id) as T | undefined,
    getOrThrow: <T>(type: string, id: string): T => {
      const { byId } = of(type);
      if (!byId.has(id)) throw new RangeError(`No record ${formatRef(type, id)}`);
      return byId.get(id) as T;
    },
  };
}

// Tracks what it has visited rather than trusting Object.isFrozen: a frozen object can still
// hold unfrozen children.
function deepFreeze<T>(value: T, seen: Set<object>): T {
  if (typeof value === 'object' && value !== null && !seen.has(value)) {
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
  }
  return value;
}
