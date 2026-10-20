/**
 * The worker's side of a play (protocol.ts): one pack open at a time, one game of it in play,
 * opened, started or loaded and stepped by the page's requests. A plain function of the requests,
 * so a test drives it without a worker.
 */
import { type Opened, openPack, resumeFrom } from './fromPack.ts';
import { type Play, startPlay } from './play.ts';
import type { PlayReply, PlayRequest } from './protocol.ts';
import { type Saving, saveOf } from './saving.ts';

export function playHost(): (request: PlayRequest) => PlayReply {
  let opened: Opened | undefined;
  let play: Play | undefined;
  let saving: Saving | undefined;
  const answer = (request: PlayRequest): PlayReply => {
    const { id } = request;
    if (request.kind === 'open') {
      opened = undefined;
      play = undefined;
      const result = openPack(request.pack);
      if (!result.ok) return { id, kind: 'failed', message: result.message };
      opened = result.opened;
      const { pack, screens, theme, shell, name } = opened;
      return { id, kind: 'opened', name, game: pack.project.id, build: pack.hash, screens, theme, shell };
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
    const step = play.act(request.action);
    const save = step.accepted ? saveOf(opened, play, saving, request.at) : undefined;
    return { id, kind: 'stepped', ...step, ...(save ? { save } : {}) };
  };
  return (request) => {
    try {
      return answer(request);
    } catch (error) {
      // A script that throws mid-step: the game can't go on, so the page is told why.
      play = undefined;
      return { id: request.id, kind: 'failed', message: error instanceof Error ? error.message : String(error) };
    }
  };
}
