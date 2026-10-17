import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { summarize, t95, wilson } from './stats.ts';

/**
 * Runs docs/specs/stats_oracle.py, which works Student's t out from its CDF rather than from a
 * table, and checks every case against @eb/core. Like the other oracles it fails, rather than
 * skips, without Python: a skipped oracle looks exactly like a passing one.
 */
const oraclePath = resolve(import.meta.dirname, '../../../../docs/specs/stats_oracle.py');

interface Oracle {
  t95: Record<string, number>;
  wilson: Record<string, [number, number]>;
  small: Record<string, number>;
  spread: Record<string, number>;
}

describe('stats oracle (docs/specs/stats_oracle.py)', () => {
  const oracle = JSON.parse(execFileSync('python3', ['-I', oraclePath], { encoding: 'utf8' })) as Oracle;

  it('agrees on t, to the table’s 10 decimals and within 3e-8 past it', () => {
    for (const [df, exact] of Object.entries(oracle.t95)) {
      const ours = t95(Number(df));
      expect(Math.abs(ours - exact), `df ${df}`).toBeLessThan(Number(df) <= 30 ? 5e-11 : 3e-8);
    }
  });

  it('agrees on every Wilson interval', () => {
    for (const [key, [low, high]] of Object.entries(oracle.wilson)) {
      const [count, of] = key.split('/').map(Number) as [number, number];
      const ours = wilson(count, of);
      expect(ours.low, key).toBeCloseTo(low, 13);
      expect(ours.high, key).toBeCloseTo(high, 13);
    }
  });

  it('agrees on the summaries of a small sample and a large one', () => {
    const samples = {
      small: [9, 2, 4, 5, 4, 7, 4, 5],
      spread: Array.from({ length: 250 }, (_, i) => ((i * 37) % 101) / 4),
    };
    for (const [name, values] of Object.entries(samples)) {
      const ours = summarize(values);
      const exact = oracle[name as 'small' | 'spread'];
      expect(ours?.mean, name).toBeCloseTo(exact.mean as number, 12);
      expect(ours?.sd, name).toBeCloseTo(exact.sd as number, 12);
      expect(ours?.interval?.low, name).toBeCloseTo(exact.low as number, 7);
      expect(ours?.interval?.high, name).toBeCloseTo(exact.high as number, 7);
      expect([ours?.p10, ours?.p50, ours?.p90], name).toEqual([exact.p10, exact.p50, exact.p90]);
    }
  });
});
