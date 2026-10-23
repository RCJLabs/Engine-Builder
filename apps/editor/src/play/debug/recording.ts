/**
 * The run in play, recorded from its start (M4.9, D59, docs/specs/play-in-editor.md#the-recording):
 * the start state, each accepted step with the state's hash after it and what the log shows of it,
 * and a cursor where the game stands. A plain object, so the debug host's tests read it in Node.
 * Capped as Landnam's record.ts is: past the cap, play goes on and nothing more is kept.
 */
import type { Action, GameState, RecordedStep } from '@eb/core';
import { stateHash } from '@eb/core';

export const MAX_RECORDED = 10_000;

/** What the log shows of a step. */
export interface StepShown {
  readonly label: string;
  /** Its beats in words: "hut/carried", "economy/changed resource=coins by=-3". */
  readonly beats: readonly string[];
  readonly debug: boolean;
}

export interface Recorded extends RecordedStep, StepShown {}

/** A step the game refused: noted where it was tried, never recorded. */
export interface Refusal {
  /** The steps taken when it was tried. */
  readonly after: number;
  readonly label: string;
  readonly reason: string;
  readonly debug: boolean;
}

export interface Recording {
  /** The seed a new game started from; none for one loaded from a save or a state. */
  readonly seed: string | undefined;
  readonly start: GameState;
  readonly startHash: string;
  readonly steps: readonly Recorded[];
  /** Steps taken: the game stands after steps[cursor - 1]. */
  readonly cursor: number;
  readonly refusals: readonly Refusal[];
  /** The cap was reached: steps after it are played but not kept. */
  readonly full: boolean;
}

export const newRecording = (start: GameState, seed?: string): Recording => ({
  seed,
  start,
  startHash: stateHash(start),
  steps: [],
  cursor: 0,
  refusals: [],
  full: false,
});

/**
 * A step taken where the cursor is. Taken mid-run, it drops the steps ahead first, as an edit after
 * undo drops the redo, and the refusals noted past it. Once full, nothing more is kept.
 */
export function recorded(recording: Recording, step: Recorded): Recording {
  const { cursor } = recording;
  if (recording.full) return recording;
  if (cursor >= MAX_RECORDED) return { ...recording, full: true };
  return {
    ...recording,
    steps: [...recording.steps.slice(0, cursor), step],
    refusals: recording.refusals.filter((refusal) => refusal.after <= cursor),
    cursor: cursor + 1,
  };
}

export const refused = (recording: Recording, refusal: Omit<Refusal, 'after'>): Recording => ({
  ...recording,
  refusals: [...recording.refusals, { ...refusal, after: recording.cursor }],
});

/** The cursor moved along what is recorded: a step back, a step forward, a replay's stop. */
export function movedTo(recording: Recording, cursor: number): Recording {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > recording.steps.length) {
    throw new RangeError(`The recording has no step ${cursor}`);
  }
  return { ...recording, cursor };
}

/** The step ahead of the cursor taken again, as it played this time: the steps after it stay ahead. */
export function steppedForward(recording: Recording, step: Recorded): Recording {
  const { cursor, steps } = recording;
  if (cursor >= steps.length) throw new RangeError('There is no step ahead of the cursor');
  return { ...recording, steps: [...steps.slice(0, cursor), step, ...steps.slice(cursor + 1)], cursor: cursor + 1 };
}

/** The recording's steps from its start to the cursor, as actions: what a replay takes. */
export const actionsTo = (recording: Recording, cursor = recording.cursor): readonly Action[] =>
  recording.steps.slice(0, cursor).map((step) => step.action);
