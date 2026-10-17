import type { Game } from './game.ts';
import { cloneJson, freezeJson } from './json.ts';
import type { Action, Beat, GameState, SimContext, Step } from './types.ts';

/**
 * A running game for a stage to drive: it holds the current state, queues beats until the
 * stage drains them, and logs accepted actions. Replaying the log from `start` reaches `state`,
 * so the two are a save (createSaveFile, docs/specs/saves.md).
 */
export interface Session {
  /** The state the log starts from: where the session began, or its last compaction. */
  readonly start: GameState;
  readonly state: GameState;
  /** Accepted actions since `start`, oldest first. Refused ones are not logged. */
  readonly log: readonly Action[];
  dispatch(action: Action): Step;
  /** The beats since the last drain, oldest first. */
  drain(): readonly Beat[];
  /** Makes the current state the new start and empties the log, so saves stop growing. */
  compact(): void;
}

export function createSession(game: Game, sim: SimContext, from: GameState): Session {
  let start = from;
  let state = from;
  let log: Action[] = [];
  let queue: Beat[] = [];
  return {
    get start() {
      return start;
    },
    get state() {
      return state;
    },
    get log() {
      return log;
    },
    compact() {
      start = state;
      log = [];
    },
    dispatch(action) {
      const step = game.reduce(state, action, sim);
      queue.push(...step.beats);
      if (step.accepted) {
        state = step.state;
        // A copy, so a stage that reuses its action objects can't rewrite history.
        const logged = cloneJson(action);
        freezeJson(logged, '(action)');
        log.push(logged);
      }
      return step;
    },
    drain() {
      const drained = queue;
      queue = [];
      return drained;
    },
  };
}
