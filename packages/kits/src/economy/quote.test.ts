import { describe, expect, it } from 'vitest';
import { buyPrice, sellPrice } from './quote.ts';

// Worked with Python's fractions.Fraction (docs/specs/kits.md): the first four are Space-Wrecked's
// own prices (step 5, buying at 100 and selling at 50).
const BUYS: [value: number, sellsAt: number, rules: number[], step: number, price: number][] = [
  [200, 100, [], 5, 200],
  [45, 100, [], 5, 45],
  [137, 100, [], 5, 135],
  [25, 50, [], 5, 15],
  [200, 100, [120], 5, 240],
  [200, 100, [120, 90], 5, 215],
  [0, 100, [], 5, 0],
  [1, 100, [], 5, 0],
  [3, 50, [], 1, 2],
];

const SELLS: [value: number, buysAt: number, step: number, price: number][] = [
  [45, 50, 5, 20],
  [200, 50, 5, 100],
  [199, 50, 5, 95],
  [10, 50, 5, 5],
  [1, 50, 1, 0],
];

describe('the quote', () => {
  it('prices a buy to the nearest step, halves up', () => {
    for (const [value, sellsAt, rules, step, price] of BUYS) {
      expect(buyPrice(value, sellsAt, rules, step), `${value} at ${sellsAt}% ${rules}`).toBe(price);
    }
  });

  it('prices a sale down to the step', () => {
    for (const [value, buysAt, step, price] of SELLS) {
      expect(sellPrice(value, buysAt, step), `${value} at ${buysAt}%`).toBe(price);
    }
  });

  it('gives the same price whatever order the rules come in, as one fraction rounded once', () => {
    expect(buyPrice(200, 100, [90, 120], 5)).toBe(buyPrice(200, 100, [120, 90], 5));
    expect(buyPrice(777, 105, [110, 95, 130], 1)).toBe(buyPrice(777, 105, [130, 110, 95], 1));
    // Rounded once: 7 × 1.1 × 1.1 = 8.47 is 8, where rounding after each rule would give 8, then 9.
    expect(buyPrice(7, 100, [110, 110], 1)).toBe(8);
  });

  it('counts exactly up to the largest whole number a number holds, and throws past it', () => {
    expect(buyPrice(Number.MAX_SAFE_INTEGER, 100, [], 1)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => buyPrice(Number.MAX_SAFE_INTEGER, 101, [], 1)).toThrow('past what the engine counts exactly');
  });

  it('throws on numbers that are not whole and 0 or more: validation stops them in content', () => {
    expect(() => buyPrice(1.5, 100, [], 1)).toThrow('whole number');
    expect(() => buyPrice(10, -1, [], 1)).toThrow('whole number');
    expect(() => sellPrice(10, 50, 0.5)).toThrow('whole number');
  });
});
