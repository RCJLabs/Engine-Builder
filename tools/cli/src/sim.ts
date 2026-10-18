/**
 * eb sim: plays a project headless, one run per seed, with a bot (docs/specs/runner.md). It prints
 * what the runs did, with 95% intervals, and writes or checks a golden file of the states they
 * reached.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { compileProject, type ProjectSource } from '@eb/compiler';
import {
  compareGolden,
  createGame,
  createRecordStore,
  eventCatalog,
  factCatalog,
  type Golden,
  type GoldenComparison,
  goldenOf,
  MAX_TURNS,
  randomPolicy,
  readGolden,
  seedsOf,
  sweep,
} from '@eb/core';
import { type GameModule, UsageError } from './modules.ts';
import { formatResult } from './report.ts';
import { formatGolden, formatSweep } from './simReport.ts';

export interface SimFlags {
  readonly policy?: string;
  readonly seeds?: string;
  readonly prefix?: string;
  readonly 'max-turns'?: string;
  readonly golden?: string;
  readonly update?: boolean;
  readonly json?: boolean;
}

/** 0 when the runs are fine, 1 when the content has errors, an offer was refused or a golden differs. */
export async function runSim(source: ProjectSource, loaded: GameModule, flags: SimFlags): Promise<number> {
  if (flags.update && !flags.golden) throw new UsageError('--update needs --golden <file>');
  // The game's modules are all it has, so content may name no other fact or event.
  const compiled = await compileProject(source, loaded.recordTypes, {
    facts: factCatalog(loaded.modules),
    events: eventCatalog(loaded.modules),
    ...(loaded.effects ? { effects: loaded.effects } : {}),
    ...(loaded.effectNames ? { effectNames: loaded.effectNames } : {}),
  });
  if (!compiled.pack) {
    for (const line of formatResult(compiled, false)) console.log(line);
    return 1;
  }
  const { pack } = compiled;
  const golden = flags.golden === undefined ? undefined : await readGoldenFile(flags.golden);
  const settings = settingsOf(flags, golden, pack.project.id);
  const policies = new Map([randomPolicy, ...loaded.policies].map((p) => [p.name, p]));
  const policy = policies.get(settings.policy);
  if (!policy) throw new UsageError(`No policy "${settings.policy}": this game has ${[...policies.keys()].join(', ')}`);
  const game = createGame({ modules: loaded.modules, start: loaded.start });
  const sim = { content: createRecordStore(pack.records) };
  const { maxTurns } = settings;
  const { report, runs } = sweep(game, sim, { seeds: settings.seeds, policy, maxTurns, metrics: loaded.metrics });
  const now = goldenOf({ game: pack.project.id, content: pack.hash, policy: policy.name, maxTurns }, runs);
  let comparison: GoldenComparison | 'wrote' | undefined;
  if (flags.golden && flags.update) {
    await mkdir(dirname(resolve(flags.golden)), { recursive: true });
    await writeFile(flags.golden, `${JSON.stringify(now, null, 2)}\n`);
    comparison = 'wrote';
  } else if (flags.golden && golden) {
    comparison = compareGolden(golden, now);
  }
  const ok = report.refused.count === 0 && (comparison === undefined || comparison === 'wrote' || comparison.same);
  if (flags.json) {
    const goldenOut =
      flags.golden === undefined
        ? null
        : { file: flags.golden, ...(comparison === 'wrote' ? { wrote: true } : comparison) };
    console.log(
      JSON.stringify(
        { ok, project: pack.project.id, content: pack.hash, maxTurns, report, golden: goldenOut },
        null,
        2,
      ),
    );
  } else {
    for (const line of formatSweep(pack.project.id, report, maxTurns)) console.log(line);
    if (flags.golden && comparison)
      for (const line of formatGolden(flags.golden, runs.length, comparison)) console.log(line);
  }
  return ok ? 0 : 1;
}

async function readGoldenFile(path: string): Promise<Golden | undefined> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
  try {
    return readGolden(JSON.parse(text));
  } catch (error) {
    throw new UsageError(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

interface Settings {
  readonly seeds: readonly string[];
  readonly policy: string;
  readonly maxTurns: number;
}

// Checking a golden file plays its own seeds, policy and cap. A fresh sweep or an update takes
// the flags, then the golden file being updated, then the defaults.
function settingsOf(flags: SimFlags, golden: Golden | undefined, project: string): Settings {
  const seedsGiven = flags.seeds !== undefined || flags.prefix !== undefined;
  if (flags.golden && !flags.update) {
    if (!golden) throw new UsageError(`${flags.golden} doesn't exist yet: run with --update to write it`);
    if (seedsGiven || flags.policy !== undefined || flags['max-turns'] !== undefined) {
      throw new UsageError('A golden file sets the seeds, policy and turn cap: give them only with --update');
    }
  }
  if (golden && golden.game !== project) {
    throw new UsageError(`${flags.golden} holds runs of "${golden.game}", not "${project}"`);
  }
  const keep = golden && !seedsGiven ? Object.keys(golden.runs) : undefined;
  return {
    seeds: keep ?? seedsOf(whole(flags.seeds ?? '100', '--seeds', 1_000_000), flags.prefix ?? 'seed'),
    policy: flags.policy ?? golden?.policy ?? 'random',
    maxTurns:
      flags['max-turns'] === undefined
        ? (golden?.maxTurns ?? MAX_TURNS)
        : whole(flags['max-turns'], '--max-turns', 1e9),
  };
}

function whole(text: string, flag: string, most: number): number {
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < 1 || n > most)
    throw new UsageError(`${flag} takes a whole number from 1 to ${most}`);
  return n;
}
