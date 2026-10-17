import { isRecordId } from '@eb/core';
import type { z } from 'zod';
import { REF_KEY, refTargetOf, targetTypes } from './refs.ts';
import { view } from './zodView.ts';

export interface RecordTypeDefinition<T> {
  /** The type name, kebab-case like a record id: `item`, `loot-table`. */
  readonly type: string;
  readonly title: string;
  readonly description: string;
  /**
   * The record's shape. Declare the type in pure code and annotate the schema as
   * `z.ZodType<Item>`, so the two cannot drift apart without a type error.
   */
  readonly schema: z.ZodType<T>;
}

export interface RecordType<T = unknown> extends RecordTypeDefinition<T> {
  /** The record types this type's reference fields point at, sorted. */
  readonly targets: readonly string[];
}

/**
 * A name every JavaScript object already has, such as `toString` or `constructor`. zod reads a
 * field as `value[name]`, so a record that leaves such a field out would seem to hold a function.
 */
export const isBuiltInName = (name: string): boolean => Object.hasOwn(Object.prototype, name);

/** A record type whose schema breaks the rules in docs/specs/records.md: a programmer error. */
export class SchemaError extends Error {
  /** Where in the schema, like `effects[].item`; empty for the top level. */
  readonly at: string;
  constructor(type: string, at: string, problem: string) {
    super(`Record type "${type}"${at ? ` at ${at}` : ''}: ${problem}`);
    this.name = 'SchemaError';
    this.at = at;
  }
}

/**
 * Checks a record type's schema and returns the type, frozen. The checks fail at startup rather
 * than letting a bad schema quietly accept or skip data later.
 */
export function defineRecordType<T>(definition: RecordTypeDefinition<T>): RecordType<T> {
  const { type, schema } = definition;
  if (!isRecordId(type)) throw new RangeError(`"${type}" is not a valid record type name`);
  const top = view(schema);
  if (top.kind !== 'object') throw new SchemaError(type, '', 'the top level must be z.strictObject');
  const targets = new Set<string>();
  checkSchema(schema, '', { type, targets, seen: new Set() });
  return Object.freeze({ ...definition, targets: Object.freeze([...targets].sort()) });
}

interface Check {
  readonly type: string;
  readonly targets: Set<string>;
  readonly seen: Set<z.core.$ZodType>;
}

// `seen` ends recursion: z.lazy and getter shapes make schema graphs with cycles.
function checkSchema(schema: z.core.$ZodType, at: string, check: Check): void {
  if (check.seen.has(schema)) return;
  check.seen.add(schema);
  const fail = (problem: string): never => {
    throw new SchemaError(check.type, at, problem);
  };
  const shape = view(schema);
  const target = refTargetOf(schema);
  if (target !== undefined) {
    if (shape.kind !== 'leaf' || shape.type !== 'string') fail(`${REF_KEY} belongs on a string; use ref() or refAny()`);
    for (const type of targetTypes(target)) check.targets.add(type);
    return;
  }
  switch (shape.kind) {
    case 'object':
      if (!shape.strict) fail('objects must be z.strictObject, so a misspelled field is an error');
      for (const [key, child] of Object.entries(shape.shape)) {
        if (isBuiltInName(key))
          fail(`a field named "${key}" would read as JavaScript's own ${key} when a record leaves it out`);
        checkSchema(child, at ? `${at}.${key}` : key, check);
      }
      break;
    case 'array':
      checkSchema(shape.element, `${at}[]`, check);
      break;
    case 'tuple':
      for (const [i, item] of shape.items.entries()) checkSchema(item, `${at}[${i}]`, check);
      if (shape.rest) checkSchema(shape.rest, `${at}[]`, check);
      break;
    case 'record':
      checkSchema(shape.key, `${at}{key}`, check);
      checkSchema(shape.value, `${at}{}`, check);
      break;
    case 'union':
      for (const [i, option] of shape.options.entries()) checkSchema(option, `${at}|${i}`, check);
      break;
    case 'wrapper':
      checkSchema(shape.inner, at, check);
      break;
    case 'leaf':
      break;
    case 'unsupported':
      fail(`z.${shape.type} is not allowed: ${shape.why}`);
  }
}
