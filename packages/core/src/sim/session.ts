import type { Game } from './game.ts';
import { cloneJson, freezeJson } from './json.ts';
import type { Action, Beat, GameState, SimContext, Step } from './types.ts';

/**
 * A running game for a stage to drive: it holds the current state, queues beats until the
 * stage drains them, and logs accepted actions. Replaying the log from the state the session
 * began with reaches the same state, so the log plus a snapshot is a save (M1.8).
 */
export interface Session {
  readonly state: GameState;
  /** Accepted actions since the session began, oldest first. Refused ones are not logged. */
  readonly log: readonly Action[];
  dispatch(action: Action): Step;
  /** The beats since the last drain, oldest first. */
  drain(): readonly Beat[];
}

export function createSession(game: Game, sim: SimContext, start: GameState): Session {
  let state = start;
  const log: Action[] = [];
  let queue: Beat[] = [];
  return {
    get state() {
      return state;
    },
    get log() {
      return log;
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
