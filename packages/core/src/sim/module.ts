/**
 * Modules: the pieces a game is built from (docs/specs/sim.md). Each owns one slice of state
 * and registers the actions, facts, effects and modes that work on it. A module changes only
 * its own slice; it reads other modules through their facts and changes them through their
 * effects, so kits combine without knowing each other's insides.
 */
import type { Condition, FactInfo, Truth } from '../logic/types.ts';
import type { RecordStore } from '../records.ts';
import type { Rng } from '../rng.ts';
import type { Action, Attempt, DeepReadonly, Effect, EffectPreview, ModeFrame } from './types.ts';

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
  /** A condition's truth, read through this action's changes so far. */
  check(condition: Condition): Truth;
  apply(effect: Effect): void;
  /**
   * Runs `work`. If anything in it refuses, all of it is undone (its changes, draws, beats and
   * mode changes) and the refusal comes back here instead of refusing the action. Undoing
   * means running the action again from the start with this attempt skipped, so the work must
   * be the same each time it runs, and handlers must not catch what ctx calls throw.
   */
  attempt(work: () => void): Attempt;
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

/** What an effect's preview can reach. It reads and never draws, so a preview changes nothing. */
export interface PreviewContext<S> {
  readonly module: string;
  readonly content: RecordStore;
  read(): DeepReadonly<S>;
  fact(id: string, args?: FactArgs): unknown;
  check(condition: Condition): Truth;
  /** Another effect's preview, for an effect that holds effects. */
  preview(effect: Effect): EffectPreview;
}

export type FactRead<S> = (view: FactView<S>, args: FactArgs) => unknown;

/** A fact, with what conditions need to know about it: its arguments, its values and its wording. */
export interface FactSpec<S> extends FactInfo {
  readonly read: FactRead<S>;
}

export type EffectRun<S> = (ctx: ModuleContext<S>, effect: Effect) => void;

export interface EffectSpec<S> {
  readonly run: EffectRun<S>;
  /**
   * What the effect would do now, for the stage to show before the player commits, as JSON
   * fields that join `effect`. Without one, the preview is the effect as written.
   */
  readonly preview?: (ctx: PreviewContext<S>, effect: Effect) => Readonly<Record<string, unknown>>;
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
  /**
   * Registered as "id.name". They read; they never change anything. A fact with a domain must
   * answer with one of its values, or undefined (or null) for no value: the kernel checks.
   */
  readonly facts?: Readonly<Record<string, FactRead<S> | FactSpec<S>>>;
  /** Registered by bare name, unique across the game, because content names them: `{ "effect": "loot" }`. */
  readonly effects?: Readonly<Record<string, EffectRun<S> | EffectSpec<S>>>;
  readonly modes?: Readonly<Record<string, ModeDef>>;
}

/** A module ready for createGame. Its slice type is checked by defineModule and then erased. */
export type Module = ModuleDef<unknown>;

export const defineModule = <S>(def: ModuleDef<S>): Module => def as unknown as Module;
