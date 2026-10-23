/**
 * The recording walked (M4.9, docs/specs/play-in-editor.md#step-back-and-forward, #replay): a step
 * back is the run played again from its start, never an undo; a step forward takes the next
 * recorded step again; Replay plays the recording on the edited project's pack.
 */
import { type GameState, MigrationError, replayRecording, stateHash } from '@eb/core';
import { type Opened, openPack, type Play } from '@eb/ui/session';
import type { ReplayReport } from './protocol.ts';
import { movedTo, type Recording, refused, steppedForward } from './recording.ts';
import { beatText, stepOf } from './steps.ts';

/**
 * The state after `to` steps, played again from the recording's start, each step held to its hash.
 * A step that reaches another state the second time means a script reads what it mustn't.
 */
export function playTo(opened: Opened, recording: Recording, to: number): GameState {
  const { game, sim } = opened.setup;
  let state = recording.start;
  for (const [i, step] of recording.steps.slice(0, to).entries()) {
    const taken = game.reduce(state, step.action, sim);
    if (!taken.accepted || stateHash(taken.state) !== step.hash) {
      throw new Error(
        `This game doesn’t play the same twice: step ${i + 1} (${step.label}) reached another state. Does a script read something other than the game’s state?`,
      );
    }
    state = taken.state;
  }
  return state;
}

export type Back = { ok: true; state: GameState; recording: Recording } | { ok: false; reason: string };

export function stepBack(opened: Opened, recording: Recording): Back {
  if (recording.cursor === 0) return { ok: false, reason: 'There is no step before this one in the recording' };
  const to = recording.cursor - 1;
  return { ok: true, state: playTo(opened, recording, to), recording: movedTo(recording, to) };
}

export type Forward = { ok: true; recording: Recording } | { ok: false; reason: string; recording: Recording };

/** The next recorded step taken by the game in play. Refused now (after a replay), the cursor stays. */
export function stepForward(opened: Opened, play: Play, recording: Recording): Forward {
  const step = recording.steps[recording.cursor];
  if (!step) return { ok: false, reason: 'There is no step ahead in the recording', recording };
  const note = (reason: string) => refused(recording, { label: step.label, reason, debug: step.debug });
  let taken: ReturnType<Play['take']>;
  try {
    taken = play.take(step.action);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason, recording: note(reason) };
  }
  if (!taken.accepted) {
    const reason = (taken.beats[0] as { reason?: string } | undefined)?.reason ?? 'refused';
    return { ok: false, reason, recording: note(reason) };
  }
  return { ok: true, recording: steppedForward(recording, stepOf(opened, step.action, play.state, taken.beats)) };
}

export type Replayed =
  | { ok: true; opened: Opened; state: GameState; recording: Recording; report: ReplayReport }
  | { ok: false; message: string };

/**
 * The recording, to its cursor, played on the edited project's pack. The new game goes on from
 * where Replay stopped; the steps past that stay ahead, with their old hashes, for Step forward.
 */
export function replayOn(was: Opened, recording: Recording, pack: unknown): Replayed {
  const result = openPack(pack, { debug: true });
  if (!result.ok) return { ok: false, message: result.message };
  const { opened } = result;
  const { game, sim } = opened.setup;
  let start: GameState;
  try {
    start = recording.seed !== undefined ? game.init(recording.seed, sim) : game.migrate(recording.start, sim).state;
  } catch (error) {
    if (!(error instanceof MigrationError)) throw error;
    return { ok: false, message: `The edited game can’t read the state this run started from: ${error.message}` };
  }
  const steps = recording.steps.slice(0, recording.cursor);
  const replay = replayRecording({
    game,
    sim,
    start,
    startHash: recording.startHash,
    steps,
    was: (at) => playTo(was, recording, at),
  });
  const { stop } = replay;
  const cursor = stop === undefined ? steps.length : stop.why === 'refused' ? stop.at - 1 : stop.at;
  const again = replay.hashes.map((hash, i) => ({
    ...(steps[i] as Recording['steps'][number]),
    hash,
    beats: (replay.beats[i] ?? []).map(beatText),
  }));
  const next: Recording = {
    ...recording,
    start,
    startHash: stateHash(start),
    steps: [...again, ...recording.steps.slice(again.length)],
    cursor,
    refusals: recording.refusals.filter((refusal) => refusal.after <= cursor),
  };
  const labelAt = (at: number) => (at === 0 ? 'The start' : (steps[at - 1]?.label ?? `Step ${at}`));
  const report: ReplayReport =
    stop === undefined
      ? { kind: 'same', steps: steps.length }
      : stop.why === 'refused'
        ? { kind: 'refused', at: stop.at, label: labelAt(stop.at), reason: stop.reason }
        : { kind: 'differs', at: stop.at, label: labelAt(stop.at), place: stop.place };
  return { ok: true, opened, state: replay.state, recording: next, report };
}
