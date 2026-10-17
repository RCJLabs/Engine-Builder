/**
 * Modules: the pieces a game is built from (docs/specs/sim.md). Each owns one slice of state
 * and registers the actions, facts, effects and modes that work on it. A module changes only
 * its own slice; it reads other modules through their facts and changes them through their
 * effects, so kits combine without knowing each other's insides.
 */
import type { RecordStore } from '../records.ts';
import type { Rng } from '../rng.ts';
import type { Action, DeepReadonly, Effect, ModeFrame } from './types.ts';

export type FactArgs = Readonly<Record<string, unknown>>;

export interface ModeControl {
  /** Bottom first, never empty. */
  readonly stack: readonly ModeFrame[];
  readonly current: ModeFrame;
  push(id: string, data?: unknown): void;
  /** Throws on the last mode: the stack is never empty. */
  pop(): ModeFrame;
  replace(id: string, data?: unknown): void;
}

/** What an action or effect handler can reach, scoped to the module that registered it. */
export interface ModuleContext<S> {
  readonly module: string;
  /** The step this action becomes if it is accepted. */
  readonly step: number;
  readonly content: RecordStore;
  /** This module's slice, including changes made earlier in this action. */
  read(): DeepReadonly<S>;
  /** This module's slice to change. The first call in an action copies it; the copy replaces the slice only if the action is accepted. */
  write(): S;
  fact(id: string, args?: FactArgs): unknown;
  apply(effect: Effect): void;
  /**
   * The module's stream with this name, labelled "module/name". Draws carry on across actions
   * and saves, and never shift another stream. Handlers take randomness only from here: a stream
   * made anywhere else would fork the replay (landnam's src/sim/swing.ts).
   */
  rng(name: string): Rng;
  /** Adds the beat "module/what", with data. */
  emit(what: string, data?: Readonly<Record<string, unknown>>): void;
  /** Refuses the action: nothing it changed is kept, and the stage gets one rejected beat. */
  refuse(reason: string, data?: Readonly<Record<string, unknown>>): never;
  readonly modes: ModeControl;
}

export interface FactView<S> {
  readonly state: DeepReadonly<S>;
  readonly content: RecordStore;
  fact(id: string, args?: FactArgs): unknown;
}

export interface InitContext {
  readonly content: RecordStore;
  rng(name: string): Rng;
}

export interface ModeDef {
  /** The actions allowed while this mode is current: "crew/rest", "crew/*" for one module's, or "*" for all. */
  readonly actions: readonly string[];
}

export interface ModuleDef<S> {
  /** kebab-case, and the key of the module's slice in the state. */
  readonly id: string;
  /** The slice a new game starts with. */
  init(ctx: InitContext): S;
  /** Registered as "id/verb". */
  readonly actions?: Readonly<Record<string, (ctx: ModuleContext<S>, action: Action) => void>>;
  /** Registered as "id.name". They read; they never change anything. */
  readonly facts?: Readonly<Record<string, (view: FactView<S>, args: FactArgs) => unknown>>;
  /** Registered by bare name, unique across the game, because content names them: `{ "effect": "loot" }`. */
  readonly effects?: Readonly<Record<string, (ctx: ModuleContext<S>, effect: Effect) => void>>;
  readonly modes?: Readonly<Record<string, ModeDef>>;
}

/** A module ready for createGame. Its slice type is checked by defineModule and then erased. */
export type Module = ModuleDef<unknown>;

export const defineModule = <S>(def: ModuleDef<S>): Module => def as unknown as Module;
