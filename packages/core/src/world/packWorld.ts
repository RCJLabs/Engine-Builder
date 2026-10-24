import { isRecordId } from '../records.ts';
import type { Triggers } from './world.ts';

/**
 * Format 9: the project's spaces walked in play (M5.8, D70, docs/specs/movement.md#spaces-in-the-pack-format-9).
 * The spaces and prefabs are the files as written, which only the stage reads; the trigger zones
 * are the sim's, resolved through prefabs and overrides by the compiler.
 */
export interface PackWorld {
  /** spaces/<id>.json by id, at least one. */
  readonly spaces: Readonly<Record<string, unknown>>;
  /** prefabs/<id>.json by id. */
  readonly prefabs: Readonly<Record<string, unknown>>;
  readonly triggers: Triggers;
  /** The terrain PNGs and model files the spaces draw from, base64 by their path in the project. */
  readonly files: Readonly<Record<string, string>>;
  /**
   * The records the spaces draw from, by "type:id": each placed record, the models and materials
   * they draw as, the spaces' environments and their terrains' foliage. The sim has them all; these
   * go to the page, which has none.
   */
  readonly records: Readonly<Record<string, unknown>>;
  /** Each placed record type's model field (M5.5's modelFieldOf), for the types whose records draw as models. */
  readonly fields: Readonly<Record<string, string>>;
}

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const allOf = (value: unknown, each: (entry: unknown) => boolean): value is Readonly<Record<string, unknown>> =>
  isObject(value) && Object.values(value).every(each);

// Kept apart from pack.ts's own for the import's sake: pack.ts imports this file.
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const extra = (value: Readonly<Record<string, unknown>>, allowed: readonly string[]): string | undefined => {
  const keys = Object.keys(value).filter((key) => !allowed.includes(key));
  return keys.length > 0 ? keys.join(', ') : undefined;
};

/**
 * What is wrong with a format 9 pack's world, or nothing. The spaces' and prefabs' own shape is the
 * compiler's to check (E058 on): the kernel reads only the zones, and makes sure the rest is there.
 */
export function worldProblem(world: unknown): string | undefined {
  if (!isObject(world)) return 'A format 9 pack has no world';
  const unknown = extra(world, ['spaces', 'prefabs', 'triggers', 'files', 'records', 'fields']);
  if (unknown !== undefined) return `Unknown pack world fields: ${unknown}`;
  const { spaces, prefabs, triggers, files, records, fields } = world;
  if (!allOf(spaces, isObject) || Object.keys(spaces).length === 0) return 'A format 9 pack has no spaces';
  if (!allOf(prefabs, isObject)) return "The pack's prefabs are not objects";
  const named = [...Object.keys(spaces), ...Object.keys(prefabs)].find((id) => !isRecordId(id));
  if (named !== undefined) return `"${named}" is not a valid space or prefab name`;
  if (!allOf(triggers, isObject)) return "The pack's trigger zones are not objects";
  for (const [space, zones] of Object.entries(triggers)) {
    if (!Object.hasOwn(spaces, space)) return `Trigger zones of a space the pack lacks: "${space}"`;
    for (const [path, zone] of Object.entries(zones as Readonly<Record<string, unknown>>)) {
      const problem = zoneProblem(`${space}/${path}`, path, zone);
      if (problem !== undefined) return problem;
    }
  }
  if (!allOf(files, (data) => typeof data === 'string' && BASE64.test(data))) {
    return "The pack's world files are not base64";
  }
  if (!isObject(records)) return "The pack's world records are not an object";
  const key = Object.keys(records).find((k) => !/^[a-z0-9-]+:[a-z0-9-]+$/.test(k));
  if (key !== undefined) return `"${key}" is not a record's type and id`;
  if (!allOf(fields, (field) => typeof field === 'string')) return "The pack's model fields are not text";
  return undefined;
}

function zoneProblem(key: string, path: string, zone: unknown): string | undefined {
  if (!path.split('/').every(isRecordId)) return `"${path}" is not an object's path`;
  if (!isObject(zone) || !Array.isArray(zone.effects)) return `The trigger zone "${key}" has no effects`;
  const unknown = extra(zone, ['when', 'effects', 'once']);
  if (unknown !== undefined) return `Unknown trigger zone fields: ${unknown}`;
  if (zone.once !== undefined && typeof zone.once !== 'boolean')
    return `The trigger zone "${key}"'s once is not true or false`;
  return undefined;
}
