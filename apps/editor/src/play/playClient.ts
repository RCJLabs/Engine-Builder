/**
 * The page's side of a game in play (M4.1): a copy of the script worker of its own, answers
 * matched to requests, and a worker whose request runs past its time stopped, since a script that
 * loops forever can't be stopped from inside. The next request starts a new worker, and a new
 * game with it.
 */
import type { PlayPageReply, PlayPageRequest } from './protocol.ts';

/** How long compiling and starting may take, and how long one step may. */
export const START_MS = 30_000;
export const STEP_MS = 10_000;

type Request = PlayPageRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

interface WorkerLike {
  onmessage: ((event: MessageEvent<PlayPageReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: PlayPageRequest): void;
  terminate(): void;
}

const startWorker = (): WorkerLike =>
  new Worker(new URL('../scripts/script.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

export interface PlayClient {
  send(request: Request): Promise<PlayPageReply>;
}

export function playClient(start: () => WorkerLike = startWorker): PlayClient {
  let worker: WorkerLike | null = null;
  let next = 0;
  const waiting = new Map<
    number,
    { resolve: (reply: PlayPageReply) => void; reject: (e: Error) => void; timer: number }
  >();
  const stop = (error: Error) => {
    for (const job of waiting.values()) {
      clearTimeout(job.timer);
      job.reject(error);
    }
    waiting.clear();
    worker?.terminate();
    worker = null;
  };
  const connect = (): WorkerLike => {
    const started = start();
    started.onmessage = ({ data }) => {
      const job = waiting.get(data.id);
      if (!job) return;
      waiting.delete(data.id);
      clearTimeout(job.timer);
      job.resolve(data);
    };
    started.onerror = (event) => stop(new Error(`The game stopped: ${event.message || 'its worker failed to start'}`));
    return started;
  };
  return {
    send(request) {
      worker ??= connect();
      const id = next++;
      // Loading a save replays its log, as long as starting can take.
      const ms = request.kind === 'act' ? STEP_MS : START_MS;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => stop(new Error(`The game didn’t answer within ${ms / 1000} seconds: does a script loop forever?`)),
          ms,
        ) as unknown as number;
        waiting.set(id, { resolve, reject, timer });
        worker?.postMessage({ ...request, id } as PlayPageRequest);
      });
    },
  };
}
