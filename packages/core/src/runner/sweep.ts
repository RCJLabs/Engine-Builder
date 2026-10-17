/**
 * Seed sweeps (docs/specs/runner.md): one run per seed with the same policy, and a report of how
 * the runs ended, how long they took, what the game's facts read at the end, which beats they
 * reached, and every offer the game refused. Each number with an interval has a 95% one.
 */
import { canonicalJson } from '../canonical.ts';
import type { Domain } from '../logic/types.ts';
import type { Game } from '../sim/game.ts';
import type { FactArgs } from '../sim/module.ts';
import type { GameState, SimContext } from '../sim/types.ts';
import { readFacets, stateHash } from '../stateHash.ts';
import { playRun, type RefusedOffer, type RunEnd, type RunResult } from './play.ts';
import type { Policy } from './policy.ts';
import { type Interval, type NumberSummary, summarize, wilson } from './stats.ts';

/** A fact to read at the end of each run: an id, or an id with arguments and a label. */
export type MetricSpec = string | { readonly fact: string; readonly args?: FactArgs; readonly label?: string };

export interface SweepOptions {
  readonly seeds: readonly string[];
  readonly policy: Policy;
  readonly maxTurns?: number;
  readonly metrics?: readonly MetricSpec[];
}

/** A share of the runs, with its 95% interval. */
export interface Share extends Interval {
  readonly runs: number;
  readonly share: number;
}

export type MetricReport =
  | { readonly label: string; readonly kind: 'number'; readonly summary: NumberSummary | null; readonly none: number }
  | {
      readonly label: string;
      readonly kind: 'values';
      readonly values: readonly (Share & { readonly value: string | number | boolean | null })[];
    };

/** One run as golden files keep it: the hash of the state it reached, and of each slice. */
export interface RunSummary {
  readonly seed: string;
  readonly hash: string;
  readonly facets: Readonly<Record<string, string>>;
  readonly turns: number;
  readonly end: RunEnd;
}

export interface SweepReport {
  readonly runs: number;
  readonly policy: string;
  readonly ends: Readonly<Record<RunEnd, number>>;
  readonly turns: NumberSummary | null;
  readonly metrics: readonly MetricReport[];
  /** Each beat type, with the share of runs that reached it at least once. */
  readonly beats: readonly (Share & { readonly type: string })[];
  /** Offers the game refused, which `options` should never make: the count, and the first ten. */
  readonly refused: { readonly count: number; readonly first: readonly (RefusedOffer & { readonly seed: string })[] };
}

export function sweep(
  game: Game,
  sim: SimContext,
  options: SweepOptions,
): { readonly report: SweepReport; readonly runs: readonly RunSummary[] } {
  const { seeds, policy, maxTurns } = options;
  if (new Set(seeds).size !== seeds.length) throw new RangeError('sweep(): seeds must be distinct');
  const metrics = (options.metrics ?? []).map((spec) => (typeof spec === 'string' ? { fact: spec } : spec));
  const read: unknown[][] = metrics.map(() => []);
  const results: RunResult[] = [];
  const runs: RunSummary[] = [];
  for (const seed of seeds) {
    const result = playRun(game, sim, { seed, policy, ...(maxTurns === undefined ? {} : { maxTurns }) });
    results.push(result);
    runs.push(summaryOf(result));
    for (const [i, m] of metrics.entries()) read[i]?.push(game.fact(result.state, m.fact, m.args, sim));
  }
  const catalog = game.catalog();
  const report: SweepReport = {
    runs: results.length,
    policy: policy.name,
    ends: { ended: 0, stopped: 0, capped: 0, ...count(results.map((r) => r.end)) },
    turns: summarize(results.map((r) => r.turns)),
    metrics: metrics.map((m, i) =>
      metricReport(m.label ?? labelOf(m.fact, m.args), catalog[m.fact]?.domain, read[i] as unknown[]),
    ),
    beats: Object.entries(count(results.flatMap((r) => Object.keys(r.beats))))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([type, n]) => ({ type, ...shareOf(n, results.length) })),
    refused: {
      count: results.reduce((sum, r) => sum + r.refused.length, 0),
      first: results.flatMap((r) => r.refused.map((offer) => ({ seed: r.seed, ...offer }))).slice(0, 10),
    },
  };
  return { report, runs };
}

/** `seed-0` to `seed-(n−1)`, or with another prefix: the seeds a sweep of n runs uses by default. */
export const seedsOf = (count: number, prefix = 'seed'): string[] =>
  Array.from({ length: count }, (_, i) => `${prefix}-${i}`);

function summaryOf(result: RunResult): RunSummary {
  const facets = Object.fromEntries(Object.entries(readFacets(result.state)).map(([key, f]) => [key, f.hash]));
  return {
    seed: result.seed,
    hash: stateHash(result.state as GameState),
    facets,
    turns: result.turns,
    end: result.end,
  };
}

function metricReport(label: string, domain: Domain | undefined, values: readonly unknown[]): MetricReport {
  const numeric = domain
    ? domain.type === 'int' || domain.type === 'number'
    : values.every((v) => typeof v === 'number' || v === undefined || v === null);
  if (numeric) {
    const present = values.filter((v): v is number => typeof v === 'number');
    return { label, kind: 'number', summary: summarize(present), none: values.length - present.length };
  }
  // Values as their canonical JSON, so 1 and "1" stay apart; the most common first, then by value.
  const tally = count(values.map((v) => canonicalJson(v ?? null)));
  const rows = Object.entries(tally).sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1));
  return {
    label,
    kind: 'values',
    values: rows.map(([key, n]) => ({ value: JSON.parse(key), ...shareOf(n, values.length) })),
  };
}

const shareOf = (runs: number, of: number): Share => ({ runs, share: of === 0 ? 0 : runs / of, ...wilson(runs, of) });

function count(items: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item] = (counts[item] ?? 0) + 1;
  return counts;
}

const labelOf = (fact: string, args: FactArgs | undefined) =>
  args === undefined || Object.keys(args).length === 0 ? fact : `${fact}(${canonicalJson(args)})`;
