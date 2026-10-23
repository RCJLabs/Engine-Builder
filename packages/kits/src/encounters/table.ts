/**
 * A fight's table (docs/specs/encounters.md#the-table): every way it can end, made whole numbers
 * out of 10,000, which the fight's one roll and its preview both read. Each result's chance is a
 * whole percent, so the percent on screen is the percent rolled; the hurt within it is shared out
 * in hundredths of a percent.
 */

import type { Effect } from '@eb/core';
import type { Built, Match, Reader } from './lines.ts';
import { matchOf } from './lines.ts';
import { type Ends, endsOf, fallenAt } from './rounds.ts';
import { RESULTS, type Result, ROLL_OUT_OF } from './types.ts';

export interface Row {
  readonly result: Result;
  readonly hurt: number;
  readonly weight: number;
}

export interface Outcome {
  readonly result: Result;
  /** Whole percent. */
  readonly chance: number;
  readonly hurt: readonly [number, number];
  readonly falls: readonly [number, number];
}

export interface FightTable {
  readonly match: Match;
  readonly rows: readonly Row[];
  readonly outcomes: readonly Outcome[];
}

/**
 * Whole numbers adding up to `total`, in proportion to `values`: each share rounded down, then
 * those still short go one each to the largest remainders, ties to the earlier. Only a value above
 * 0 gets one, so what can't happen stays at 0.
 */
export function shares(values: readonly number[], total: number): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) return values.map(() => 0);
  const exact = values.map((value) => (value / sum) * total);
  const whole = exact.map((share) => Math.floor(share));
  const order = exact
    .map((share, index) => ({ index, left: share - (whole[index] as number), live: (values[index] as number) > 0 }))
    .filter((each) => each.live)
    .sort((a, b) => b.left - a.left || a.index - b.index);
  let short = total - whole.reduce((a, b) => a + b, 0);
  for (let i = 0; short > 0; i = (i + 1) % order.length, short--) {
    const at = (order[i] as { index: number }).index;
    whole[at] = (whole[at] as number) + 1;
  }
  return whole;
}

/** The ends made whole: each result's percent, then its hurts' weights out of that percent times 100. */
export function rowsOf(ends: Ends): Row[] {
  const sumOf = (row: readonly number[]) => row.reduce((a, b) => a + b, 0);
  const percents = shares(
    RESULTS.map((result) => sumOf(ends[result])),
    100,
  );
  return RESULTS.flatMap((result, index) => {
    const weights = shares(ends[result], (percents[index] as number) * (ROLL_OUT_OF / 100));
    return weights.flatMap((weight, hurt) => (weight > 0 ? [{ result, hurt, weight }] : []));
  });
}

const span = (values: readonly number[]): [number, number] => [Math.min(...values), Math.max(...values)];

/** Each result with rows: its percent, and the least and most hurt and falls over its rows. */
export function outcomesOf(match: Match, rows: readonly Row[]): Outcome[] {
  return RESULTS.flatMap((result) => {
    const mine = rows.filter((row) => row.result === result);
    if (mine.length === 0) return [];
    const weight = mine.reduce((sum, row) => sum + row.weight, 0);
    const hurts = mine.map((row) => row.hurt);
    return [
      {
        result,
        chance: weight / (ROLL_OUT_OF / 100),
        hurt: span(hurts),
        falls: span(hurts.map((hurt) => fallenAt(match.party, hurt))),
      },
    ];
  });
}

/** The table a fight effect is rolled against, now: what its run and its preview both read. */
export function fightTable(reader: Reader, built: Built, fight: Effect): FightTable {
  const match = matchOf(reader, built, fight);
  const rows = rowsOf(endsOf(match));
  return { match, rows, outcomes: outcomesOf(match, rows) };
}

/** The row a roll from 1 to 10,000 picks: the first whose running total of weights reaches it. */
export function rowAt(rows: readonly Row[], roll: number): Row {
  let to = 0;
  for (const row of rows) {
    to += row.weight;
    if (roll <= to) return row;
  }
  throw new Error(`A roll of ${roll} past the table: its weights add up to ${to}`);
}
