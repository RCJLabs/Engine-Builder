/**
 * A project's game (D38): what scripts/game.ts exports, read as `eb sim --game` reads its module.
 * The engine's own modules (logic, flag, sheet) join any the game doesn't name, first, so a
 * project's flags and sheets work whatever its game lists; a game that names one places it. The
 * kits its project lists join next, the same way (M3.3, D41).
 */
import { createGame, engineModules, isRecordId, type MetricSpec, type Module, type Policy } from '@eb/core';
import { kitModules } from '@eb/kits';

export interface ProjectGame {
  readonly modules: readonly Module[];
  readonly start: string;
  readonly policies: readonly Policy[];
  readonly metrics: readonly MetricSpec[];
}

/** E031: the game fails as it runs; E032: game.ts doesn't export what a game needs. */
export interface GameProblem {
  readonly code: 'E031' | 'E032';
  readonly message: string;
  readonly script?: string;
  readonly line?: number;
}

export type GameRead =
  | { readonly ok: true; readonly game: ProjectGame }
  | { readonly ok: false; readonly problem: GameProblem };

// The fields defineModule leaves; createGame checks the rest.
const isModule = (value: unknown): value is Module =>
  typeof value === 'object' && value !== null && typeof (value as Module).id === 'string' && 'init' in value;
const isPolicy = (value: unknown): value is Policy =>
  typeof value === 'object' &&
  value !== null &&
  isRecordId((value as Policy).name) &&
  typeof (value as Policy).choose === 'function';
const isMetric = (value: unknown): value is MetricSpec =>
  typeof value === 'string' ||
  (typeof value === 'object' && value !== null && typeof (value as { fact?: unknown }).fact === 'string');

const shapeProblem = (what: string): GameRead => ({
  ok: false,
  problem: { code: 'E032', message: `scripts/game.ts must export ${what}`, script: 'game' },
});

/** The game in game.ts's exports, the engine's modules and the kits' joined, checked by making it once. */
export function readGame(exports: Readonly<Record<string, unknown>>, kits: readonly string[] = []): GameRead {
  const { modules, start, policies = [], metrics = [] } = exports;
  if (!Array.isArray(modules) || modules.length === 0 || !modules.every(isModule)) {
    return shapeProblem('modules: a list of modules made by defineModule');
  }
  if (typeof start !== 'string') return shapeProblem('start: the mode a new game starts in');
  if (!Array.isArray(policies) || !policies.every(isPolicy)) {
    return shapeProblem('policies, if any: policies such as weightedPolicy(…)');
  }
  if (!Array.isArray(metrics) || !metrics.every(isMetric)) {
    return shapeProblem('metrics, if any: fact ids, or { fact, args, label }');
  }
  const kitted = kitModules(kits);
  const clash = modules.find((m) => kitted.some((kit) => kit.id === m.id && kit !== m));
  if (clash) {
    const message = `Its module "${clash.id}" has the id of the ${clash.id} kit, which project.json lists: name it otherwise`;
    return { ok: false, problem: { code: 'E031', message, script: 'game' } };
  }
  const named = new Set(modules.map((m) => m.id));
  const all = [...[...engineModules, ...kitted].filter((m) => !named.has(m.id)), ...modules];
  try {
    createGame({ modules: all, start });
  } catch (error) {
    return {
      ok: false,
      problem: { code: 'E031', message: error instanceof Error ? error.message : String(error), script: 'game' },
    };
  }
  return { ok: true, game: { modules: all, start, policies, metrics } };
}
