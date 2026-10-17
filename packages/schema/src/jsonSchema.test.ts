import { QUALIFIED_REF_PATTERN, RECORD_ID_PATTERN } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { actor, item, lootTable } from '../test/samples.ts';
import { defineRecordType, recordJsonSchema, z } from './index.ts';

describe('recordJsonSchema', () => {
  it('exports a record type as draft 2020-12 with its id, title and description', () => {
    expect(recordJsonSchema(item)).toEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'urn:eb:record:item',
      title: 'Item',
      description: 'Something a crew member can carry.',
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        weight: { type: 'number', minimum: 0 },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'weight'],
      additionalProperties: false,
    });
  });

  it('marks reference fields with their target and the id pattern', () => {
    const { properties } = recordJsonSchema(actor) as { properties: Record<string, Record<string, unknown>> };
    expect(properties.drops).toEqual({
      type: 'string',
      minLength: 1,
      pattern: RECORD_ID_PATTERN.source,
      'x-eb-ref': 'loot-table',
      description: 'What a search of the body turns up',
    });
    expect(properties.carries?.propertyNames).toEqual({
      type: 'string',
      minLength: 1,
      pattern: RECORD_ID_PATTERN.source,
      'x-eb-ref': 'item',
    });
  });

  it('keeps qualified references and recursive conditions', () => {
    const schema = recordJsonSchema(lootTable);
    const text = JSON.stringify(schema);
    expect(text).toContain(`"pattern":${JSON.stringify(QUALIFIED_REF_PATTERN.source)},"x-eb-ref":["actor","item"]`);
    expect(Object.keys(schema.$defs as object)).toHaveLength(1);
    expect(text.match(/"additionalProperties":false/g)?.length).toBe(8);
  });

  it("uses the record type's title and description over the schema's own", () => {
    const described = defineRecordType({
      type: 'note',
      title: 'Note',
      description: 'A line in the log.',
      schema: z.strictObject({ text: z.string() }).describe('ignored').meta({ title: 'Ignored' }),
    });
    const schema = recordJsonSchema(described);
    expect([schema.title, schema.description]).toEqual(['Note', 'A line in the log.']);
  });
});
