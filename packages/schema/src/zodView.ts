import type { z } from 'zod';

/**
 * The parts of a zod schema this package reads, in one place. zod 4 keeps a schema's structure
 * on `_zod.def`, with `def.type` naming the kind; the field names are zod 4.6.7's, which the
 * package pins, and the tests cover every kind listed here.
 */
export type SchemaView =
  | { readonly kind: 'object'; readonly shape: Readonly<Record<string, z.core.$ZodType>>; readonly strict: boolean }
  | { readonly kind: 'array'; readonly element: z.core.$ZodType }
  | { readonly kind: 'tuple'; readonly items: readonly z.core.$ZodType[]; readonly rest: z.core.$ZodType | null }
  | { readonly kind: 'record'; readonly key: z.core.$ZodType; readonly value: z.core.$ZodType }
  | { readonly kind: 'union'; readonly options: readonly z.core.$ZodType[]; readonly discriminator?: string }
  | { readonly kind: 'wrapper'; readonly inner: z.core.$ZodType }
  | { readonly kind: 'leaf'; readonly type: string }
  | { readonly kind: 'unsupported'; readonly type: string; readonly why: string };

const LEAVES = new Set(['string', 'number', 'boolean', 'null', 'literal', 'enum', 'template_literal']);

const WHY: Readonly<Record<string, string>> = {
  default: 'records spell out their data; use .optional() and decide the fallback in code',
  prefault: 'records spell out their data; use .optional() and decide the fallback in code',
  catch: 'it hides bad data by replacing it',
  transform: 'records must load exactly as written',
  pipe: 'records must load exactly as written',
  any: 'it cannot be checked, and a reference inside it could not be found',
  unknown: 'it cannot be checked, and a reference inside it could not be found',
  custom: 'it cannot be checked by shape or exported to JSON Schema',
  intersection: 'intersecting strict objects rejects every field only one side has; use .extend() instead',
};

export function view(schema: z.core.$ZodType): SchemaView {
  const def = (schema as z.core.$ZodTypes)._zod.def;
  switch (def.type) {
    case 'object':
      return { kind: 'object', shape: def.shape, strict: def.catchall?._zod.def.type === 'never' };
    case 'array':
      return { kind: 'array', element: def.element };
    case 'tuple':
      return { kind: 'tuple', items: def.items, rest: def.rest };
    case 'record':
      return { kind: 'record', key: def.keyType, value: def.valueType };
    case 'union':
      return 'discriminator' in def && typeof def.discriminator === 'string'
        ? { kind: 'union', options: def.options, discriminator: def.discriminator }
        : { kind: 'union', options: def.options };
    case 'optional':
    case 'nullable':
    case 'nonoptional':
    case 'readonly':
      return { kind: 'wrapper', inner: def.innerType };
    case 'lazy':
      return { kind: 'wrapper', inner: def.getter() };
    default:
      return LEAVES.has(def.type)
        ? { kind: 'leaf', type: def.type }
        : { kind: 'unsupported', type: def.type, why: WHY[def.type] ?? 'it is not JSON data' };
  }
}
