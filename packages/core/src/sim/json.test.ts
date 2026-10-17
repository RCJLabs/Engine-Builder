import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CanonicalError, canonicalJson } from '../canonical.ts';
import { cloneJson, freezeJson } from './json.ts';

const throws = (run: () => unknown): boolean => {
  try {
    run();
    return false;
  } catch (error) {
    if (error instanceof CanonicalError) return true;
    throw error;
  }
};

describe('freezeJson', () => {
  it('accepts exactly what canonicalJson accepts', () => {
    const anything = fc.anything({
      withBigInt: true,
      withBoxedValues: true,
      withDate: true,
      withMap: true,
      withNullPrototype: true,
      withSet: true,
      withSparseArray: true,
      withTypedArray: true,
    });
    fc.assert(
      fc.property(anything, (value) => {
        const expected = throws(() => canonicalJson(value));
        expect(throws(() => freezeJson(value, ''))).toBe(expected);
      }),
      { numRuns: 500 },
    );
  });

  it('freezes every level, and names the path of a bad value', () => {
    const value = { a: [{ b: 1 }], c: { d: 'x' } };
    freezeJson(value, '/slice');
    expect([
      Object.isFrozen(value),
      Object.isFrozen(value.a),
      Object.isFrozen(value.a[0]),
      Object.isFrozen(value.c),
    ]).toEqual([true, true, true, true]);
    expect(() => freezeJson({ a: [1, { 'b/c': Number.POSITIVE_INFINITY }] }, '/slice')).toThrow(
      new CanonicalError('/slice/a/1/b~1c', 'Infinity has no JSON form'),
    );
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(() => freezeJson(loop, '')).toThrow('cycle');
  });
});

describe('cloneJson', () => {
  it('copies every level, so changing the copy leaves the original alone', () => {
    const original = { list: [{ hp: 1 }], nested: { deep: { x: [1, 2] } } };
    const copy = cloneJson(original);
    copy.list[0] = { hp: 9 };
    copy.nested.deep.x.push(3);
    expect(original).toEqual({ list: [{ hp: 1 }], nested: { deep: { x: [1, 2] } } });
  });

  it('keeps a "__proto__" key as a key, as JSON.parse does', () => {
    const parsed = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}') as Record<string, unknown>;
    const copy = cloneJson(parsed);
    expect(Object.keys(copy)).toEqual(['__proto__', 'a']);
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('turns shared values into separate copies, as a reload would', () => {
    const shared = { hp: 1 };
    const copy = cloneJson({ a: shared, b: shared });
    expect(copy.a).not.toBe(copy.b);
    expect(copy.a).toEqual(copy.b);
  });
});
