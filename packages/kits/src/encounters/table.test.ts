/**
 * A fight's table (docs/specs/encounters.md#the-table): whole numbers out of 10,000, each result a
 * whole percent, the hurt within it shared out, and the row a roll picks.
 */
import { describe, expect, it } from 'vitest';
import type { Fighter, Match } from './lines.ts';
import type { Ends } from './rounds.ts';
import { outcomesOf, rowAt, rowsOf, shares } from './table.ts';

describe('shares', () => {
  it('rounds down, then gives the units still short to the largest remainders, ties to the earlier', () => {
    expect(shares([1, 1, 1], 100)).toEqual([34, 33, 33]);
    expect(shares([0.296, 0.704], 100)).toEqual([30, 70]);
    expect(shares([0.5, 0.5, 0], 3)).toEqual([2, 1, 0]);
  });

  it('never gives a unit to what can’t happen, and gives nothing when nothing can', () => {
    expect(shares([0.999, 0.001, 0], 100)).toEqual([100, 0, 0]);
    expect(shares([0.0001, 0, 0.9999], 100)).toEqual([0, 0, 100]);
    expect(shares([0, 0], 10)).toEqual([0, 0]);
  });

  it('adds up to the total even when the chances add up to a hair under 1', () => {
    const values = [0.1, 0.2, 0.3, 0.4 - 1e-15];
    expect(shares(values, 10_000).reduce((a, b) => a + b, 0)).toBe(10_000);
  });
});

// The one-round coin flip: each side hits half the time, so a quarter each of win, lose, both
// down (a draw, hurt 1) and neither (a draw when the round runs out, hurt 0).
const flip: Ends = { win: [0.25, 0], draw: [0.25, 0.25], lose: [0, 0.25] };

describe('the rows', () => {
  it('are win’s, then draw’s, then loss’s, each by hurt, adding up to 10,000', () => {
    expect(rowsOf(flip)).toEqual([
      { result: 'win', hurt: 0, weight: 2500 },
      { result: 'draw', hurt: 0, weight: 2500 },
      { result: 'draw', hurt: 1, weight: 2500 },
      { result: 'lose', hurt: 1, weight: 2500 },
    ]);
  });

  it('make each result a whole percent first, then share its hurts out within it', () => {
    // Win 2/3 and loss 1/3 are 67% and 33%; the win's two hurts share 6700 as 1/3 to 2/3.
    const ends: Ends = { win: [2 / 9, 4 / 9], draw: [0, 0], lose: [0, 1 / 3] };
    const rows = rowsOf(ends);
    expect(rows).toEqual([
      { result: 'win', hurt: 0, weight: 2233 },
      { result: 'win', hurt: 1, weight: 4467 },
      { result: 'lose', hurt: 1, weight: 3300 },
    ]);
  });

  it('leave out a result that rounds to 0%', () => {
    const rows = rowsOf({ win: [0.996], draw: [0.004], lose: [0] });
    expect(rows).toEqual([{ result: 'win', hurt: 0, weight: 10_000 }]);
  });
});

describe('the outcomes and the roll', () => {
  const party: Fighter[] = [
    { actor: 'a', health: 1, hit: 50, dodge: 0, damage: 1, armour: 0 },
    { actor: 'b', health: 2, hit: 50, dodge: 0, damage: 1, armour: 0 },
  ];
  const match = { party } as unknown as Match;

  it('give each result its percent and the least and most hurt and falls over its rows', () => {
    const rows = rowsOf({ win: [0.1, 0.3, 0.1, 0], draw: [0, 0, 0, 0], lose: [0, 0, 0, 0.5] });
    expect(outcomesOf(match, rows)).toEqual([
      { result: 'win', chance: 50, hurt: [0, 2], falls: [0, 1] },
      { result: 'lose', chance: 50, hurt: [3, 3], falls: [2, 2] },
    ]);
  });

  it('picks the first row whose running total reaches the roll', () => {
    const rows = rowsOf(flip);
    expect([1, 2500, 2501, 5000, 5001, 7500, 7501, 10_000].map((roll) => rowAt(rows, roll))).toEqual(
      [0, 0, 1, 1, 2, 2, 3, 3].map((i) => rows[i]),
    );
    expect(() => rowAt(rows, 10_001)).toThrow(/past the table/);
  });
});
