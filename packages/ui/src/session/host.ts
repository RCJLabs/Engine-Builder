/**
 * The worker's side of a play (protocol.ts): one pack open at a time, one game of it in play,
 * opened, started or loaded and stepped by the page's requests. A plain function of the requests,
 * so a test drives it without a worker.
 */
import { type Opened, openPack, resumeFrom } from './fromPack.ts';
import { type Play, startPlay } from './play.ts';
import type { PlayReply, PlayRequest } from './protocol.ts';
import { type Saving, saveOf } from './saving.ts';

export interface HostOptions {
  /** Opens each pack with the debug step (M4.9, D59): the editor's games, never the player page's. */
  readonly debug?: boolean;
}

/** What the host holds, for the editor's debug tools to read and change (M4.9). */
export interface Host {
  answer(request: PlayRequest): PlayReply;
  readonly opened: Opened | undefined;
  readonly play: Play | undefined;
  readonly saving: Saving | undefined;
  /** Puts another game in play, of this pack or another: a step back, a state restored, a replay. */
  put(opened: Opened, play: Play): void;
}

export function createHost(options: HostOptions = {}): Host {
  let opened: Opened | undefined;
  let play: Play | undefined;
  let saving: Saving | undefined;
  const answer = (request: PlayRequest): PlayReply => {
    const { id } = request;
    if (request.kind === 'open') {
      opened = undefined;
      play = undefined;
      const result = openPack(request.pack, { debug: options.debug === true });
      if (!result.ok) return { id, kind: 'failed', message: result.message };
      opened = result.opened;
      return openedReply(id, opened);
    }
    if (!opened) return { id, kind: 'failed', message: 'No game is open' };
    if (request.kind === 'start') {
      play = startPlay(opened.setup, request.seed);
      saving = request.saving;
      return { id, kind: 'started', view: play.view, save: saveOf(opened, play, saving, request.at) };
    }
    if (request.kind === 'load') {
      play = undefined;
      const resumed = resumeFrom(opened, request.raw);
      if (!resumed.ok) return { id, kind: 'loaded', ...resumed };
      play = resumed.play;
      saving = request.saving;
      return { id, kind: 'loaded', ok: true, view: play.view, file: resumed.file, report: resumed.report };
    }
    if (!play || !saving) return { id, kind: 'failed', message: 'No game has started' };
    if (request.kind === 'look') return { id, kind: 'looked', view: play.look(request.wants) };
    const step = play.act(request.action);
    const save = step.accepted ? saveOf(opened, play, saving, request.at) : undefined;
    return { id, kind: 'stepped', ...step, ...(save ? { save } : {}) };
  };
  return {
    answer(request) {
      try {
        return answer(request);
      } catch (error) {
        // A script that throws mid-step: the game can't go on, so the page is told why.
        play = undefined;
        return { id: request.id, kind: 'failed', message: error instanceof Error ? error.message : String(error) };
      }
    },
    get opened() {
      return opened;
    },
    get play() {
      return play;
    },
    get saving() {
      return saving;
    },
    put(next, game) {
      opened = next;
      play = game;
    },
  };
}

/** What the page is told of a pack opened: its name, game, build, screens, theme, shell and audio. */
export function openedReply(id: number, opened: Opened): Extract<PlayReply, { kind: 'opened' }> {
  const { pack, screens, theme, shell, name, audio } = opened;
  return { id, kind: 'opened', name, game: pack.project.id, build: pack.hash, screens, theme, shell, audio };
}

/** The player page's host: its requests answered, nothing more. */
export function playHost(options: HostOptions = {}): (request: PlayRequest) => PlayReply {
  const host = createHost(options);
  return (request) => host.answer(request);
}
