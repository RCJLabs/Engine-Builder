/**
 * The page's side of the script worker (M3.2, D38): it starts the worker on first use, matches
 * each answer to its job, and stops a worker whose job runs past its time, since a script that
 * loops forever can't be stopped from inside. The next job starts a new worker.
 */
import type { CheckResult, PlayResult, ScriptJob, ScriptReply, ScriptRequest, SentFile } from './protocol.ts';

/** How long checking the scripts may take, the worker's start included, before it counts as a loop that never ends. */
export const CHECK_MS = 5_000;
/** How long Run's games may take. */
export const PLAY_MS = 60_000;

/** A job stopped for running past its time. */
export class ScriptTimeout extends Error {
  readonly ms: number;
  constructor(ms: number) {
    super(`It didn’t finish within ${ms / 1000} seconds`);
    this.ms = ms;
  }
}

export interface WorkerLike {
  onmessage: ((event: MessageEvent<ScriptReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: ScriptRequest): void;
  terminate(): void;
}

export interface ScriptWorker {
  check(files: readonly SentFile[], run: boolean): Promise<CheckResult>;
  play(files: readonly SentFile[], seeds: number, policy: string): Promise<PlayResult>;
}

export interface WorkerOptions {
  readonly start?: () => WorkerLike;
  /** Runs `then` after `ms`; returns what cancels it. */
  readonly after?: (then: () => void, ms: number) => () => void;
}

const startWorker = (): WorkerLike =>
  new Worker(new URL('./script.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

const afterTimeout = (then: () => void, ms: number) => {
  const timer = setTimeout(then, ms);
  return () => clearTimeout(timer);
};

interface Waiting {
  readonly resolve: (reply: ScriptReply) => void;
  readonly reject: (error: Error) => void;
  readonly cancel: () => void;
}

export function scriptWorker({ start = startWorker, after = afterTimeout }: WorkerOptions = {}): ScriptWorker {
  let worker: WorkerLike | null = null;
  let next = 0;
  const waiting = new Map<number, Waiting>();

  // Stopping the worker takes every job it holds with it.
  const stop = (error: Error) => {
    for (const job of waiting.values()) {
      job.cancel();
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
      job.cancel();
      job.resolve(data);
    };
    started.onerror = (event) => stop(new Error(`The script worker stopped: ${event.message || 'it failed to start'}`));
    return started;
  };

  const send = (job: ScriptJob, ms: number): Promise<ScriptReply> => {
    worker ??= connect();
    const id = next++;
    return new Promise((resolve, reject) => {
      const cancel = after(() => stop(new ScriptTimeout(ms)), ms);
      waiting.set(id, { resolve, reject, cancel });
      worker?.postMessage({ ...job, id });
    });
  };

  const answer = (reply: ScriptReply): ScriptReply => {
    if (!reply.ok) throw new Error(reply.error);
    return reply;
  };

  return {
    async check(files, run) {
      const reply = answer(await send({ kind: 'check', files, run }, CHECK_MS));
      if (!('check' in reply)) throw new Error('The script worker answered a check with something else');
      return reply.check;
    },
    async play(files, seeds, policy) {
      const reply = answer(await send({ kind: 'play', files, seeds, policy }, PLAY_MS));
      if (!('play' in reply)) throw new Error('The script worker answered Run with something else');
      return reply.play;
    },
  };
}
