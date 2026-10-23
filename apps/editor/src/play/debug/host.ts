/**
 * The Play worker's debug tools (M4.9, D59, docs/specs/play-in-editor.md): the run in play
 * recorded as the shell's requests are answered, and the panel's own requests: a debug step, a
 * step back or forward, a state kept or restored, a replay on the edited project. A plain object
 * over the session host, so tests drive it in Node with the hut.
 */
import { type Action, debugRun, type GameState, type SaveFile } from '@eb/core';
import {
  type Host,
  type Opened,
  openedReply,
  type Play,
  type PlayReply,
  type PlayRequest,
  resumeFrom,
  resumePlay,
  saveOf,
  type Taken,
} from '@eb/ui/session';
import { lookAt } from './look.ts';
import { replayOn, stepBack, stepForward } from './moves.ts';
import type { DebugReply, DebugRequest } from './protocol.ts';
import { newRecording, type Recording, recorded, refused } from './recording.ts';
import { labelOf, recordingFrom, stepOf } from './steps.ts';

type Failed = Extract<PlayReply, { kind: 'failed' }>;

/** The edition a named state is saved under, apart from the shell's slots (D59). */
export const STATES_EDITION = 'states';

export interface DebugJobs {
  /** Keeps the recording up with what the shell's request did. */
  watch(request: PlayRequest, reply: PlayReply): void;
  answer(request: Exclude<DebugRequest, { kind: 'debug-replay' }>): DebugReply | Failed;
  /** Replay on a pack the project's files compiled to. */
  replay(request: Extract<DebugRequest, { kind: 'debug-replay' }>, pack: unknown): DebugReply | Failed;
  readonly recording: Recording | undefined;
}

const reasonOf = (taken: Taken): string =>
  (taken.beats.find((beat) => beat.type === 'rejected') as { reason?: string } | undefined)?.reason ?? 'refused';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function debugJobs(host: Host): DebugJobs {
  let recording: Recording | undefined;

  const watch = (request: PlayRequest, reply: PlayReply) => {
    const { opened, play } = host;
    // A new pack, or a game that failed or stopped: nothing in play to record.
    if (reply.kind === 'opened' || !opened || !play) {
      recording = undefined;
      return;
    }
    if (request.kind === 'start' && reply.kind === 'started') recording = newRecording(play.state, request.seed);
    if (reply.kind === 'loaded' && reply.ok) recording = recordingFrom(opened, reply.file, play.state);
    if (request.kind !== 'act' || reply.kind !== 'stepped' || !recording) return;
    if (reply.accepted) recording = recorded(recording, stepOf(opened, request.action, play.state, reply.beats));
    else if (reply.beats.length > 0) recording = noteRefused(recording, opened, play.state, request.action, reply);
  };

  const noteRefused = (rec: Recording, opened: Opened, state: GameState, action: Action, taken: Taken) =>
    refused(rec, {
      label: labelOf(opened, state, action),
      reason: reasonOf(taken),
      debug: action.type === 'debug/run',
    });

  /** The game in play, its pack, where it is saved, and its recording; or why there is none. */
  function current(id: number) {
    const { opened, play, saving } = host;
    if (!opened || !play || !saving || !recording) {
      const failed: Failed = { id, kind: 'failed', message: 'No game is in play' };
      return { ok: false as const, failed };
    }
    return { ok: true as const, opened, play, saving, recording };
  }

  /** The game moved: put in play, recorded, and a save of it for the shell's slot. */
  function moved(id: number, opened: Opened, play: Play, next: Recording, at: number): DebugReply {
    host.put(opened, play);
    recording = next;
    const save: SaveFile = saveOf(opened, play, host.saving ?? { edition: 'playtest' }, at);
    return { id, kind: 'debug-moved', look: lookAt(opened, play.state, next), view: play.view, save };
  }

  const refusedReply = (id: number, opened: Opened, state: GameState, reason: string): DebugReply => {
    recording = recording ?? newRecording(state);
    return { id, kind: 'debug-refused', look: lookAt(opened, state, recording), reason };
  };

  function run(request: Extract<DebugRequest, { kind: 'debug-run' }>): DebugReply | Failed {
    const now = current(request.id);
    if (!now.ok) return now.failed;
    const { opened, play } = now;
    const action = debugRun(request.effects);
    let taken: Taken;
    try {
      taken = play.take(action);
    } catch (error) {
      // An effect the game doesn't have, or a script that throws: reduce changed nothing.
      recording = refused(now.recording, {
        label: labelOf(opened, play.state, action),
        reason: message(error),
        debug: true,
      });
      return refusedReply(request.id, opened, play.state, message(error));
    }
    if (!taken.accepted) {
      recording = noteRefused(now.recording, opened, play.state, action, taken);
      return refusedReply(request.id, opened, play.state, reasonOf(taken));
    }
    const next = recorded(now.recording, stepOf(opened, action, play.state, taken.beats));
    return moved(request.id, opened, play, next, request.at);
  }

  function answer(request: Exclude<DebugRequest, { kind: 'debug-replay' }>): DebugReply | Failed {
    const { id } = request;
    if (request.kind === 'debug-run') return run(request);
    const now = current(id);
    if (!now.ok) return now.failed;
    const { opened, play } = now;
    switch (request.kind) {
      case 'debug-look':
        return { id, kind: 'debug-looked', look: lookAt(opened, play.state, now.recording) };
      case 'debug-preview': {
        const { game, sim } = opened.setup;
        return { id, kind: 'debug-previewed', previews: game.preview(play.state, request.effects, sim) };
      }
      case 'debug-keep':
        return { id, kind: 'debug-kept', save: saveOf(opened, play, { edition: STATES_EDITION }, request.at) };
      case 'debug-back': {
        const back = stepBack(opened, now.recording);
        if (!back.ok) return refusedReply(id, opened, play.state, back.reason);
        return moved(id, opened, resumePlay(opened.setup, back.state), back.recording, request.at);
      }
      case 'debug-forward': {
        const forward = stepForward(opened, play, now.recording);
        if (!forward.ok) {
          recording = forward.recording;
          return refusedReply(id, opened, play.state, forward.reason);
        }
        return moved(id, opened, play, forward.recording, request.at);
      }
      case 'debug-restore': {
        const resumed = resumeFrom(opened, request.raw);
        if (!resumed.ok) return refusedReply(id, opened, play.state, resumed.message);
        const next = recordingFrom(opened, resumed.file, resumed.play.state);
        return moved(id, opened, resumed.play, next, request.at);
      }
    }
  }

  function replay(request: Extract<DebugRequest, { kind: 'debug-replay' }>, pack: unknown): DebugReply | Failed {
    const now = current(request.id);
    if (!now.ok) return now.failed;
    const done = replayOn(now.opened, now.recording, pack);
    if (!done.ok) return { id: request.id, kind: 'failed', message: done.message };
    const play = resumePlay(done.opened.setup, done.state);
    const reply = moved(request.id, done.opened, play, done.recording, request.at);
    if (reply.kind !== 'debug-moved') return reply;
    const opened = openedReply(request.id, done.opened);
    return { ...reply, kind: 'debug-replayed', report: done.report, opened };
  }

  return {
    watch,
    answer(request) {
      try {
        return answer(request);
      } catch (error) {
        // The game in play is the one before the request: the tools say what failed, and it goes on.
        return { id: request.id, kind: 'failed', message: message(error) };
      }
    },
    replay(request, pack) {
      try {
        return replay(request, pack);
      } catch (error) {
        return { id: request.id, kind: 'failed', message: message(error) };
      }
    },
    get recording() {
      return recording;
    },
  };
}
