import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type Condition, compare, evaluate, type FactTest, type Truth } from './index.ts';

const values: Record<string, unknown> = { 'a.yes': true, 'a.no': false, 'a.n': 3, 'a.s': 'rim', 'a.nan': Number.NaN };
const read = (test: FactTest) => values[test.fact];
const T: Condition = { fact: 'a.yes' };
const F: Condition = { fact: 'a.no' };
const U: Condition = { fact: 'a.none' };

// Kleene's tables, written out independently of the evaluator.
const and = (a: Truth, b: Truth): Truth =>
  a === false || b === false ? false : a === null || b === null ? null : true;
const or = (a: Truth, b: Truth): Truth => (a === true || b === true ? true : a === null || b === null ? null : false);

describe('evaluate', () => {
  it("follows Kleene's tables for all, any and not", () => {
    const cases: [Condition, Truth][] = [
      [T, true],
      [F, false],
      [U, null],
    ];
    for (const [a, truthA] of cases) {
      expect(evaluate({ not: a }, read)).toBe(truthA === null ? null : !truthA);
      for (const [b, truthB] of cases) {
        expect(evaluate({ all: [a, b] }, read)).toBe(and(truthA, truthB));
        expect(evaluate({ any: [a, b] }, read)).toBe(or(truthA, truthB));
      }
    }
  });

  it('gives the same answer whatever order the parts come in', () => {
    const tree: fc.Arbitrary<Condition> = fc.letrec<{ cond: Condition }>((tie) => ({
      cond: fc.oneof(
        { depthSize: 'small' },
        fc.constantFrom(T, F, U),
        fc.array(tie('cond'), { minLength: 2, maxLength: 4 }).map((all) => ({ all })),
        fc.array(tie('cond'), { minLength: 2, maxLength: 4 }).map((any) => ({ any })),
        tie('cond').map((not) => ({ not })),
      ),
    })).cond;
    const reversed = (c: Condition): Condition =>
      'all' in c
        ? { all: c.all.map(reversed).reverse() }
        : 'any' in c
          ? { any: c.any.map(reversed).reverse() }
          : 'not' in c
            ? { not: reversed(c.not) }
            : c;
    fc.assert(
      fc.property(tree, (c) => evaluate(reversed(c), read) === evaluate(c, read)),
      { numRuns: 500 },
    );
  });

  it('treats a yes/no test of a fact that is not true or false as unknown', () => {
    expect(evaluate({ fact: 'a.n' }, read)).toBeNull();
    expect(evaluate({ not: { fact: 'a.n' } }, read)).toBeNull();
  });

  it('passes each test to the reader, arguments and all', () => {
    const seen: FactTest[] = [];
    const test = { fact: 'hold.count', args: { item: 'medkit' }, op: '>=', value: 2 } as const;
    evaluate({ not: test }, (t) => {
      seen.push(t);
      return 1;
    });
    expect(seen).toEqual([test]);
  });
});

describe('compare', () => {
  it.each([
    [3, '<', 5, true],
    [3, '>=', 5, false],
    [3, '<=', 3, true],
    [3, '>', 3, false],
    [3, '==', 3, true],
    [3, '!=', 3, false],
    ['rim', '==', 'rim', true],
    ['rim', '!=', 'core', true],
    [true, '==', false, false],
    // Unknown: no value, another type, NaN, or an ordering of text.
    [undefined, '==', 3, null],
    [null, '!=', 3, null],
    ['3', '==', 3, null],
    [3, '!=', '3', null],
    [Number.NaN, '!=', 3, null],
    ['a', '<', 'b', null],
    [true, '>', false, null],
  ] as const)('%j %s %j is %j', (actual, op, expected, truth) => {
    expect(compare(actual, op, expected)).toBe(truth);
  });

  it('makes not of an unknown comparison unknown too', () => {
    expect(evaluate({ not: { fact: 'a.s', op: '==', value: 3 } }, read)).toBeNull();
    expect(evaluate({ not: { fact: 'a.nan', op: '<', value: 3 } }, read)).toBeNull();
  });
});
