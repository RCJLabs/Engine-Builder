/**
 * A game's worker for the player page (M4.1): one per game, so a new file ends the last game's
 * worker and whatever it was doing. A worker that dies answers every request still waiting with
 * its error, so the shell shows the crash screen rather than waiting for ever (M4.3).
 */
import type { PlayReply, PlayRequest } from '@eb/ui/session';
import type { ShellRequest } from '@eb/ui/shell';

export interface GameWorker {
  send(request: ShellRequest): Promise<PlayReply>;
  stop(): void;
}

export function gameWorker(): GameWorker {
  const worker = new Worker(new URL('./player.worker.ts', import.meta.url), { type: 'module' });
  let next = 0;
  const waiting = new Map<number, { resolve: (reply: PlayReply) => void; reject: (error: Error) => void }>();
  worker.onmessage = ({ data }: MessageEvent<PlayReply>) => {
    waiting.get(data.id)?.resolve(data);
    waiting.delete(data.id);
  };
  worker.onerror = (event) => {
    event.preventDefault();
    const error = new Error(`The game’s worker stopped: ${event.message || 'no reason given'}`);
    for (const { reject } of waiting.values()) reject(error);
    waiting.clear();
  };
  return {
    send(request) {
      const id = next++;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        worker.postMessage({ ...request, id } as PlayRequest);
      });
    },
    stop: () => worker.terminate(),
  };
}
