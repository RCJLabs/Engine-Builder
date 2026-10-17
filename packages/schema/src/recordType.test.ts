import { describe, expect, it } from 'vitest';
import { actor, item, lootTable } from '../test/samples.ts';
import { defineRecordType, REF_KEY, ref, refAny, SchemaError, z } from './index.ts';

const define = (schema: z.ZodType) => defineRecordType({ type: 'thing', title: 'Thing', description: '', schema });

/** The SchemaError a schema raises, as `at: message`. */
function rejection(schema: z.ZodType): string {
  try {
    define(schema);
  } catch (error) {
    if (error instanceof SchemaError) return `${error.at}: ${error.message}`;
    throw error;
  }
  throw new Error('the schema was accepted');
}

describe('defineRecordType', () => {
  it('collects the types each record type references, sorted', () => {
    expect(item.targets).toEqual([]);
    expect(actor.targets).toEqual(['item', 'loot-table']);
    expect(lootTable.targets).toEqual(['actor', 'item']);
  });

  it('returns a frozen type', () => {
    expect(Object.isFrozen(item)).toBe(true);
    expect(Object.isFrozen(item.targets)).toBe(true);
  });

  it('accepts every data kind, with refinements and the wrappers that only narrow', () => {
    const schema = z.strictObject({
      text: z.email(),
      count: z.int(),
      flag: z.boolean(),
      nothing: z.null(),
      kind: z.enum(['a', 'b']),
      fixed: z.literal(3),
      code: z.templateLiteral(['ab-', z.int()]),
      maybe: z.string().nullable().optional(),
      frozen: z.array(z.string()).readonly(),
      required: z.strictObject({ a: z.string().optional() }).required(),
      range: z.strictObject({ min: z.int(), max: z.int() }).refine((r) => r.min <= r.max),
      list: z.tuple([z.string()], z.int()),
      map: z.record(z.string(), z.number()),
      extended: z.strictObject({ a: z.string() }).extend({ b: z.string() }),
    });
    expect(() => define(schema)).not.toThrow();
  });

  it('ends recursion through z.lazy and through getter shapes', () => {
    type Node = { name: string; children?: Node[] };
    const lazyNode: z.ZodType<Node> = z.lazy(() =>
      z.strictObject({ name: ref('item'), children: z.array(lazyNode).optional() }),
    );
    const getterNode = z.strictObject({
      name: ref('actor'),
      get children() {
        return z.array(getterNode).optional();
      },
    });
    expect(define(z.strictObject({ tree: lazyNode, other: getterNode })).targets).toEqual(['actor', 'item']);
  });

  it('rejects a type name that is not a valid id', () => {
    expect(() =>
      defineRecordType({ type: 'Loot Table', title: '', description: '', schema: z.strictObject({}) }),
    ).toThrow('"Loot Table" is not a valid record type name');
  });

  it.each([
    [
      'a top level that is not an object',
      z.array(z.string()),
      ': Record type "thing": the top level must be z.strictObject',
    ],
    [
      'an object that is not strict',
      z.strictObject({ entries: z.array(z.object({ a: z.string() })) }),
      'entries[]: Record type "thing" at entries[]: objects must be z.strictObject, so a misspelled field is an error',
    ],
    [
      'a loose object',
      z.strictObject({ extra: z.looseObject({}) }),
      'extra: Record type "thing" at extra: objects must be z.strictObject, so a misspelled field is an error',
    ],
    [
      'an object with a catchall',
      z.strictObject({ extra: z.strictObject({}).catchall(z.string()) }),
      'extra: Record type "thing" at extra: objects must be z.strictObject, so a misspelled field is an error',
    ],
    [
      'a default, inside a union option',
      z.strictObject({ pick: z.union([z.string(), z.number().default(1)]) }),
      'pick|1: Record type "thing" at pick|1: z.default is not allowed: records spell out their data; use .optional() and decide the fallback in code',
    ],
    [
      'a transform',
      z.strictObject({ name: z.string().transform((s) => s.trim()) }),
      'name: Record type "thing" at name: z.pipe is not allowed: records must load exactly as written',
    ],
    [
      'z.any, as a record value',
      z.strictObject({ bag: z.record(z.string(), z.any()) }),
      'bag{}: Record type "thing" at bag{}: z.any is not allowed: it cannot be checked, and a reference inside it could not be found',
    ],
    [
      'z.unknown, in a tuple',
      z.strictObject({ pair: z.tuple([z.string(), z.unknown()]) }),
      'pair[1]: Record type "thing" at pair[1]: z.unknown is not allowed: it cannot be checked, and a reference inside it could not be found',
    ],
    [
      'a date',
      z.strictObject({ when: z.date() }),
      'when: Record type "thing" at when: z.date is not allowed: it is not JSON data',
    ],
    [
      'an intersection',
      z.strictObject({ both: z.intersection(z.strictObject({ a: z.string() }), z.strictObject({ b: z.string() })) }),
      'both: Record type "thing" at both: z.intersection is not allowed: intersecting strict objects rejects every field only one side has; use .extend() instead',
    ],
    [
      'reference metadata on something other than a string',
      z.strictObject({ count: z.number().meta({ [REF_KEY]: 'item' }) }),
      'count: Record type "thing" at count: x-eb-ref belongs on a string; use ref() or refAny()',
    ],
  ])('rejects %s', (_name, schema, expected) => {
    expect(rejection(schema)).toBe(expected);
  });

  it('rejects reference metadata written by hand that is malformed', () => {
    for (const target of ['Item', [], ['item', 'actor'], ['item', 'item'], 5]) {
      expect(() => define(z.strictObject({ owner: z.string().meta({ [REF_KEY]: target }) }))).toThrow(
        'x-eb-ref must be a record type name or a sorted list of them; use ref() or refAny()',
      );
    }
  });
});

describe('ref and refAny', () => {
  it('mark a string field with its target, which survives chaining', () => {
    expect(z.globalRegistry.get(ref('item'))).toEqual({ [REF_KEY]: 'item' });
    expect(z.globalRegistry.get(ref('item').describe('Held item').min(3))).toMatchObject({ [REF_KEY]: 'item' });
    expect(z.globalRegistry.get(refAny(['item', 'actor', 'item']))).toEqual({ [REF_KEY]: ['actor', 'item'] });
  });

  it('accept ids and qualified references, and nothing else', () => {
    expect(ref('item').safeParse('dead-hauler').success).toBe(true);
    expect(ref('item').safeParse('item:medkit').success).toBe(false);
    expect(refAny(['item']).safeParse('item:medkit').success).toBe(true);
    expect(refAny(['item']).safeParse('medkit').success).toBe(false);
  });

  it('reject bad type names', () => {
    expect(() => ref('Item')).toThrow('ref(): "Item" is not a valid record type name');
    expect(() => refAny([])).toThrow('refAny(): name at least one record type');
    expect(() => refAny(['item', 'loot table'])).toThrow('refAny(): "loot table" is not a valid record type name');
  });
});
