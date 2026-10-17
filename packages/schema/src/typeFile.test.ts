import { describe, expect, it } from 'vitest';
import { eachValue, readTypeFile, type TypeFile, typeFileSchema, typeRefs, z } from './index.ts';

const gladiator: TypeFile = {
  title: 'Gladiator',
  description: 'A fighter of the arena.',
  fields: {
    name: { kind: 'text', min: 1, max: 40 },
    might: { kind: 'int', min: 0, max: 100 },
    weight: { kind: 'number', min: 40.5 },
    style: { kind: 'enum', values: ['retiarius', 'murmillo'] },
    school: { kind: 'ref', to: 'school' },
    rival: { kind: 'ref', to: ['gladiator', 'beast'], optional: true },
    free: { kind: 'bool', label: 'Freed' },
    skills: { kind: 'list', of: { kind: 'text', min: 1 }, max: 6 },
    kit: { kind: 'map', key: { kind: 'ref', to: 'weapon' }, of: { kind: 'int', min: 1 } },
    stats: { kind: 'map', key: { kind: 'enum', values: ['str', 'dex'] }, of: { kind: 'number' } },
    notes: { kind: 'map', of: { kind: 'text' }, optional: true },
    record: { kind: 'group', fields: { wins: { kind: 'int', min: 0 }, losses: { kind: 'int', min: 0 } } },
    colour: { kind: 'colour' },
    portrait: { kind: 'asset', of: 'image', optional: true, description: 'Shown on the roster' },
    fights: { kind: 'condition', optional: true },
    story: { kind: 'text', multiline: true, optional: true },
  },
};

const problems = (value: unknown) => {
  const read = readTypeFile(value);
  return read.ok ? [] : read.issues.map(({ path, message }) => `${path}: ${message}`);
};
const withField = (field: unknown) => ({ title: 'T', fields: { f: field } });

describe('readTypeFile', () => {
  it('reads a type that uses every kind', () => {
    expect(readTypeFile(gladiator)).toEqual({ ok: true, file: gladiator });
    expect(readTypeFile({ title: 'Empty', fields: {} }).ok).toBe(true);
  });

  it.each([
    ['an unknown kind', withField({ kind: 'colour2' }), '/fields/f/kind: Expected a kind: text, int, number'],
    ['no kind', withField({ min: 1 }), '/fields/f/kind: Expected a kind'],
    ['a key another kind has', withField({ kind: 'bool', min: 1 }), '/fields/f/min: Unknown field "min"'],
    [
      'an optional list item',
      withField({ kind: 'list', of: { kind: 'int', optional: true } }),
      '/fields/f/of/optional: Unknown field "optional"',
    ],
    ['a misspelled key', withField({ kind: 'text', optinal: true }), '/fields/f/optinal: Unknown field "optinal"'],
    ['a negative length', withField({ kind: 'text', min: -1 }), '/fields/f/min: Expected a whole number, 0 or more'],
    ['a fractional int bound', withField({ kind: 'int', max: 2.5 }), '/fields/f/max: Expected a whole number'],
    ['no enum values', withField({ kind: 'enum', values: [] }), '/fields/f/values: List at least one value'],
    ['an empty enum value', withField({ kind: 'enum', values: [''] }), '/fields/f/values/0: A value can’t be empty'],
    ['a bad type name', withField({ kind: 'ref', to: 'School' }), '/fields/f/to: Not a type name: use lowercase words'],
    [
      'a ref to a number',
      withField({ kind: 'ref', to: 3 }),
      '/fields/f/to: Expected a type name, or a list of type names',
    ],
    [
      'a map keyed by text',
      withField({ kind: 'map', key: { kind: 'text' }, of: { kind: 'int' } }),
      '/fields/f/key/kind: A map’s key is a ref or an enum',
    ],
    [
      'an asset kind there is none of',
      withField({ kind: 'asset', of: 'video' }),
      '/fields/f/of: Expected an asset kind: image, audio, model, font',
    ],
    ['an empty label', withField({ kind: 'bool', label: '' }), '/fields/f/label: A label can’t be empty'],
    ['no title', { fields: {} }, '/title: Missing field "title"'],
    ['an unknown top-level key', { title: 'T', fields: {}, format: 1 }, '/format: Unknown field "format"'],
  ])('reports %s where it is', (_name, value, expected) => {
    const found = problems(value);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(expected);
  });

  it('reports a field name a record could not use', () => {
    expect(problems({ title: 'T', fields: { __proto__x: { kind: 'bool' } } })).toEqual([
      '/fields/__proto__x: Invalid key: Field names start with a letter, then letters, digits, "_" or "-", up to 64 characters',
    ]);
  });

  it('refuses a field name every JavaScript object already has', () => {
    expect(problems({ title: 'T', fields: { toString: { kind: 'int', optional: true } } })).toEqual([
      '/fields/toString: Invalid key: Every JavaScript object already has this name, so a record without the field would seem to have it',
    ]);
  });

  it('checks what the shape cannot: bounds in order, nothing twice', () => {
    expect(
      problems({
        title: 'T',
        fields: {
          a: { kind: 'text', min: 5, max: 4 },
          b: { kind: 'list', of: { kind: 'number', min: 1, max: 0.5 }, min: 3, max: 3 },
          c: { kind: 'enum', values: ['x', 'y', 'x'] },
          d: { kind: 'map', key: { kind: 'ref', to: ['b', 'a', 'b'] }, of: { kind: 'bool' } },
        },
      }),
    ).toEqual([
      '/fields/a/max: max is below min (5)',
      '/fields/b/of/max: max is below min (1)',
      '/fields/c/values/2: "x" is listed twice',
      '/fields/d/key/to/2: "b" is listed twice',
    ]);
  });
});

describe('eachValue and typeRefs', () => {
  it('visit nested values in file order, with pointers that escape names', () => {
    const file: TypeFile = {
      title: 'T',
      fields: {
        'a~b': { kind: 'list', of: { kind: 'group', fields: { c: { kind: 'ref', to: 'x' } } } },
        m: { kind: 'map', key: { kind: 'ref', to: ['y', 'z'] }, of: { kind: 'ref', to: 'w' } },
      },
    };
    const seen: string[] = [];
    eachValue(file, (def, at) => seen.push(`${at} ${def.kind}`));
    expect(seen).toEqual([
      '/fields/a~0b list',
      '/fields/a~0b/of group',
      '/fields/a~0b/of/fields/c ref',
      '/fields/m map',
      '/fields/m/key ref',
      '/fields/m/of ref',
    ]);
    expect(typeRefs(file)).toEqual([
      { path: '/fields/a~0b/of/fields/c/to', type: 'x' },
      { path: '/fields/m/key/to/0', type: 'y' },
      { path: '/fields/m/key/to/1', type: 'z' },
      { path: '/fields/m/of/to', type: 'w' },
    ]);
  });
});

describe('the type file format as JSON Schema', () => {
  it('exports, strict, for editing type files by hand', () => {
    const schema = z.toJSONSchema(typeFileSchema, { target: 'draft-2020-12' }) as {
      additionalProperties: boolean;
      required: string[];
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['title', 'fields']);
  });
});
