import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../canonical.ts';
import { createRecordStore } from '../records.ts';
import {
  type Condition,
  EXHAUSTIVE_LIMIT,
  evaluate,
  type FactCatalog,
  type FactTest,
  OPS,
  parseCondition,
  satisfiability,
} from './index.ts';

const catalog: FactCatalog = {
  'a.n': { domain: { type: 'int', min: 0, max: 10 } },
  'a.z': { domain: { type: 'int', min: 0 } },
  'a.m': { domain: { type: 'number', min: -1, max: 1 } },
  'a.e': { domain: { type: 'enum', values: ['x', 'y', 'z'] } },
  'a.b': { domain: { type: 'bool' } },
  'a.r': { domain: { type: 'ref', to: 'actor' } },
  'a.t': { domain: { type: 'text' } },
  'a.k': { args: { who: { type: 'ref', to: 'actor' } }, domain: { type: 'int', min: 0, max: 3 } },
  'a.slot': { args: { i: { type: 'int' } }, domain: { type: 'int', min: 0, max: 100 } },
  'a.word': { args: { i: { type: 'int' } }, domain: { type: 'text' } },
  'a.free': {},
};
const records = createRecordStore({ actor: { kit: {}, mara: {}, rook: {} } });

const sat = (text: string, withRecords = true) => {
  const parsed = parseCondition(text, catalog);
  if (!parsed.ok) throw new Error(parsed.message);
  const { canBeTrue, canBeFalse } = satisfiability(parsed.condition, { catalog, ...(withRecords ? { records } : {}) });
  return { canBeTrue, canBeFalse };
};

describe('satisfiability', () => {
  it.each([
    ['a.n > 10', false, true],
    ['a.n >= 10', true, true],
    ['a.n >= 0', true, false],
    ['a.n == 2.5', false, true],
    ['a.n > 2 and a.n < 3', false, true],
    ['a.n > 2.5 and a.n < 3.5', true, true],
    ['a.m > 0 and a.m < 0.5', true, true],
    ['a.m > 1 or a.m < -1', false, true],
    ['a.m <= 1', true, false],
    ['a.e == x and a.e == y', false, true],
    ['a.e == x or a.e != x', true, false],
    ['a.e == x or a.e == y or a.e == z', true, false],
    ['a.b and not a.b', false, true],
    ['a.b or a.b == false', true, false],
    ['a.r == kit or a.r == mara or a.r == rook', true, false],
    ['a.t == p or a.t != p', true, false],
    ['a.t == p and a.t == q', false, true],
    ['a.k(kit) > 2 and a.k(mara) < 1', true, true],
    ['a.k(kit) > 2 and a.k(kit) < 1', false, true],
    // A fact with no domain may hold anything, but not two things at once.
    ['a.free and not a.free', false, true],
    ['a.free or not a.free', true, false],
    // Never false: a value has one type, so one of the two tests is always unknown.
    ['a.free == 1 or a.free == "p"', true, false],
    ['a.free == 1 or a.free == 2', true, true],
    ['a.free > 2 and a.free < 2.5', true, true],
  ])('%s: can be true %j, can be false %j', (text, canBeTrue, canBeFalse) => {
    expect(sat(text)).toEqual({ canBeTrue, canBeFalse });
  });

  it('assumes another record exists when it is not told which do', () => {
    expect(sat('a.r == kit or a.r == mara or a.r == rook', false)).toEqual({ canBeTrue: true, canBeFalse: true });
  });

  it('agrees with trying every value, on domains small enough to try them all', () => {
    fc.assert(
      fc.property(tree, (condition) => {
        const brute = bruteForce(condition);
        fc.pre(brute !== undefined);
        const found = satisfiability(condition, { catalog, records });
        expect(found.exhaustive).toBe(true);
        expect({ canBeTrue: found.canBeTrue, canBeFalse: found.canBeFalse }).toEqual(brute);
      }),
      { numRuns: 400 },
    );
  });

  it(`tries all ${EXHAUSTIVE_LIMIT} combinations, and samples past that`, () => {
    // Each a.word(i) is compared with nine words, so it has ten classes of value.
    const words = (n: number): Condition => ({
      any: Array.from({ length: n }, (_, i) =>
        Array.from({ length: 9 }, (_, w) => ({ fact: 'a.word', args: { i }, op: '==' as const, value: `w${w}` })),
      ).flat(),
    });
    const five = satisfiability(words(5), { catalog });
    expect(five).toEqual({ canBeTrue: true, canBeFalse: true, combinations: 100_000, exhaustive: true });
    // Only one combination in 1,000,000 is false, and the sample misses it: unknown, not false.
    const six = satisfiability(words(6), { catalog });
    expect(six).toEqual({ canBeTrue: true, canBeFalse: null, combinations: 1_000_000, exhaustive: false });
  });

  it('reports unknown when a sample finds no way to be true, and the same each time', () => {
    const slots = Array.from({ length: 8 }, (_, i) => `a.slot(i: ${i}) > 50`).join(' and ');
    const parsed = parseCondition(`${slots} and a.n > 5 and a.n < 3`, catalog);
    if (!parsed.ok) throw new Error(parsed.message);
    const first = satisfiability(parsed.condition, { catalog });
    // Five classes for each slot (0, 49, 50, 51, 100) and seven for a.n (0, 2 to 6, 10).
    expect(first).toEqual({ canBeTrue: null, canBeFalse: true, combinations: 5 ** 8 * 7, exhaustive: false });
    expect(satisfiability(parsed.condition, { catalog })).toEqual(first);
  });
});

