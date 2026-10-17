import { describe, expect, it } from 'vitest';
import { nearestRank, summarize, t95, wilson, Z95 } from './stats.ts';

// The expected values come from docs/specs/runner.md's golden vectors: a Python check that
// inverts Student's t from the incomplete beta function, independent of the table here.
describe('t95', () => {
  it('matches the exact quantiles, from the table and from the expansion past it', () => {
    expect(t95(1)).toBe(12.7062047362);
    expect(t95(7)).toBeCloseTo(2.364624251592784, 9);
    expect(t95(30)).toBeCloseTo(2.042272456301233, 9);
    expect(t95(31)).toBeCloseTo(2.0395134463964064, 7);
    expect(t95(40)).toBeCloseTo(2.0210753903062697, 7);
    expect(t95(1000)).toBeCloseTo(1.9623390808264358, 9);
    // t approaches z from above, by about 2.37 / df.
    expect(t95(1e9) - Z95).toBeCloseTo(2.37e-9, 11);
  });

  it('falls as the degrees of freedom rise, without a step where the table ends', () => {
    const values = Array.from({ length: 200 }, (_, i) => t95(i + 1));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1] as number);
  });

  it('refuses degrees of freedom that are not whole and positive', () => {
    for (const df of [0, -1, 2.5, Number.NaN]) expect(() => t95(df)).toThrow(RangeError);
  });
});

describe('wilson', () => {
  it.each([
    [34, 1000, 0.024431348663226313, 0.04713519024531107],
    [0, 20, 0, 0.16112515805281938],
    [20, 20, 0.8388748419471806, 1],
    [7, 10, 0.39677814746114537, 0.8922087325936989],
    [1, 1, 0.20654931437723745, 1],
  ])('gives %i of %i as its golden interval', (count, of, low, high) => {
    const interval = wilson(count, of);
    expect(interval.low).toBeCloseTo(low, 12);
    expect(interval.high).toBeCloseTo(high, 12);
  });

  it('says nothing about a share of nothing', () => {
    expect(wilson(0, 0)).toEqual({ low: 0, high: 1 });
  });
});

describe('summarize', () => {
  it('gives the mean, the sample deviation and the t interval of a small sample', () => {
    const summary = summarize([9, 2, 4, 5, 4, 7, 4, 5]);
    expect(summary).toMatchObject({ n: 8, mean: 5, min: 2, p10: 2, p50: 4, p90: 9, max: 9 });
    expect(summary?.sd).toBeCloseTo(2.138089935299395, 12);
    expect(summary?.interval?.low).toBeCloseTo(3.21251208176379, 9);
    expect(summary?.interval?.high).toBeCloseTo(6.787487918236209, 9);
  });

  it('matches a larger sample, whose interval comes from the expansion', () => {
    const values = Array.from({ length: 250 }, (_, i) => ((i * 37) % 101) / 4);
    const summary = summarize(values);
    expect(summary?.mean).toBeCloseTo(12.446, 10);
    expect(summary?.sd).toBeCloseTo(7.317908933886691, 10);
    expect(summary?.interval?.low).toBeCloseTo(11.53444870765984, 7);
    expect(summary?.interval?.high).toBeCloseTo(13.35755129234016, 7);
  });

  it('has no deviation or interval for one value, and no summary for none', () => {
    expect(summarize([3])).toEqual({
      n: 1,
      mean: 3,
      sd: null,
      interval: null,
      min: 3,
      p10: 3,
      p50: 3,
      p90: 3,
      max: 3,
    });
    expect(summarize([])).toBeNull();
  });
});

describe('nearestRank', () => {
  it('picks a value from the list by rank, never a blend', () => {
    const sorted = Array.from({ length: 1000 }, (_, i) => i + 1);
    expect([10, 50, 90, 100].map((p) => nearestRank(sorted, p))).toEqual([100, 500, 900, 1000]);
    expect([10, 50, 90].map((p) => nearestRank([1, 2, 3], p))).toEqual([1, 2, 3]);
  });
});
