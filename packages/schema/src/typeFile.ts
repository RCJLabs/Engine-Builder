/**
 * Record types written as data: a project's types/<type>.json (docs/specs/type-files.md, D31).
 * This is the file's own format, the field model that forms draw from. typeSchema.ts builds the
 * strict zod schema a file describes, so data types and code types are checked alike.
 */
import { pointerSegment, RECORD_ID_PATTERN } from '@eb/core';
import { z } from 'zod';
import { ASSET_KINDS, type AssetKind } from './assets.ts';
import { type SchemaIssue, schemaIssues } from './issues.ts';
import { isBuiltInName } from './recordType.ts';

/** The kinds a field can be. The names follow the fact domains conditions use (bool, int, enum, ref, text). */
export const FIELD_KINDS = [
  'text',
  'int',
  'number',
  'bool',
  'enum',
  'ref',
  'list',
  'map',
  'group',
  'colour',
  'asset',
  'condition',
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/**
 * A field's name, and a map's key when the map gives no key kind: a letter, then letters, digits,
 * "_" or "-", up to 64 characters. Camel case, snake case and kebab case all fit.
 */
export const FIELD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

interface Bounds {
  readonly min?: number;
  readonly max?: number;
}
export interface EnumDef {
  readonly kind: 'enum';
  readonly values: readonly string[];
}
/** A string names one type, and the field holds a bare id; a list allows several, as "type:id". */
export interface RefDef {
  readonly kind: 'ref';
  readonly to: string | readonly string[];
}

/** What a field holds. Text and list bounds count characters and items; number bounds are values. */
export type ValueDef =
  | ({ readonly kind: 'text'; readonly multiline?: boolean } & Bounds)
  | ({ readonly kind: 'int' } & Bounds)
  | ({ readonly kind: 'number' } & Bounds)
  | { readonly kind: 'bool' }
  | EnumDef
  | RefDef
  | ({ readonly kind: 'list'; readonly of: ValueDef } & Bounds)
  | { readonly kind: 'map'; readonly key?: RefDef | EnumDef; readonly of: ValueDef }
  | { readonly kind: 'group'; readonly fields: Fields }
  | { readonly kind: 'colour' }
  | { readonly kind: 'asset'; readonly of?: AssetKind }
  | { readonly kind: 'condition' };

/** What a named field adds. A list's items and a map's values are values, never optional. */
export interface FieldInfo {
  readonly optional?: boolean;
  readonly label?: string;
  readonly description?: string;
}
export type FieldDef = ValueDef & FieldInfo;
export type Fields = Readonly<Record<string, FieldDef>>;

export interface TypeFile {
  readonly title: string;
  readonly description?: string;
  /**
   * The text field that holds each record's name, which lists and pickers show beside its id
   * (M2.5). A record without it is known by its id alone.
   */
  readonly nameField?: string;
  /** In the order forms show them, and the order new keys are written in. */
  readonly fields: Fields;
}

const count = z
  .int({ error: 'Expected a whole number, 0 or more' })
  .min(0, { error: 'Expected a whole number, 0 or more' });
const whole = z.int({ error: 'Expected a whole number' });
const bound = z.number({ error: 'Expected a number' });
const typeName = z
  .string()
  .regex(RECORD_ID_PATTERN, { error: 'Not a type name: use lowercase words joined by hyphens' });

const enumShape = {
  values: z
    .array(z.string({ error: 'Expected text' }).min(1, { error: 'A value can’t be empty' }))
    .min(1, { error: 'List at least one value' }),
};
const refShape = {
  to: z.union([typeName, z.array(typeName).min(1)], { error: 'Expected a type name, or a list of type names' }),
};

const SHAPES: Record<FieldKind, z.core.$ZodShape> = {
  text: { min: count.optional(), max: count.optional(), multiline: z.boolean().optional() },
  int: { min: whole.optional(), max: whole.optional() },
  number: { min: bound.optional(), max: bound.optional() },
  bool: {},
  enum: enumShape,
  ref: refShape,
  list: { of: z.lazy(() => valueDef), min: count.optional(), max: count.optional() },
  map: { key: z.lazy(() => keyDef).optional(), of: z.lazy(() => valueDef) },
  group: { fields: z.lazy(() => fieldsDef) },
  colour: {},
  asset: { of: z.enum(ASSET_KINDS, { error: `Expected an asset kind: ${ASSET_KINDS.join(', ')}` }).optional() },
  condition: {},
};

const INFO: z.core.$ZodShape = {
  optional: z.boolean().optional(),
  label: z.string().min(1, { error: 'A label can’t be empty' }).optional(),
  description: z.string().optional(),
};

const kindError = (issue: { code: string }) =>
  issue.code === 'invalid_union' ? `Expected a kind: ${FIELD_KINDS.join(', ')}` : undefined;

type Options = [z.ZodObject, ...z.ZodObject[]];
const variants = (kinds: readonly FieldKind[], extra: z.core.$ZodShape) =>
  kinds.map((kind) => z.strictObject({ kind: z.literal(kind), ...SHAPES[kind], ...extra })) as unknown as Options;

const valueDef = z.discriminatedUnion('kind', variants(FIELD_KINDS, {}), { error: kindError });
const fieldDef = z.discriminatedUnion('kind', variants(FIELD_KINDS, INFO), { error: kindError });
const keyDef = z.discriminatedUnion('kind', variants(['ref', 'enum'], {}), {
  error: (issue) => (issue.code === 'invalid_union' ? 'A map’s key is a ref or an enum' : undefined),
});
const NAME_RULE = 'Field names start with a letter, then letters, digits, "_" or "-", up to 64 characters';
const BUILT_IN_RULE =
  'Every JavaScript object already has this name, so a record without the field would seem to have it';

/** Why `name` can't name a field, or null when it can: E015's rule, for the type designer (M2.6). */
export function fieldNameProblem(name: string): string | null {
  if (!FIELD_NAME_PATTERN.test(name)) return NAME_RULE;
  return isBuiltInName(name) ? BUILT_IN_RULE : null;
}

const fieldsDef = z.record(
  z
    .string()
    .regex(FIELD_NAME_PATTERN, { error: NAME_RULE, abort: true })
    .refine((name) => !isBuiltInName(name), { error: BUILT_IN_RULE }),
  fieldDef,
);

/** The type file format, strict like every record: an unknown or misspelled key is a problem. */
export const typeFileSchema = z.strictObject({
  title: z.string({ error: 'Expected text' }).min(1, { error: 'A type needs a title' }),
  description: z.string({ error: 'Expected text' }).optional(),
  nameField: z.string({ error: 'Expected the name of a text field' }).optional(),
  fields: fieldsDef,
}) as unknown as z.ZodType<TypeFile>;

export type ReadTypeFile =
  | { readonly ok: true; readonly file: TypeFile }
  | { readonly ok: false; readonly issues: readonly SchemaIssue[] };

/** A type file's field model, or what is wrong with it: its shape first, then what the shape can't say. */
export function readTypeFile(value: unknown): ReadTypeFile {
  const shape = schemaIssues(typeFileSchema, value);
  if (shape.length > 0) return { ok: false, issues: shape };
  const file = value as TypeFile;
  const issues = rulesProblems(file);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, file };
}