// Tests of every fact above, with constants on, between and beyond each domain's edges.
const test: fc.Arbitrary<FactTest> = fc.oneof(
  fc.record({
    fact: fc.constantFrom('a.n', 'a.z'),
    op: fc.constantFrom(...OPS),
    value: fc.constantFrom(-1, 0, 1, 2.5, 5, 9, 10, 11),
  }),
  fc.record({
    fact: fc.constant('a.m'),
    op: fc.constantFrom(...OPS),
    value: fc.constantFrom(-1.5, -1, -0.5, 0, 0.5, 1, 1.5),
  }),
  fc.record({ fact: fc.constant('a.e'), op: fc.constantFrom('==', '!='), value: fc.constantFrom('x', 'y', 'z') }),
  fc.oneof(
    fc.constant({ fact: 'a.b' }),
    fc.record({ fact: fc.constant('a.b'), op: fc.constantFrom('==', '!='), value: fc.boolean() }),
  ),
  fc.record({
    fact: fc.constant('a.r'),
    op: fc.constantFrom('==', '!='),
    value: fc.constantFrom('kit', 'mara', 'rook'),
  }),
  fc.record({ fact: fc.constant('a.t'), op: fc.constantFrom('==', '!='), value: fc.constantFrom('p', 'q') }),
  fc.record({
    fact: fc.constant('a.k'),
    args: fc.record({ who: fc.constantFrom('kit', 'mara') }),
    op: fc.constantFrom(...OPS),
    value: fc.constantFrom(0, 1, 2, 3, 4),
  }),
  fc.oneof(
    fc.constant({ fact: 'a.free' }),
    fc.record({
      fact: fc.constant('a.free'),
      op: fc.constantFrom(...OPS),
      value: fc.constantFrom(true, false, 'p', -1, 0, 2.5),
    }),
  ),
);
const tree: fc.Arbitrary<Condition> = fc.letrec<{ cond: Condition }>((tie) => ({
  cond: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    test,
    fc.array(tie('cond'), { minLength: 2, maxLength: 3 }).map((all) => ({ all })),
    fc.array(tie('cond'), { minLength: 2, maxLength: 3 }).map((any) => ({ any })),
    tie('cond').map((not) => ({ not })),
  ),
})).cond;

// Every value each fact can take, or one of each kind of value for the fact with no domain:
// quarter steps cover every gap between the half steps the tests compare a.m with.
const quarters = Array.from({ length: 9 }, (_, i) => -1 + i / 4);
const GRID: Readonly<Record<string, readonly unknown[]>> = {
  'a.n': Array.from({ length: 11 }, (_, i) => i),
  // No max, but nothing tests past 11, so 12 stands for every number above.
  'a.z': Array.from({ length: 13 }, (_, i) => i),
  'a.m': quarters,
  'a.e': ['x', 'y', 'z'],
  'a.b': [false, true],
  'a.r': ['kit', 'mara', 'rook'],
  'a.t': ['p', 'q', '', 'zz'],
  'a.k': [0, 1, 2, 3],
  'a.free': [undefined, false, true, 'p', 'other', -2, -1, -0.5, 0, 1, 2.5, 3],
};

/** Whether some values make it true, and some false, by trying them all; undefined when there are too many. */
function bruteForce(condition: Condition): { canBeTrue: boolean; canBeFalse: boolean } | undefined {
  const keys = new Map<string, readonly unknown[]>();
  const keyOf = (t: FactTest) => `${t.fact}${t.args ? canonicalJson(t.args) : ''}`;
  const visit = (c: Condition): void => {
    if ('all' in c) c.all.forEach(visit);
    else if ('any' in c) c.any.forEach(visit);
    else if ('not' in c) visit(c.not);
    else keys.set(keyOf(c), GRID[c.fact] as readonly unknown[]);
  };
  visit(condition);
  const names = [...keys.keys()];
  const grids = names.map((key) => keys.get(key) as readonly unknown[]);
  if (grids.reduce((n, g) => n * g.length, 1) > 30_000) return undefined;
  let canBeTrue = false;
  let canBeFalse = false;
  const assign = (i: number, values: Map<string, unknown>): void => {
    if (i === names.length) {
      const truth = evaluate(condition, (t) => values.get(keyOf(t)));
      canBeTrue ||= truth === true;
      canBeFalse ||= truth === false;
      return;
    }
    for (const value of grids[i] as readonly unknown[]) assign(i + 1, new Map(values).set(names[i] as string, value));
  };
  assign(0, new Map());
  return { canBeTrue, canBeFalse };
}
