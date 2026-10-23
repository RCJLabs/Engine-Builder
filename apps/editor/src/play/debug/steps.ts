/**
 * The recording's steps in words, and a recording rebuilt from a save (M4.9): what the debug host
 * keeps of each step it records, as plain functions.
 */
import { type Action, ActionError, type Beat, type Effect, type GameState, type SaveFile, stateHash } from '@eb/core';
import { actionLabel, type Opened } from '@eb/ui/session';
import { newRecording, type Recorded, type Recording, recorded } from './recording.ts';

const valueText = (value: unknown): string =>
  typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);

/** A beat in words: its type, then its data as key=value. */
export function beatText(beat: Beat): string {
  const { type, ...data } = beat;
  const parts = Object.entries(data).map(([key, value]) => `${key}=${valueText(value)}`);
  return [type, ...parts].join(' ');
}

/** An effect in words: its name, then its fields as key=value. */
export function effectWords(effect: Effect): string {
  const { effect: name, ...fields } = effect;
  return [name, ...Object.entries(fields).map(([key, value]) => `${key}=${valueText(value)}`)].join(' ');
}

const isDebug = (action: Action) => action.type === 'debug/run';

/** What the log calls an action: the game's own words for it, or the debug step's effects. */
export function labelOf(opened: Opened, state: GameState, action: Action): string {
  if (isDebug(action)) {
    const effects = Array.isArray(action.effects) ? (action.effects as Effect[]) : [];
    return `Debug: ${effects.map(effectWords).join('; ')}`;
  }
  const { game, sim } = opened.setup;
  return actionLabel(action, game.content(state, sim));
}

/** A step to record: its action, the state after it, and what the log shows. */
export function stepOf(opened: Opened, action: Action, after: GameState, beats: readonly Beat[]): Recorded {
  return {
    action,
    hash: stateHash(after),
    label: labelOf(opened, after, action),
    beats: beats.map(beatText),
    debug: isDebug(action),
  };
}

/**
 * The recording of a game loaded from a save: its snapshot, and its log played again step by step,
 * skipping what loadSave skips. If that doesn't reach the state the load reached, the recording
 * starts where the game stands.
 */
export function recordingFrom(opened: Opened, file: SaveFile, now: GameState): Recording {
  const { game, sim } = opened.setup;
  try {
    let state = game.migrate(file.snapshot, sim).state;
    let recording = newRecording(state);
    for (const action of file.log) {
      let step: ReturnType<typeof game.reduce>;
      try {
        step = game.reduce(state, action, sim);
      } catch (error) {
        if (error instanceof ActionError) continue;
        throw error;
      }
      if (!step.accepted) continue;
      state = step.state;
      recording = recorded(recording, stepOf(opened, action, state, step.beats));
    }
    if (stateHash(state) === stateHash(now)) return recording;
  } catch {
    // A save the game can't play again here: the recording starts where the game stands.
  }
  return newRecording(now);
}
