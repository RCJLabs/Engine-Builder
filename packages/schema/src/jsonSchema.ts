import { z } from 'zod';
import type { RecordType } from './recordType.ts';

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
