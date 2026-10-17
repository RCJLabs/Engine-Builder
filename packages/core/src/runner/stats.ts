/**
 * Statistics for seed sweeps (docs/specs/runner.md): 95% intervals for a share (Wilson's) and for
 * a mean (Student's t), and quantiles by nearest rank. Arithmetic and square roots only, which
 * IEEE 754 rounds exactly, so a sweep gives the same numbers in every engine.
 */

/** The 0.975 quantile of the standard normal, for a two-sided 95% interval. */
export const Z95 = 1.959963984540054;

// Student's t at 0.975 for 1 to 30 degrees of freedom, to 10 decimals.
const T95 = [
  12.7062047362, 4.3026527297, 3.1824463053, 2.7764451052, 2.5705818356, 2.4469118511, 2.3646242516, 2.3060041352,
  2.2621571628, 2.228138852, 2.2009851601, 2.1788128297, 2.1603686565, 2.1447866879, 2.1314495456, 2.1199052992,
  2.1098155778, 2.1009220402, 2.0930240544, 2.0859634473, 2.0796138447, 2.0738730679, 2.0686576104, 2.0638985616,
  2.0595385528, 2.0555294386, 2.0518305165, 2.0484071418, 2.0452296421, 2.0422724563,
];

// The Cornish–Fisher expansion of t in powers of 1/df (Abramowitz and Stegun 26.7.5). Past 30
// degrees of freedom, four terms are within 3e-8 of the exact quantile.
const z3 = Z95 * Z95 * Z95;
const z5 = z3 * Z95 * Z95;
const z7 = z5 * Z95 * Z95;
const z9 = z7 * Z95 * Z95;
const G1 = (z3 + Z95) / 4;
const G2 = (5 * z5 + 16 * z3 + 3 * Z95) / 96;
const G3 = (3 * z7 + 19 * z5 + 17 * z3 - 15 * Z95) / 384;
const G4 = (79 * z9 + 776 * z7 + 1482 * z5 - 1920 * z3 - 945 * Z95) / 92160;

/** Student's t at 0.975 for `df` degrees of freedom: the multiplier of a 95% interval of a mean. */
export function t95(df: number): number {
  if (!Number.isSafeInteger(df) || df < 1)
    throw new RangeError(`t95(): ${df} is not a whole number of degrees of freedom`);
  const tabled = T95[df - 1];
  if (tabled !== undefined) return tabled;
  const inv = 1 / df;
  return Z95 + inv * (G1 + inv * (G2 + inv * (G3 + inv * G4)));
}

export interface Interval {
  readonly low: number;
  readonly high: number;
}

/**
 * Wilson's 95% interval for a share of `count` in `of`. Unlike the normal approximation it stays
 * inside 0 to 1 and still says something at 0 of 20 or 20 of 20.
 */
export function wilson(count: number, of: number): Interval {
  if (of === 0) return { low: 0, high: 1 };
  const p = count / of;
  const z2 = Z95 * Z95;
  const scale = 1 + z2 / of;
  const centre = (p + z2 / (2 * of)) / scale;
  const half = (Z95 * Math.sqrt((p * (1 - p)) / of + z2 / (4 * of * of))) / scale;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

export interface NumberSummary {
  readonly n: number;
  readonly mean: number;
  /** The sample standard deviation, or null with a single value. */
  readonly sd: number | null;
  /** The 95% interval of the mean, or null with a single value. */
  readonly interval: Interval | null;
  readonly min: number;
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
  readonly max: number;
}

/** A summary of numbers in the order given, which fixes the rounding; null when there are none. */
export function summarize(values: readonly number[]): NumberSummary | null {
  const n = values.length;
  if (n === 0) return null;
  // Two passes: the mean of whole numbers comes out exact, as it doesn't from a running mean.
  let sum = 0;
  for (const x of values) sum += x;
  const mean = sum / n;
  let squares = 0;
  for (const x of values) squares += (x - mean) * (x - mean);
  const sd = n > 1 ? Math.sqrt(squares / (n - 1)) : null;
  const half = sd === null ? 0 : (t95(n - 1) * sd) / Math.sqrt(n);
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n,
    mean,
    sd,
    interval: sd === null ? null : { low: mean - half, high: mean + half },
    min: sorted[0] as number,
    p10: nearestRank(sorted, 10),
    p50: nearestRank(sorted, 50),
    p90: nearestRank(sorted, 90),
    max: sorted[n - 1] as number,
  };
}

/** The value at `percent` by nearest rank: one of the values, never a blend of two. */
export function nearestRank(sorted: readonly number[], percent: number): number {
  // percent × n is a whole number, so dividing by 100 lands exactly on a whole rank when there is one.
  const rank = Math.max(1, Math.ceil((percent * sorted.length) / 100));
  return sorted[rank - 1] as number;
}
