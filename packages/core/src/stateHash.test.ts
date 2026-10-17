import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CanonicalError, pointerSegment } from './canonical.ts';
import { firstDifference, readFacets, stateHash } from './stateHash.ts';

// A small game-like state. Its numbers are frozen in docs/specs/state-hash.md and reproduced by
// docs/specs/state_hash_oracle.py; changing one changes every golden built on this format.
const sample = {
  rng: { seed: 'golden', s: [1, 2, 3, 4] },
  day: 12,
  party: [
    { id: 'kit', hp: 7, traits: ['steady'] },
    { id: 'rook', hp: 0, traits: [] },
  ],
  flags: { 'met-rook': true, 'debt/paid': false },
  log: ['Day 12: the convoy left.'],
};

describe('golden vectors (docs/specs/state-hash.md)', () => {
  it('hashes the sample state', () => {
    expect(stateHash(sample)).toBe('61b52a949bf94885');
  });

  it('reads the sample facets, leaving the log out', () => {
    expect(readFacets(sample, { exclude: ['log'] })).toEqual({
      day: { hash: '07f89407b4ba0c0a', size: 2 },
      flags: { hash: '42d820a12920cb94', size: 35 },
      party: { hash: 'dfd11344b8f2d73d', size: 74 },
      rng: { hash: '01c07163fbaa34d8', size: 31 },
    });
  });
});

describe('readFacets', () => {
  it('reads every top-level key unless excluded, in key order', () => {
    expect(Object.keys(readFacets(sample))).toEqual(['day', 'flags', 'log', 'party', 'rng']);
  });

  it('throws when exclude names a key the state does not have', () => {
    expect(() => readFacets(sample, { exclude: ['logs'] })).toThrow(/"logs"/);
  });

  it('skips undefined facets, like a reloaded save', () => {
    expect(Object.keys(readFacets({ a: 1, b: undefined }))).toEqual(['a']);
  });

  it('names the whole path when a facet holds something JSON cannot', () => {
    expect(() => readFacets({ inventory: [{ count: Number.NaN }] })).toThrow(CanonicalError);
    expect(() => readFacets({ inventory: [{ count: Number.NaN }] })).toThrow('/inventory/0/count');
  });

  it('needs an object at the top', () => {
    expect(() => readFacets([1, 2] as never)).toThrow(CanonicalError);
  });

  it('tells a different shape from a different value by size', () => {
    const moreFields = readFacets({ hero: { hp: 7, mp: 3 } }).hero;
    const otherValue = readFacets({ hero: { hp: 8 } }).hero;
    const base = readFacets({ hero: { hp: 7 } }).hero;
    expect(otherValue?.size).toBe(base?.size);
    expect(moreFields?.size).not.toBe(base?.size);
  });
});

describe('firstDifference', () => {
  it('is null for states equal as JSON, whatever their key order', () => {
    expect(firstDifference(sample, structuredClone(sample))).toBeNull();
    expect(firstDifference({ a: 1, b: [0] }, { b: [-0], a: 1 })).toBeNull();
    expect(firstDifference({ a: 1, gone: undefined }, { a: 1 })).toBeNull();
  });

  it('names the first differing leaf', () => {
    expect(firstDifference({ a: { b: [1, 2] } }, { a: { b: [1, 3] } })).toEqual({ path: '/a/b/1', a: 2, b: 3 });
  });

  it('walks keys in canonical order', () => {
    expect(firstDifference({ b: 1, a: 1 }, { b: 2, a: 2 })?.path).toBe('/a');
  });

  it('reports a missing key, a longer array and a changed shape at their own paths', () => {
    expect(firstDifference({ a: 1 }, { a: 1, z: 2 })).toEqual({ path: '/z', a: undefined, b: 2 });
    expect(firstDifference([1, 2], [1, 2, 3])).toEqual({ path: '/2', a: undefined, b: 3 });
    expect(firstDifference({ a: [1] }, { a: { 0: 1 } })?.path).toBe('/a');
    expect(firstDifference(1, '1')?.path).toBe('');
  });

  it('escapes keys in the path', () => {
    expect(firstDifference({ 'x/y': { 'm~n': 1 } }, { 'x/y': { 'm~n': 2 } })?.path).toBe('/x~1y/m~0n');
  });

  it('finds any single changed leaf at exactly its path', () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.nat(), (value, pick) => {
        const leaves = leafPaths(value);
        const target = leaves[pick % leaves.length] as (string | number)[];
        // Always a different shape: an empty array that grew would differ one level down, at /0.
        const replacement = Array.isArray(valueAt(value, target)) ? '§ changed' : ['§ changed'];
        const changed = setAt(structuredClone(value), target, replacement);
        const pointer = target.map((segment) => `/${pointerSegment(segment)}`).join('');
        expect(firstDifference(value, changed)?.path).toBe(pointer);
      }),
    );
  });
});

/** Paths to every leaf (and every empty array or object), as key/index lists. */
function leafPaths(value: unknown, path: (string | number)[] = []): (string | number)[][] {
  if (Array.isArray(value) && value.length > 0) return value.flatMap((item, i) => leafPaths(item, [...path, i]));
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0) {
    return Object.entries(value).flatMap(([key, item]) => leafPaths(item, [...path, key]));
  }
  return [path];
}

function valueAt(root: unknown, path: (string | number)[]): unknown {
  return path.reduce<unknown>((node, segment) => (node as Record<string | number, unknown>)[segment], root);
}

function setAt(root: unknown, path: (string | number)[], replacement: unknown): unknown {
  if (path.length === 0) return replacement;
  let node = root as Record<string | number, unknown>;
  for (const segment of path.slice(0, -1)) node = node[segment] as Record<string | number, unknown>;
  Object.defineProperty(node, path[path.length - 1] as string | number, {
    value: replacement,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return root;
}
