/**
 * Golden files (docs/specs/runner.md): the state each seed reached in a sweep, by hash, so CI can
 * tell when a change to the engine or the content changes how runs play out. Each run also keeps
 * a hash per top-level slice, so a run that differs names the modules where it differs.
 */
import { isRecordId } from '../records.ts';
import type { RunEnd } from './play.ts';
import type { RunSummary } from './sweep.ts';

export const GOLDEN_FORMAT = 1;

export interface GoldenRun {
  readonly hash: string;
  readonly turns: number;
  readonly end: RunEnd;
  readonly facets: Readonly<Record<string, string>>;
}

export interface Golden {
  readonly format: typeof GOLDEN_FORMAT;
  /** The project id. */
  readonly game: string;
  /** The content pack's hash when the runs were played: a change explains differences. */
  readonly content: string;
  readonly policy: string;
  readonly maxTurns: number;
  /** The stage its runs played with, a walked game's (M6.9): none for a game without spaces. */
  readonly stage?: string;
  /** By seed, in the order played. */
  readonly runs: Readonly<Record<string, GoldenRun>>;
}

export class GoldenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoldenError';
  }
}

export function goldenOf(
  info: {
    readonly game: string;
    readonly content: string;
    readonly policy: string;
    readonly maxTurns: number;
    readonly stage?: string;
  },
  runs: readonly RunSummary[],
): Golden {
  return {
    format: GOLDEN_FORMAT,
    ...info,
    runs: Object.fromEntries(runs.map(({ seed, ...run }) => [seed, run])),
  };
}

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const ENDS: readonly unknown[] = ['ended', 'stopped', 'capped'];

/** A golden file as read from disk, checked; throws GoldenError naming what is wrong. */
export function readGolden(raw: unknown): Golden {
  const fail = (problem: string): never => {
    throw new GoldenError(`Not a golden file: ${problem}`);
  };
  if (!isObject(raw)) return fail('not a JSON object');
  if (raw.format !== GOLDEN_FORMAT) fail(`format ${String(raw.format)}; this engine reads ${GOLDEN_FORMAT}`);
  if (!isRecordId(raw.game)) fail('no game id');
  if (typeof raw.content !== 'string') fail('no content hash');
  if (!isRecordId(raw.policy)) fail('no policy name');
  if (!Number.isSafeInteger(raw.maxTurns) || (raw.maxTurns as number) < 1) fail('no turn cap');
  if (raw.stage !== undefined && !(typeof raw.stage === 'string' && raw.stage.split('+').every(isRecordId))) {
    fail('a stage that is not stage names joined by "+"');
  }
  if (!isObject(raw.runs) || Object.keys(raw.runs).length === 0) fail('no runs');
  for (const [seed, run] of Object.entries(raw.runs as Record<string, unknown>)) {
    const ok =
      isObject(run) &&
      typeof run.hash === 'string' &&
      Number.isSafeInteger(run.turns) &&
      ENDS.includes(run.end) &&
      isObject(run.facets) &&
      Object.values(run.facets).every((hash) => typeof hash === 'string');
    if (!ok) fail(`the run of seed "${seed}" is malformed`);
  }
  return raw as unknown as Golden;
}

/** A seed whose run differs from its golden: what changed, and in which slices. */
export interface GoldenDifference {
  readonly seed: string;
  readonly was: GoldenRun;
  readonly now: GoldenRun;
  /** The top-level keys whose hashes differ, sorted, including ones only one side has. */
  readonly facets: readonly string[];
}

export interface GoldenComparison {
  readonly same: boolean;
  /** The content pack changed since the golden was written, which explains any differences. */
  readonly contentChanged: boolean;
  readonly differences: readonly GoldenDifference[];
}

/**
 * Compares runs played now with a golden file. Both must cover the same seeds with the same
 * policy, cap and stage, which `eb sim` ensures by playing the golden's own settings.
 */
export function compareGolden(golden: Golden, now: Golden): GoldenComparison {
  const seeds = Object.keys(golden.runs);
  const playedSeeds = Object.keys(now.runs);
  const sameSeeds = seeds.length === playedSeeds.length && seeds.every((seed, i) => playedSeeds[i] === seed);
  const same = golden.policy === now.policy && golden.maxTurns === now.maxTurns && golden.game === now.game;
  if (!sameSeeds || !same || golden.stage !== now.stage) {
    throw new GoldenError(
      "compareGolden(): the runs were not played with the golden file's game, seeds, policy, cap and stage",
    );
  }
  const differences: GoldenDifference[] = [];
  for (const seed of seeds) {
    const was = golden.runs[seed] as GoldenRun;
    const run = now.runs[seed] as GoldenRun;
    if (was.hash === run.hash && was.turns === run.turns && was.end === run.end) continue;
    const keys = [...new Set([...Object.keys(was.facets), ...Object.keys(run.facets)])].sort();
    differences.push({ seed, was, now: run, facets: keys.filter((key) => was.facets[key] !== run.facets[key]) });
  }
  return { same: differences.length === 0, contentChanged: golden.content !== now.content, differences };
}
