import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CanonicalError, canonicalJson } from './canonical.ts';

/** The same value with every object's keys inserted in reverse order. */
function reordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reordered);
  if (typeof value === 'object' && value !== null) {
    // fromEntries keeps a "__proto__" key as an ordinary property, as JSON.parse does.
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([k, v]) => [k, reordered(v)]),
    );
  }
  return value;
}

describe('canonical form (RFC 8785)', () => {
  it('sorts keys, drops whitespace, keeps array order', () => {
    expect(canonicalJson({ b: 1, a: [true, null, 'x', { d: 2, c: 3 }] })).toBe(
      '{"a":[true,null,"x",{"c":3,"d":2}],"b":1}',
    );
  });

  it('sorts keys by UTF-16 code units', () => {
    // Keys modelled on RFC 8785's sorting example: an astral emoji (a surrogate pair starting
    // 0xD83D) sorts before U+FB33, though its code point is higher.
    const value = {
      '€': 'Euro Sign',
      '\r': 'Carriage Return',
      דּ: 'Hebrew Letter Dalet With Dagesh', // U+FB33
      '1': 'One',
      '😀': 'Emoji: Grinning Face',
      '\u0080': 'Control',
      ö: 'Latin Small Letter O With Diaeresis',
    };
    const order = ['\r', '1', '\u0080', 'ö', '€', '😀', 'דּ'];
    const expected = `{${order.map((k) => `${JSON.stringify(k)}:${JSON.stringify(value[k as keyof typeof value])}`).join(',')}}`;
    expect(canonicalJson(value)).toBe(expected);
  });

  it('sorts numeric-looking keys as text, not as numbers', () => {
    expect(canonicalJson({ 10: 'b', 9: 'c', 1: 'a' })).toBe('{"1":"a","10":"b","9":"c"}');
  });

  it('prints numbers as ECMAScript does', () => {
    expect(canonicalJson([1e21, 1e-7, -0, 0.5, 123456789012, -42])).toBe('[1e+21,1e-7,0,0.5,123456789012,-42]');
  });

  it('escapes strings as JSON.stringify does', () => {
    expect(canonicalJson('\u0001\n"\\\u007f')).toBe('"\\u0001\\n\\"\\\\\u007f"');
  });

  it('leaves out undefined properties, as a reloaded save would', () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it('accepts objects without a prototype', () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.z = 1;
    bare.a = 2;
    expect(canonicalJson(bare)).toBe('{"a":2,"z":1}');
  });
});

describe('values JSON cannot hold', () => {
  const loop: Record<string, unknown> = { name: 'loop' };
  loop.self = loop;
  const sparse: number[] = [];
  sparse[0] = 1;
  sparse[2] = 3;
  class Point {
    x = 1;
  }

  const cases: [string, unknown, string][] = [
    ['NaN', { hp: Number.NaN }, '/hp'],
    ['Infinity', { list: [1, Number.POSITIVE_INFINITY] }, '/list/1'],
    ['undefined in an array', [1, undefined], '/1'],
    ['a sparse array', { rows: sparse }, '/rows/1'],
    ['a function', { f: () => 1 }, '/f'],
    ['a symbol', { s: Symbol('x') }, '/s'],
    ['a bigint', { big: 10n }, '/big'],
    ['a Map', { m: new Map() }, '/m'],
    ['a class instance', { p: new Point() }, '/p'],
    ['a typed array', { bytes: new Uint8Array(2) }, '/bytes'],
    ['a cycle', loop, '/self'],
    ['undefined at the root', undefined, ''],
    ['escaped keys', { 'a/b': { 'm~n': Number.NaN } }, '/a~1b/m~0n'],
  ];

  for (const [name, value, path] of cases) {
    it(`throws for ${name}, naming ${path || 'the root'}`, () => {
      let caught: unknown;
      try {
        canonicalJson(value);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CanonicalError);
      expect((caught as CanonicalError).path).toBe(path);
    });
  }

  it('prefixes paths when given one', () => {
    expect(() => canonicalJson([Number.NaN], '/inventory')).toThrow('/inventory/0');
  });
});

describe('properties', () => {
  it('key order never changes the text', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(canonicalJson(reordered(value))).toBe(canonicalJson(value));
      }),
    );
  });

  it('is idempotent through JSON.parse', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const text = canonicalJson(value);
        expect(canonicalJson(JSON.parse(text))).toBe(text);
      }),
    );
  });

  it('parses back to what a JSON round trip gives', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(JSON.parse(canonicalJson(value))).toEqual(JSON.parse(JSON.stringify(value)));
      }),
    );
  });
});
