/**
 * Made records (D44, docs/specs/sim.md#made-records): the content every module reads is the
 * pack's records with those modules make in play laid beside them, each read from its module's
 * slice as it is at that moment. A made record never shadows a content record or another
 * module's: one that would is a bug in the module, or content that validation should have stopped.
 */
import { formatRef, type RecordStore } from '../records.ts';
import { freezeJson } from './json.ts';
import type { MadeSpec } from './module.ts';

export interface Maker {
  readonly module: string;
  readonly spec: MadeSpec<unknown>;
}

// Frozen once each: a module hands back the same object while its slice holds it.
const frozen = new WeakSet<object>();

function freezeMade(value: unknown, type: string, id: string): unknown {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Made record ${formatRef(type, id)} is not an object`);
  }
  if (!frozen.has(value)) {
    freezeJson(value, `(made record ${formatRef(type, id)})`);
    frozen.add(value);
  }
  return value;
}

/**
 * The pack's content with the makers' records beside it. `read` gives a module's slice as it is
 * now. With no makers, the pack's content as it is.
 */
export function withMade(
  content: RecordStore,
  makers: readonly Maker[],
  read: (module: string) => unknown,
): RecordStore {
  if (makers.length === 0) return content;
  const makersOf = (type: string) => makers.filter((m) => m.spec.types.includes(type));
  const view = (maker: Maker) => ({ state: read(maker.module) as never, content });
  const madeGet = (type: string, id: string): unknown => {
    for (const maker of makersOf(type)) {
      const value = maker.spec.get(view(maker), type, id);
      if (value !== undefined) return freezeMade(value, type, id);
    }
    return undefined;
  };
  const ids = (type: string): readonly string[] => {
    const owners = makersOf(type);
    if (owners.length === 0) return content.ids(type);
    const all = [...content.ids(type)];
    const seen = new Set(all);
    for (const maker of owners) {
      for (const id of maker.spec.ids(view(maker), type)) {
        if (seen.has(id))
          throw new Error(`Made record ${formatRef(type, id)} (module ${maker.module}) is already a record`);
        seen.add(id);
        all.push(id);
      }
    }
    // As the pack's store sorts: by UTF-16 code units, so the order never depends on who made what.
    return all.sort();
  };
  const get = <T>(type: string, id: string): T | undefined =>
    (content.get<T>(type, id) ?? (madeGet(type, id) as T | undefined)) as T | undefined;
  return {
    types: () => {
      const made = makers.flatMap((m) => m.spec.types.filter((type) => m.spec.ids(view(m), type).length > 0));
      return [...new Set([...content.types(), ...made])].sort();
    },
    ids,
    entries: <T>(type: string) => ids(type).map((id) => [id, get<T>(type, id) as T] as const),
    has: (type, id) => content.has(type, id) || madeGet(type, id) !== undefined,
    get,
    getOrThrow: <T>(type: string, id: string): T => {
      const value = get<T>(type, id);
      if (value === undefined) throw new RangeError(`No record ${formatRef(type, id)}`);
      return value;
    },
  };
}
