/**
 * The sim kernel: `reduce(state, action, sim) → { state, beats, accepted }` over the modules a
 * game is made of (docs/specs/sim.md). The shape follows chooser-of-the-dead's stepRun, which
 * returns state plus events and answers a wrong-phase action with a rejected event, and
 * landnam's mode stack.
 */
import { canonicalJson } from '../canonical.ts';
import type { Condition, FactCatalog, Truth } from '../logic/types.ts';
import type { RecordStore } from '../records.ts';
import { Rng } from '../rng.ts';
import type { EventCatalog } from './events.ts';
import { freezeJson } from './json.ts';
import { withMade } from './made.ts';
import { type MigrationReport, migrateState } from './migrate.ts';
import type { FactArgs, Module } from './module.ts';
import { AttemptRefused, Refusal } from './refusal.ts';
import { type ActionEntry, buildRegistry, catalogOf, eventsOf, KERNEL, type Registry, versionsOf } from './registry.ts';
import { Transaction } from './transaction.ts';
import type { Action, Effect, EffectPreview, GameState, ModeFrame, RejectedBeat, SimContext, Step } from './types.ts';

export interface GameDefinition {
  readonly modules: readonly Module[];
  /** The mode a new game starts in, at the bottom of the stack. */
  readonly start: string;
}

export interface Game {
  init(seed: string, sim: SimContext): GameState;
  reduce(state: GameState, action: Action, sim: SimContext): Step;
  /** The action types the current mode allows, sorted. */
  allowedActions(state: GameState): readonly string[];
  /**
   * Every concrete action the player could take now, from each allowed action's options: what a
   * bot or a menu offers. By type, then in the order each action lists them. Reading only, it
   * changes nothing and draws nothing.
   */
  options(state: GameState, sim: SimContext): readonly Action[];
  fact(state: GameState, id: string, args: FactArgs | undefined, sim: SimContext): unknown;
  /**
   * The records every module reads in this state: the pack's, and those modules have made in play
   * (D44), such as the roster kit's recruits. What the stage names an event's actor from.
   */
  content(state: GameState, sim: SimContext): RecordStore;
  /** Every fact the modules register, by id: what conditions in content are checked against. */
  catalog(): FactCatalog;
  /** Every event the modules declare, by id: what rows' When is checked against. */
  events(): EventCatalog;
  /** A condition's truth in this state, by the same evaluation the sim uses: what a menu shows as open or locked. */
  check(state: GameState, condition: Condition, sim: SimContext): Truth;
  /** What these effects would do in this state, without doing them: chances, costs and outcomes for the stage to show. */
  preview(state: GameState, effects: readonly Effect[], sim: SimContext): readonly EffectPreview[];
  /** A state from an older version of this game, brought up to date. Throws MigrationError when it can't be. */
  migrate(state: unknown, sim: SimContext): { readonly state: GameState; readonly report: MigrationReport };
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
  const catalog = catalogOf(registry);
  const events = eventsOf(registry);

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
        versions: versionsOf(registry),
      };
      freezeJson(kernel, `/${KERNEL}`);
      return startGame(registry, Object.freeze({ [KERNEL]: kernel, ...slices }) as GameState, sim);
    },

    reduce(state, action, sim) {
      // A state from init or reduce is frozen already; one read back from a save is checked and frozen once.
      if (!Object.isFrozen(state)) freezeJson(state, '');
      checkAction(action);
      const entry = registry.actions.get(action.type);
      if (!entry) throw new ActionError(`Unknown action "${action.type}"`);
      const mode = (state.kernel.modes[state.kernel.modes.length - 1] as ModeFrame).id;
      if (!entry.anyMode && !allowedIn(state).has(action.type)) return refused(state, action, 'mode', { mode });
      return runAction(registry, entry, state, action, sim);
    },

    allowedActions: (state) => [...allowedIn(state)].sort(),

    options(state, sim) {
      if (!Object.isFrozen(state)) freezeJson(state, '');
      const tx = new Transaction(registry, state, sim);
      const offered: Action[] = [];
      for (const type of [...allowedIn(state)].sort()) {
        const entry = registry.actions.get(type) as ActionEntry;
        const payloads = entry.options ? entry.options(tx.optionsView(entry.module)) : [{}];
        for (const payload of payloads) offered.push(optionOf(type, payload));
      }
      return Object.freeze(offered);
    },

    fact: (state, id, args, sim) => new Transaction(registry, state, sim).fact(id, args),

    content: (state, sim) => withMade(sim.content, registry.makers, (module) => state[module]),

    catalog: () => catalog,

    events: () => events,

    check: (state, condition, sim) => new Transaction(registry, state, sim).check(condition),

    preview(state, effects, sim) {
      const tx = new Transaction(registry, state, sim);
      return Object.freeze(effects.map((effect) => tx.preview(effect)));
    },

    migrate: (state, sim) => migrateState(registry, state, sim),
  };
}

/** More refused attempts than this in one action means one refuses every time it runs. */
const MAX_REFUSED_ATTEMPTS = 1000;

/**
 * Each module's start, in module order, once every slice exists (M3.6): what a module does as the
 * game begins that init can't, applying effects and raising events as an action's work does.
 * Its draws are kept and its beats dropped, and the state stays at step 0.
 */
function startGame(registry: Registry, state: GameState, sim: SimContext): GameState {
  const starters = registry.modules.filter((module) => module.start !== undefined);
  if (starters.length === 0) return state;
  const skipped = new Map<string, Refusal>();
  for (;;) {
    const tx = new Transaction(registry, state, sim, skipped);
    try {
      for (const module of starters) tx.scope(() => module.start?.(tx.context(module.id)));
      return tx.commit(0);
    } catch (error) {
      if (error instanceof Refusal) throw new Error(`A module's start was refused: ${error.reason}`);
      if (!(error instanceof AttemptRefused)) throw error;
      if (skipped.size >= MAX_REFUSED_ATTEMPTS)
        throw new Error(`More than ${MAX_REFUSED_ATTEMPTS} attempts refused as the game starts`);
      skipped.set(error.id, error.refusal);
    }
  }
}

// A run that ends in a refused attempt starts again from the same state with that attempt
// skipped, so the attempt's work leaves nothing behind (ctx.attempt in docs/specs/sim.md).
function runAction(registry: Registry, entry: ActionEntry, state: GameState, action: Action, sim: SimContext): Step {
  const skipped = new Map<string, Refusal>();
  for (;;) {
    const tx = new Transaction(registry, state, sim, skipped);
    try {
      tx.scope(() => entry.run(tx.context(entry.module), action));
      return { state: tx.commit(), beats: Object.freeze(tx.beats), accepted: true };
    } catch (error) {
      if (error instanceof Refusal) return refused(state, action, error.reason, error.data);
      if (!(error instanceof AttemptRefused)) throw error;
      if (skipped.size >= MAX_REFUSED_ATTEMPTS) {
        throw new Error(`More than ${MAX_REFUSED_ATTEMPTS} attempts refused in one "${action.type}" action`);
      }
      skipped.set(error.id, error.refusal);
    }
  }
}

// An option a module offers is an action like any other, so it must be one a log can hold.
function optionOf(type: string, payload: unknown): Action {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload) || 'type' in payload) {
    throw new ActionError(`"${type}" options must be payload objects without a type of their own`);
  }
  const action = { type, ...payload };
  checkAction(action);
  freezeJson(action, `(option of ${type})`);
  return action;
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
