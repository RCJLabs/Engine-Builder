import { z } from 'zod';
import type { RecordType } from './recordType.ts';
import { typeFileSchema } from './typeFile.ts';

/**
 * A record type as JSON Schema (draft 2020-12), for VS Code and other tools. Strict objects come
 * out as `additionalProperties: false`, and reference fields keep their `x-eb-ref`. The record
 * type's title and description replace any the top-level schema carries.
 */
export function recordJsonSchema(recordType: RecordType): Record<string, unknown> {
  const exported = z.toJSONSchema(recordType.schema, { target: 'draft-2020-12' });
  const { $schema, title: _title, description: _description, ...rest } = exported;
  return {
    $schema,
    $id: `urn:eb:record:${recordType.type}`,
    title: recordType.title,
    description: recordType.description,
    ...rest,
  };
}

/**
 * The type file format as JSON Schema (M2.8), for editing `types/<type>.json` by hand. It holds
 * the format's shape alone: the rules a shape can't carry, such as bounds in order, are
 * readTypeFile's, so `eb validate` still has the last word.
 */
export function typeFileJsonSchema(): Record<string, unknown> {
  const { $schema, ...rest } = z.toJSONSchema(typeFileSchema, { target: 'draft-2020-12' });
  listKinds(rest);
  return {
    $schema,
    $id: 'urn:eb:type-file',
    title: 'Type file',
    description: 'A record type as its fields (docs/specs/type-files.md)',
    ...rest,
  };
}

/**
 * Beside each choice of field by its kind, every kind as one list. VS Code completes a value only
 * from the choices the rest of the object already fits, so a new field, with nothing but its kind
 * yet, was offered the kinds that need nothing else: not enum, ref, list, map or group.
 */
function listKinds(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) listKinds(item);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const schema = node as Record<string, unknown>;
  const choices = Array.isArray(schema.oneOf) ? (schema.oneOf as Record<string, unknown>[]) : [];
  const kinds = choices.map((choice) => (choice.properties as { kind?: { const?: unknown } } | undefined)?.kind?.const);
  if (kinds.length > 0 && kinds.every((kind) => typeof kind === 'string')) {
    schema.properties = { ...(schema.properties as object | undefined), kind: { enum: kinds } };
  }
  for (const value of Object.values(schema)) listKinds(value);
}
