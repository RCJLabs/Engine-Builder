/**
 * The sim kernel's data (docs/specs/sim.md). State, actions and beats are all JSON, because
 * they go into saves, replay logs and hashes: none of them may hold functions, Maps or NaN.
 */
import type { RecordStore } from '../records.ts';
import type { RngState } from '../rng.ts';

/** A player intent, a tick or a fact from the stage: `type` is "module/verb", and the rest is a flat JSON payload. */
export interface Action {
  readonly type: string;
  readonly [key: string]: unknown;
}

/**
 * What happened, for the stage to show and play: `type` is "module/what", plus ids and numbers.
 * Beats carry no prose, so rewording or translating never touches the sim (landnam's
 * src/sim/beats.ts). They are not saved. "Beat" rather than "event", because events are also
 * a kind of content record.
 */
export interface Beat {
  readonly type: string;
  readonly [key: string]: unknown;
}

/** The beat a refused action gets, and the only beat it gets. `reason` is kebab-case, for the stage to word. */
export interface RejectedBeat extends Beat {
  readonly type: 'rejected';
  readonly action: string;
  readonly reason: string;
}

/** What ctx.attempt returns: whether the work went through, or the refusal that undid it. */
export type Attempt =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string; readonly data: Readonly<Record<string, unknown>> };

/** A change that content asks for by name: `{ "effect": "loot", "table": "salvage" }`. */
export interface Effect {
  readonly effect: string;
  readonly [key: string]: unknown;
}

/** What an effect would do, for the stage to show: `effect` names it, and the rest is JSON from its module. */
export interface EffectPreview {
  readonly effect: string;
  readonly [key: string]: unknown;
}

export interface ModeFrame {
  readonly id: string;
  readonly data?: unknown;
}

export interface KernelState {
  readonly seed: string;
  /** How many actions have been accepted. */
  readonly step: number;
  /** Bottom first, never empty: the last frame is the current mode. */
  readonly modes: readonly ModeFrame[];
  /** Each RNG stream's position by label ("crew/wound"), so draws carry on across actions and saves. */
  readonly streams: { readonly [label: string]: RngState };
  /**
   * The version of each module's slice, so a save says what shape it holds (docs/specs/saves.md).
   * A slice whose module the game no longer has keeps its entry.
   */
  readonly versions: { readonly [module: string]: number };
}

/** The kernel's own state under `kernel`, and each module's slice under its id. */
export interface GameState {
  readonly kernel: KernelState;
  readonly [module: string]: unknown;
}

/** What the sim reads but never saves: the content pack's records. */
export interface SimContext {
  readonly content: RecordStore;
}

export interface Step {
  readonly state: GameState;
  readonly beats: readonly Beat[];
  /**
   * False when the action was refused. The state is then the one passed in, and the only beat
   * is a RejectedBeat. Callers read this flag rather than comparing states: an accepted action
   * can change nothing (landnam's recorder logged 1,973 false refusals that way).
   */
  readonly accepted: boolean;
}

export type DeepReadonly<T> = T extends readonly (infer E)[]
  ? readonly DeepReadonly<E>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
