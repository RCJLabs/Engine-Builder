import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Rng } from './rng.ts';

const draws = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng.nextU32());

// Frozen from docs/specs/rng_oracle.py, an independent implementation of docs/specs/rng.md.
// A change to any of these numbers changes every seeded game: it needs a decision, not an update.
describe('golden vectors (docs/specs/rng.md)', () => {
  it('raw stream', () => {
    expect(draws(Rng.create('engine-builder'), 8)).toEqual([
      1378790326, 99929701, 3719599711, 3668007137, 2638831411, 4283105152, 3659860869, 927470604,
    ]);
  });

  it('forks', () => {
    expect(draws(Rng.create('engine-builder').fork('loot'), 4)).toEqual([
      3339932023, 4083315149, 1132011579, 604863715,
    ]);
    expect(draws(Rng.create('engine-builder').fork(7), 2)).toEqual([118457561, 2351127793]);
  });

  it('state after three draws', () => {
    const rng = Rng.create('engine-builder');
    draws(rng, 3);
    expect(rng.toState()).toEqual({ seed: 'engine-builder', s: [1404016108, 254128723, 2904986454, 2009862306] });
  });

  it('helpers', () => {
    const dice = Rng.create('dice');
    expect(Array.from({ length: 12 }, () => dice.int(1, 6))).toEqual([1, 4, 5, 6, 1, 2, 2, 1, 5, 4, 1, 5]);
    // A span where a quarter of raw draws are rejected, so the bias guard is exercised.
    const wide = Rng.create('wide');
    expect(Array.from({ length: 8 }, () => wide.int(0, 3221225471))).toEqual([
      132213907, 1586911512, 2090067538, 116268688, 1124933079, 589598981, 2311357304, 275667628,
    ]);
    const odds = Rng.create('odds');
    expect(Array.from({ length: 10 }, () => odds.chance(70, 100))).toEqual([
      true,
      false,
      true,
      false,
      true,
      true,
      true,
      true,
      false,
      true,
    ]);
    expect(Rng.create('deck').shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([0, 3, 5, 7, 2, 9, 4, 6, 8, 1]);
    const weights = Rng.create('weights');
    expect(Array.from({ length: 10 }, () => weights.weightedIndex([5, 0, 3, 2]))).toEqual([
      3, 0, 2, 3, 0, 0, 2, 0, 2, 0,
    ]);
  });
});

describe('properties', () => {
  it('a seed always gives the same sequence', () => {
    fc.assert(
      fc.property(fc.string(), (seed) => {
        expect(draws(Rng.create(seed), 16)).toEqual(draws(Rng.create(seed), 16));
      }),
    );
  });

  it('a fork never depends on how many numbers the parent drew', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.nat(64), (seed, label, k) => {
        const parent = Rng.create(seed);
        draws(parent, k);
        expect(draws(parent.fork(label), 8)).toEqual(draws(Rng.create(seed).fork(label), 8));
      }),
    );
  });

  it('different labels give different streams', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), (seed, a, b) => {
        fc.pre(a !== b);
        const root = Rng.create(seed);
        expect(draws(root.fork(a), 2)).not.toEqual(draws(root.fork(b), 2));
      }),
    );
  });

  it('a saved state resumes exactly, through JSON', () => {
    fc.assert(
      fc.property(fc.string(), fc.nat(64), (seed, k) => {
        const rng = Rng.create(seed);
        draws(rng, k);
        const saved = JSON.parse(JSON.stringify(rng.toState()));
        expect(draws(Rng.fromState(saved), 16)).toEqual(draws(rng, 16));
      }),
    );
  });

  it('int stays inside [min, max] for any span up to 2^32', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1e12, max: 1e12 }),
        fc.nat({ max: 2 ** 32 - 1 }),
        fc.string(),
        (min, span, seed) => {
          const value = Rng.create(seed).int(min, min + span);
          expect(value).toBeGreaterThanOrEqual(min);
          expect(value).toBeLessThanOrEqual(min + span);
          expect(Number.isInteger(value)).toBe(true);
        },
      ),
    );
  });

  it('shuffle returns a permutation and leaves its input alone', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), fc.string(), (items, seed) => {
        const before = items.slice();
        const shuffled = Rng.create(seed).shuffle(items);
        expect(items).toEqual(before);
        expect(shuffled.slice().sort((a, b) => a - b)).toEqual(before.slice().sort((a, b) => a - b));
      }),
    );
  });

  it('weightedIndex never picks a zero weight', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(20), { minLength: 1, maxLength: 12 }), fc.string(), (weights, seed) => {
        fc.pre(weights.some((w) => w > 0));
        const rng = Rng.create(seed);
        for (let i = 0; i < 20; i++) expect(weights[rng.weightedIndex(weights)]).toBeGreaterThan(0);
      }),
    );
  });
});

describe('distribution', () => {
  // Chi-square against the p = 0.001 critical value. The seeds are fixed, so these cannot flake:
  // a failure means the generator or a helper changed.
  const chiSquare = (observed: number[], expected: number[]) =>
    observed.reduce((sum, o, i) => sum + (o - (expected[i] ?? 0)) ** 2 / (expected[i] ?? 1), 0);

  it('int(1, 6) is uniform over 60,000 rolls', () => {
    const rolls = Rng.create('chi-dice');
    const tally = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) {
      const face = rolls.int(1, 6) - 1;
      tally[face] = (tally[face] ?? 0) + 1;
    }
    expect(chiSquare(tally, Array(6).fill(10_000))).toBeLessThan(20.515); // df 5
  });

  it('weightedIndex follows its weights over 100,000 picks', () => {
    const rng = Rng.create('chi-weights');
    const tally = [0, 0, 0, 0];
    for (let i = 0; i < 100_000; i++) {
      const index = rng.weightedIndex([5, 0, 3, 2]);
      tally[index] = (tally[index] ?? 0) + 1;
    }
    expect(tally[1]).toBe(0);
    expect(chiSquare([tally[0] ?? 0, tally[2] ?? 0, tally[3] ?? 0], [50_000, 30_000, 20_000])).toBeLessThan(13.816); // df 2
  });
});

describe('bad input fails loudly', () => {
  it('rejects bad ranges, odds, weights, lists and states', () => {
    const rng = Rng.create('errors');
    expect(() => rng.int(2, 1)).toThrow(RangeError);
    expect(() => rng.int(0, 2 ** 32)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
    expect(() => rng.chance(101, 100)).toThrow(RangeError);
    expect(() => rng.chance(1, 0)).toThrow(RangeError);
    expect(() => rng.weightedIndex([0, 0])).toThrow(RangeError);
    expect(() => rng.weightedIndex([3, -1])).toThrow(RangeError);
    expect(() => rng.weightedIndex([1.5])).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
    expect(() => Rng.fromState({ seed: 'x', s: [1, 2, 3] } as never)).toThrow(RangeError);
    expect(() => Rng.fromState({ seed: 'x', s: [1, 2, 3, -4] })).toThrow(RangeError);
    expect(() => Rng.fromState({ seed: 'x', s: [1, 2, 3, 2 ** 32] })).toThrow(RangeError);
  });
});
