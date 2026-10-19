import { isRecordId, QUALIFIED_REF_PATTERN, RECORD_ID_PATTERN, SLOT_PATTERN } from '@eb/core';
import { z } from 'zod';

/**
 * The metadata key that marks a reference field. It reaches the JSON Schema export unchanged, so
 * the editor and VS Code can tell which records a field points at.
 */
export const REF_KEY = 'x-eb-ref';

/**
 * A string: the field holds the bare id of a record of that type. A list: the field holds
 * "type:id", and the type must be one of these (sorted, no repeats).
 */
export type RefTarget = string | readonly string[];

const inner = (pattern: RegExp) => pattern.source.slice(1, -1);
// A quest's slot stands where a record goes (M3.10): which slot, and where, is E044's.
export const ID_OR_SLOT_PATTERN = new RegExp(`^(?:${inner(RECORD_ID_PATTERN)}|${inner(SLOT_PATTERN)})$`);
export const QUALIFIED_OR_SLOT_PATTERN = new RegExp(`^(?:${inner(QUALIFIED_REF_PATTERN)}|${inner(SLOT_PATTERN)})$`);

/** A field holding the bare id of a `type` record: `"loot": "salvage"`, or a quest's slot, `"@mark"`. */
export function ref(type: string): z.ZodString {
  if (!isRecordId(type)) throw new RangeError(`ref(): "${type}" is not a valid record type name`);
  // An empty ref is one not yet chosen, as a new record's are (M2.4): it gets its own words.
  return z
    .string()
    .min(1, { error: `No ${type} chosen yet`, abort: true })
    .regex(ID_OR_SLOT_PATTERN, { error: `Not a valid ${type} id: use lowercase words joined by hyphens` })
    .meta({ [REF_KEY]: type });
}

/** A field holding "type:id" for a record of any of `types`: `"give": "item:medkit"`. */
export function refAny(types: readonly string[]): z.ZodString {
  const sorted = [...new Set(types)].sort();
  if (sorted.length === 0) throw new RangeError('refAny(): name at least one record type');
  for (const type of sorted) {
    if (!isRecordId(type)) throw new RangeError(`refAny(): "${type}" is not a valid record type name`);
  }
  // The allowed types are checked when references resolve (E006), not here, so a record of the
  // wrong type gets its own message rather than a pattern mismatch.
  return z
    .string()
    .min(1, { error: `No record chosen yet: a ${sorted.join(' or ')}`, abort: true })
    .regex(QUALIFIED_OR_SLOT_PATTERN, { error: `Expected "type:id", where type is one of: ${sorted.join(', ')}` })
    .meta({ [REF_KEY]: sorted });
}

/**
 * The reference target a schema carries, if any. Throws when the metadata is malformed, which
 * only happens if it was written by hand instead of through ref() or refAny().
 */
export function refTargetOf(schema: z.core.$ZodType): RefTarget | undefined {
  const target: unknown = z.globalRegistry.get(schema)?.[REF_KEY];
  if (target === undefined) return undefined;
  if (isRecordId(target)) return target;
  if (
    Array.isArray(target) &&
    target.length > 0 &&
    target.every((type, i) => isRecordId(type) && (i === 0 || (target[i - 1] as string) < type))
  ) {
    return target as readonly string[];
  }
  throw new TypeError(`${REF_KEY} must be a record type name or a sorted list of them; use ref() or refAny()`);
}

export const targetTypes = (target: RefTarget): readonly string[] => (typeof target === 'string' ? [target] : target);