/** Every field of a type with its JSON Pointer into the type file, nested ones included, in file order. */
export function eachValue(file: TypeFile, visit: (def: ValueDef, at: string) => void): void {
  const value = (def: ValueDef, at: string): void => {
    visit(def, at);
    if (def.kind === 'list') value(def.of, `${at}/of`);
    if (def.kind === 'map') {
      if (def.key) value(def.key, `${at}/key`);
      value(def.of, `${at}/of`);
    }
    if (def.kind === 'group') fields(def.fields, `${at}/fields`);
  };
  const fields = (defs: Fields, at: string) => {
    for (const [name, def] of Object.entries(defs)) value(def, `${at}/${pointerSegment(name)}`);
  };
  fields(file.fields, '/fields');
}

/** The record types a type file's ref fields name, each with where it is named. */
export function typeRefs(file: TypeFile): { readonly path: string; readonly type: string }[] {
  const found: { path: string; type: string }[] = [];
  eachValue(file, (def, at) => {
    if (def.kind !== 'ref') return;
    if (typeof def.to === 'string') found.push({ path: `${at}/to`, type: def.to });
    else for (const [i, type] of def.to.entries()) found.push({ path: `${at}/to/${i}`, type });
  });
  return found;
}

/** Why `nameField` can't name each record, or null when it can (or the type gives none). */
function nameFieldProblem(file: TypeFile): string | null {
  const name = file.nameField;
  if (name === undefined) return null;
  const field = Object.hasOwn(file.fields, name) ? file.fields[name] : undefined;
  if (!field) return `The type has no field "${name}"`;
  return field.kind === 'text' ? null : `A record’s name is text, and "${name}" is of kind ${field.kind}`;
}

// The rules a field's shape can't carry: bounds in order, nothing listed twice, and a name field
// that is one of the type's text fields.
function rulesProblems(file: TypeFile): SchemaIssue[] {
  const found: SchemaIssue[] = [];
  const named = nameFieldProblem(file);
  if (named) found.push({ path: '/nameField', message: named });
  const twice = (list: readonly string[], at: string) => {
    for (const [i, item] of list.entries()) {
      if (list.indexOf(item) !== i) found.push({ path: `${at}/${i}`, message: `"${item}" is listed twice` });
    }
  };
  eachValue(file, (def, at) => {
    if ('min' in def || 'max' in def) {
      const { min, max } = def as Bounds;
      if (min !== undefined && max !== undefined && min > max) {
        found.push({ path: `${at}/max`, message: `max is below min (${min})` });
      }
    }
    if (def.kind === 'enum') twice(def.values, `${at}/values`);
    if (def.kind === 'ref' && typeof def.to !== 'string') twice(def.to, `${at}/to`);
  });
  return found;
}
