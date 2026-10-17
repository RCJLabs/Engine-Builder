import { describe, expect, it } from 'vitest';
import { collectRefs, ref, refAny, z } from './index.ts';

const paths = (schema: z.ZodType, value: unknown) => collectRefs(schema, value).map(({ path, value }) => [path, value]);

describe('collectRefs', () => {
  it('escapes keys in the paths it reports', () => {
    const schema = z.strictObject({ links: z.record(z.string(), ref('item')) });
    expect(paths(schema, { links: { 'a/b~c': 'medkit' } })).toEqual([['/links/a~1b~0c', 'medkit']]);
  });

  it('reads tuple items and the rest', () => {
    const schema = z.tuple([ref('actor')], ref('item'));
    expect(paths(schema, ['rook', 'medkit', 'salvage'])).toEqual([
      ['/0', 'rook'],
      ['/1', 'medkit'],
      ['/2', 'salvage'],
    ]);
  });

  it('reports the target with each reference', () => {
    const schema = z.strictObject({ one: ref('item'), any: refAny(['item', 'actor']) });
    expect(collectRefs(schema, { one: 'medkit', any: 'actor:rook' })).toEqual([
      { path: '/one', value: 'medkit', target: 'item' },
      { path: '/any', value: 'actor:rook', target: ['actor', 'item'] },
    ]);
  });

  it('walks the union option that parses, not the first', () => {
    const schema = z.union([z.strictObject({ a: ref('item') }), z.strictObject({ b: ref('actor') })]);
    expect(paths(schema, { b: 'rook' })).toEqual([['/b', 'rook']]);
  });

  it('skips a plain union that no option accepts, since there is no telling which was meant', () => {
    const schema = z.union([z.strictObject({ a: ref('item'), n: z.int() }), z.strictObject({ b: z.string() })]);
    expect(paths(schema, { a: 'medkit', n: 'one' })).toEqual([]);
  });

  it('skips values whose shape does not fit, and fields the schema does not name', () => {
    const schema = z.strictObject({ list: z.array(ref('item')), map: z.record(z.string(), ref('item')) });
    expect(paths(schema, { list: 'medkit', map: ['medkit'], extra: 'medkit' })).toEqual([]);
    expect(paths(schema, { list: [5, 'medkit'] })).toEqual([['/list/1', 'medkit']]);
  });
});
