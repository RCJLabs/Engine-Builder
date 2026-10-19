/**
 * The worker's side of a play (protocol.ts): one game at a time, started from a pack and stepped by
 * the page's actions. A plain function of the requests, so a test drives it without a worker.
 */
import { playPack } from './fromPack.ts';
import type { Play } from './play.ts';
import type { PlayReply, PlayRequest } from './protocol.ts';

export function playHost(): (request: PlayRequest) => PlayReply {
  let play: Play | undefined;
  return (request) => {
    try {
      if (request.kind === 'start') {
        play = undefined;
        const loaded = playPack(request.pack, request.seed);
        if (!loaded.ok) return { id: request.id, kind: 'failed', message: loaded.message };
        play = loaded.play;
        const { name, screens, theme } = loaded;
        return { id: request.id, kind: 'started', name, screens, theme, view: play.view };
      }
      if (!play) return { id: request.id, kind: 'failed', message: 'No game has started' };
      const step = play.act(request.action);
      return { id: request.id, kind: 'stepped', ...step };
    } catch (error) {
      // A script that throws mid-step: the game can't go on, so the page is told why.
      play = undefined;
      return { id: request.id, kind: 'failed', message: error instanceof Error ? error.message : String(error) };
    }
  };
}
