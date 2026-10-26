import { describe, expect, it } from 'vitest';
import { formatSweep } from './report.ts';
import type { NumberSummary } from './stats.ts';
import type { SweepReport } from './sweep.ts';

const summary = (mean: number, low: number, high: number, spread: readonly number[]): NumberSummary => {
  const [min, p10, p50, p90, max] = spread as [number, number, number, number, number];
  return { n: 20, mean, sd: 1, interval: { low, high }, min, p10, p50, p90, max };
};

const REPORT: SweepReport = {
  runs: 20,
  policy: 'greedy',
  ends: { ended: 18, stopped: 0, capped: 2 },
  distinct: 19,
  turns: summary(12.5, 11.25, 13.754, [7, 9, 12, 16, 20]),
  metrics: [
    { label: 'hold.count', kind: 'number', summary: summary(9.5, 8.756, 10.244, [6, 7, 10, 10, 10]), none: 1 },
    {
      label: 'flag.on',
      kind: 'values',
      values: [
        { value: true, runs: 15, share: 0.75, low: 0.5313, high: 0.8881 },
        { value: null, runs: 5, share: 0.25, low: 0.1119, high: 0.4687 },
      ],
    },
  ],
  beats: [],
  refused: { count: 0, first: [] },
};

describe('a sweep in words', () => {
  it('is the lines eb sim prints and the editor’s Run shows', () => {
    expect(formatSweep('hold', REPORT, 1000)).toEqual([
      'hold: 20 runs with the greedy policy, at most 1000 turns each.',
      'Ends: 18 ended, 2 cut off at the turn cap, in 19 different states.',
      'Turns: mean 12.50 (95% 11.25 to 13.75); p10 9, median 12, p90 16; 7 to 20.',
      'hold.count: mean 9.50 (95% 8.76 to 10.24); p10 7, median 10, p90 10; 6 to 10; no value in 1 runs.',
      'flag.on: true 75.0% (95% 53.1% to 88.8%), none 25.0% (95% 11.2% to 46.9%).',
      'Refused offers: none.',
    ]);
  });

  it('names the stage a walked game’s runs played with (M6.9)', () => {
    expect(formatSweep('hold', { ...REPORT, stage: 'walk+fight' }, 1000)[0]).toBe(
      'hold: 20 runs with the greedy policy and the walk and fight stage, at most 1000 turns each.',
    );
  });

  it('names the first offers the game refused', () => {
    const refused = {
      count: 4,
      first: [1, 2, 3, 4].map((n) => ({
        seed: `seed-${n}`,
        turn: n,
        action: { type: 'hold/loot' },
        reason: 'full',
      })),
    };
    const lines = formatSweep('hold', { ...REPORT, refused }, 1000);
    expect(lines.at(-1)).toBe(
      'Refused offers: 4. The game offered these and then refused them: seed-1 turn 1, hold/loot (full); seed-2 turn 2, hold/loot (full); seed-3 turn 3, hold/loot (full).',
    );
  });
});
