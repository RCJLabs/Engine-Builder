/**
 * A recorded run played again on another build of its game (M4.9, D59, docs/specs/play-in-editor.md):
 * what an edit changed in a run. It stops at the first step the game refuses, or the first that
 * leaves another state than the one recorded, and says where the two first part. Landnam's
 * src/record.ts and Rule or Drool's replayTo stop at the first refusal; the place comes from the
 * state's facets (M1.2).
 */

import { ActionError, type Game } from '../sim/game.ts';
import { KERNEL } from '../sim/registry.ts';
import type { Action, Beat, GameState, RejectedBeat, SimContext } from '../sim/types.ts';
import { firstDifference, readFacets, stateHash } from '../stateHash.ts';

/** One step of a recording: its action and the state's hash after it. */
export interface RecordedStep {
  readonly action: Action;
  readonly hash: string;
}

/** Where two states first part: a module's slice, the path in it, and the value on each side. */
export interface Place {
  readonly slice: string;
  /** A JSON Pointer inside the slice; empty for the whole slice. */
  readonly path: string;
  readonly was: unknown;
  readonly now: unknown;
  /** The other modules' slices that changed too, sorted: which one the change began in, the author knows. */
  readonly also: readonly string[];
}

export type ReplayStop =
  /** Step `at` (from 1) is refused, or no longer exists: the state is the one before it. */
  | { readonly at: number; readonly why: 'refused'; readonly reason: string }
  /** Step `at` leaves another state, or the start differs (`at` 0): the state is the new one. */
  | { readonly at: number; readonly why: 'differs'; readonly place: Place };

export interface ReplayInput {
  readonly game: Game;
  readonly sim: SimContext;
  /** The new game's start: a new game of the recorded seed, or the recorded start migrated. */
  readonly start: GameState;
  readonly startHash: string;
  readonly steps: readonly RecordedStep[];
  /** The recorded state after `at` steps (0 is the start), for saying where they part. Read once at most. */
  readonly was: (at: number) => GameState;
}

export interface ReplayResult {
  /** Where the replay stopped, or the end. */
  readonly state: GameState;
  /** The new hash of each step taken, a differing step's included. */
  readonly hashes: readonly string[];
  /** Each step's beats, as `hashes` has its hash: what the edited game made of it. */
  readonly beats: readonly (readonly Beat[])[];
  /** Missing when every step played out as recorded. */
  readonly stop?: ReplayStop;
}

export function replayRecording(input: ReplayInput): ReplayResult {
  const { game, sim, steps, was } = input;
  let state = input.start;
  const hashes: string[] = [];
  const beats: (readonly Beat[])[] = [];
  const end = (stop?: ReplayStop): ReplayResult => (stop ? { state, hashes, beats, stop } : { state, hashes, beats });
  if (stateHash(state) !== input.startHash) return end({ at: 0, why: 'differs', place: placeOf(was(0), state) });
  for (const [i, { action, hash }] of steps.entries()) {
    const at = i + 1;
    let step: ReturnType<Game['reduce']>;
    try {
      step = game.reduce(state, action, sim);
    } catch (error) {
      // An action the edited game no longer has: refused, as loadSave skips it.
      if (!(error instanceof ActionError)) throw error;
      return end({ at, why: 'refused', reason: 'unknown-action' });
    }
    if (!step.accepted) {
      const reason = (step.beats[0] as RejectedBeat | undefined)?.reason ?? 'refused';
      return end({ at, why: 'refused', reason });
    }
    state = step.state;
    const now = stateHash(state);
    hashes.push(now);
    beats.push(step.beats);
    if (now !== hash) return end({ at, why: 'differs', place: placeOf(was(at), state) });
  }
  return end();
}

/**
 * The first place two states part. A module's slice before the kernel's: a changed slice moves the
 * kernel's streams and step too, and the slice is the one the author can read.
 */
export function placeOf(was: GameState, now: GameState): Place {
  const before = readFacets(was);
  const after = readFacets(now);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changed = keys.filter((key) => before[key]?.hash !== after[key]?.hash);
  const slice = changed.find((key) => key !== KERNEL) ?? changed[0] ?? KERNEL;
  const difference = firstDifference(was[slice], now[slice]);
  const also = changed.filter((key) => key !== slice && key !== KERNEL);
  return { slice, path: difference?.path ?? '', was: difference?.a, now: difference?.b, also };
}
