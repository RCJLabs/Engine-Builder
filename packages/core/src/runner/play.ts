/**
 * One headless run (docs/specs/runner.md): a new game from a seed, played by a policy through
 * `game.options` and `reduce` until nothing is offered, the policy stops, or the turn cap.
 */
import { Rng } from '../rng.ts';
import type { Game } from '../sim/game.ts';
import type { Action, GameState, RejectedBeat, SimContext } from '../sim/types.ts';
import { type Policy, turnFor } from './policy.ts';

/** Turns a run may take by default before it is cut off. */
export const MAX_TURNS = 1000;

export interface RunOptions {
  readonly seed: string;
  readonly policy: Policy;
  /**
   * Turns before the run is cut off, MAX_TURNS by default. A game or a policy that never ends is
   * then a finding in the report rather than a hang.
   */
  readonly maxTurns?: number;
}

/** Why a run stopped: nothing offered, the policy stopped, or the turn cap. */
export type RunEnd = 'ended' | 'stopped' | 'capped';

/** An action the game offered and then refused: a bug in that action's options. */
export interface RefusedOffer {
  readonly turn: number;
  readonly action: Action;
  readonly reason: string;
}

export interface RunResult {
  readonly seed: string;
  readonly state: GameState;
  /** Choices the policy made, accepted or not. */
  readonly turns: number;
  readonly end: RunEnd;
  readonly refused: readonly RefusedOffer[];
  /** How many beats of each type the run produced. */
  readonly beats: Readonly<Record<string, number>>;
  /** The accepted actions, oldest first: replayed from a new game of the seed, they reach `state`. */
  readonly log: readonly Action[];
}

export function playRun(game: Game, sim: SimContext, options: RunOptions): RunResult {
  const { seed, policy } = options;
  const maxTurns = options.maxTurns ?? MAX_TURNS;
  if (!Number.isSafeInteger(maxTurns) || maxTurns < 1)
    throw new RangeError('playRun(): maxTurns is a whole number, at least 1');
  // Its own labelled stream: module streams are always "module/name", so no module can draw it.
  const rng = Rng.create(seed).fork('bot');
  let state = game.init(seed, sim);
  const refused: RefusedOffer[] = [];
  const beats: Record<string, number> = {};
  const log: Action[] = [];
  const finish = (turns: number, end: RunEnd): RunResult => ({ seed, state, turns, end, refused, beats, log });
  for (let turn = 0; turn < maxTurns; turn++) {
    const view = turnFor(game, sim, state, rng, turn);
    const offered = view.options;
    if (offered.length === 0) return finish(turn, 'ended');
    const action = policy.choose(view);
    if (action === null) return finish(turn, 'stopped');
    // An action from anywhere but the options would test a move no player can make.
    if (!offered.includes(action)) throw new Error(`Policy "${policy.name}" chose an action it was not offered`);
    const step = game.reduce(state, action, sim);
    for (const beat of step.beats) beats[beat.type] = (beats[beat.type] ?? 0) + 1;
    if (step.accepted) {
      state = step.state;
      log.push(action);
    } else {
      refused.push({ turn, action, reason: (step.beats[0] as RejectedBeat).reason });
    }
  }
  return finish(maxTurns, 'capped');
}
