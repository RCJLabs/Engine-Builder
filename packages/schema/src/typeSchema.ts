/**
 * The record type a type file describes (typeFile.ts): the strict zod schema a code type would
 * have, with refs, assets, conditions and effects marked the same way, and messages written for
 * people.
 */
import { z } from 'zod';
import { asset } from './assets.ts';
import { condition } from './condition.ts';
import { effect } from './effect.ts';
import { defineRecordType, type RecordType } from './recordType.ts';
import { ref, refAny } from './refs.ts';
import type { FieldDef, Fields, TypeFile, ValueDef } from './typeFile.ts';
import { FIELD_NAME_PATTERN } from './typeFile.ts';

/** A record type written as data: its field model, for forms, and its record type, for validation. */
export interface DataType {
  readonly type: string;
  readonly file: TypeFile;
  readonly recordType: RecordType;
  /**
   * A kit's type (M3.3, D41): the kit, and the fields that are its own, first in `file`, which
   * the type designer shows but doesn't change. The rest are the project's.
   */
  readonly kit?: { readonly id: string; readonly fields: readonly string[] };
}

/** A colour as the web writes one: "#" and six hex digits. */
export const COLOUR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function typeFromFile(type: string, file: TypeFile): DataType {
  const recordType = defineRecordType<unknown>({
    type,
    title: file.title,
    description: file.description ?? '',
    schema: groupSchema(file.fields),
  });
  return Object.freeze({ type, file, recordType });
}

const groupSchema = (fields: Fields): z.ZodType => z.strictObject(fieldShape(fields));

/** Each field's schema by name: a strict object's shape, as a group's or an effect's (M3.3). */
export function fieldShape(fields: Fields): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {};
  for (const [name, def] of Object.entries(fields)) shape[name] = fieldSchema(def);
  return shape;
}

function fieldSchema(def: FieldDef): z.ZodType {
  const base = valueSchema(def);
  // Labels and help reach the JSON Schema export; .meta() keeps a ref's or a condition's mark.
  const meta = {
    ...(def.label ? { title: def.label } : {}),
    ...(def.description ? { description: def.description } : {}),
  };
  const described = Object.keys(meta).length > 0 ? base.meta(meta) : base;
  return def.optional ? described.optional() : described;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function valueSchema(def: ValueDef): z.ZodType {
  switch (def.kind) {
    case 'text': {
      let schema = z.string({ error: 'Expected text' });
      if (def.min !== undefined) {
        const said = def.min === 1 ? 'Write something here' : `At least ${plural(def.min, 'character', 'characters')}`;
        schema = schema.min(def.min, { error: said });
      }
      if (def.max !== undefined)
        schema = schema.max(def.max, { error: `At most ${plural(def.max, 'character', 'characters')}` });
      return schema;
    }
    case 'int':
      return bounded(z.int({ error: 'Expected a whole number' }), def);
    case 'number':
      return bounded(z.number({ error: 'Expected a number' }), def);
    case 'bool':
      return z.boolean({ error: 'Expected true or false' });
    case 'enum':
      return z.enum(def.values as [string, ...string[]], { error: `Expected one of: ${def.values.join(', ')}` });
    case 'ref':
      return typeof def.to === 'string' ? ref(def.to) : refAny(def.to);
    case 'list': {
      let schema = z.array(valueSchema(def.of), { error: 'Expected a list' });
      if (def.min !== undefined)
        schema = schema.min(def.min, { error: `At least ${plural(def.min, 'item', 'items')}` });
      if (def.max !== undefined) schema = schema.max(def.max, { error: `At most ${plural(def.max, 'item', 'items')}` });
      return schema;
    }
    case 'map':
      return mapSchema(def.key, valueSchema(def.of));
    case 'group':
      return groupSchema(def.fields);
    case 'colour':
      return z
        .string({ error: 'Expected a colour' })
        .regex(COLOUR_PATTERN, { error: 'Expected a colour like "#3a7bd5"' });
    case 'asset':
      return asset(def.of);
    case 'condition':
      return condition();
    case 'effects':
      // Each effect is checked against its own schema, in the pass effect() fields get (M3.1).
      return z.array(effect(), { error: 'Expected a list of effects' });
  }
}

function bounded(schema: z.ZodNumber, def: { min?: number; max?: number }): z.ZodNumber {
  let out = schema;
  if (def.min !== undefined) out = out.min(def.min, { error: `At least ${def.min}` });
  if (def.max !== undefined) out = out.max(def.max, { error: `At most ${def.max}` });
  return out;
}

function mapSchema(key: Extract<ValueDef, { kind: 'map' }>['key'], value: z.ZodType): z.ZodType {
  if (key?.kind === 'enum') {
    // partialRecord: z.record with enum keys would demand every key, and a map holds some of them.
    return z.partialRecord(z.enum(key.values as [string, ...string[]]), value, { error: 'Expected a map' });
  }
  if (key?.kind === 'ref') return z.record(valueSchema(key) as z.ZodString, value, { error: 'Expected a map' });
  const name = z.string().regex(FIELD_NAME_PATTERN, {
    error: 'Keys start with a letter, then letters, digits, "_" or "-", up to 64 characters',
  });
  return z.record(name, value, { error: 'Expected a map' });
}
