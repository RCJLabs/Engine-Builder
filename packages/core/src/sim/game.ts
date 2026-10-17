/**
 * The sim kernel: `reduce(state, action, sim) → { state, beats, accepted }` over the modules a
 * game is made of (docs/specs/sim.md). The shape follows chooser-of-the-dead's stepRun, which
 * returns state plus events and answers a wrong-phase action with a rejected event, and
 * landnam's mode stack.
 */
import { canonicalJson } from '../canonical.ts';
import { Rng } from '../rng.ts';
import { freezeJson } from './json.ts';
import type { FactArgs, Module } from './module.ts';
import { buildRegistry, KERNEL } from './registry.ts';
import { Refusal, Transaction } from './transaction.ts';
import type { Action, GameState, ModeFrame, RejectedBeat, SimContext, Step } from './types.ts';

export interface GameDefinition {
  readonly modules: readonly Module[];
  /** The mode a new game starts in, at the bottom of the stack. */
  readonly start: string;
}

export interface Game {
  init(seed: string, sim: SimContext): GameState;
  reduce(state: GameState, action: Action, sim: SimContext): Step;
  /** The action types the current mode allows, sorted: what a bot or a menu can offer. */
  allowedActions(state: GameState): readonly string[];
  fact(state: GameState, id: string, args: FactArgs | undefined, sim: SimContext): unknown;
}

/** An action the game can't take at all: not JSON, not registered. A bug, not a refusal. */
export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionError';
  }
}

export function createGame(definition: GameDefinition): Game {
  const registry = buildRegistry(definition.modules);
  if (!registry.modes.has(definition.start)) throw new Error(`The start mode "${definition.start}" is not registered`);

  const allowedIn = (state: GameState): ReadonlySet<string> => {
    const current = state.kernel.modes[state.kernel.modes.length - 1] as ModeFrame;
    const allowed = registry.modes.get(current.id);
    if (!allowed) throw new Error(`The state is in mode "${current.id}", which this game does not register`);
    return allowed;
  };

  return {
    init(seed, sim) {
      const streams = new Map<string, Rng>();
      const slices: Record<string, unknown> = {};
      for (const module of registry.modules) {
        const rng = (name: string) => {
          const label = `${module.id}/${name}`;
          if (!streams.has(label)) streams.set(label, Rng.create(seed).fork(label));
          return streams.get(label) as Rng;
        };
        const slice = module.init({ content: sim.content, rng });
        freezeJson(slice, `/${module.id}`);
        slices[module.id] = slice;
      }
      const kernel = {
        seed,
        step: 0,
        modes: [{ id: definition.start }],
        streams: Object.fromEntries([...streams].map(([label, rng]) => [label, rng.toState()])),
      };
      freezeJson(kernel, `/${KERNEL}`);
      return Object.freeze({ [KERNEL]: kernel, ...slices }) as GameState;
    },

    reduce(state, action, sim) {
      // A state from init or reduce is frozen already; one read back from a save is checked and frozen once.
      if (!Object.isFrozen(state)) freezeJson(state, '');
      checkAction(action);
      const entry = registry.actions.get(action.type);
      if (!entry) throw new ActionError(`Unknown action "${action.type}"`);
      const mode = (state.kernel.modes[state.kernel.modes.length - 1] as ModeFrame).id;
      if (!allowedIn(state).has(action.type)) return refused(state, action, 'mode', { mode });
      const tx = new Transaction(registry, state, sim);
      try {
        entry.run(tx.context(entry.module), action);
      } catch (error) {
        if (error instanceof Refusal) return refused(state, action, error.reason, error.data);
        throw error;
      }
      return { state: tx.commit(), beats: Object.freeze(tx.beats), accepted: true };
    },

    allowedActions: (state) => [...allowedIn(state)].sort(),

    fact: (state, id, args, sim) => new Transaction(registry, state, sim).fact(id, args),
  };
}

function checkAction(action: Action): void {
  if (typeof action !== 'object' || action === null || typeof action.type !== 'string') {
    throw new ActionError('An action is an object with a string type');
  }
  try {
    canonicalJson(action); // it goes into the replay log, so it must survive a save
  } catch (error) {
    throw new ActionError(`Action "${action.type}" is not JSON: ${(error as Error).message}`);
  }
}

function refused(state: GameState, action: Action, reason: string, data: Readonly<Record<string, unknown>>): Step {
  const beat: RejectedBeat = { ...data, type: 'rejected', action: action.type, reason };
  freezeJson(beat, '(rejected beat)');
  return { state, beats: Object.freeze([beat]), accepted: false };
}
