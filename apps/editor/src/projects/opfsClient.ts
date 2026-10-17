/** The page's side of the OPFS writer: it starts the worker on first use and matches each reply to its request. */
import type { ProjectFile } from './files.ts';
import type { WriteReply, WriteRequest } from './opfsWrite.ts';

export type WriteFiles = (base: readonly string[], files: readonly ProjectFile[]) => Promise<void>;

const startWorker = () => new Worker(new URL('./opfs.worker.ts', import.meta.url), { type: 'module' });

export function opfsWriter(start: () => Worker = startWorker): WriteFiles {
  let worker: Worker | null = null;
  let next = 0;
  const waiting = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();

  // A worker that fails to load or crashes takes its requests with it; the next write starts a new one.
  const fail = (error: Error) => {
    for (const pending of waiting.values()) pending.reject(error);
    waiting.clear();
    worker?.terminate();
    worker = null;
  };

  const connect = (): Worker => {
    const started = start();
    started.onmessage = ({ data }: MessageEvent<WriteReply>) => {
      const pending = waiting.get(data.id);
      if (!pending) return;
      waiting.delete(data.id);
      if (data.ok) pending.resolve();
      else pending.reject(new Error(data.error));
    };
    started.onerror = (event) => fail(new Error(`The file writer stopped: ${event.message || 'it failed to start'}`));
    return started;
  };

  return (base, files) => {
    worker ??= connect();
    const id = next++;
    const request: WriteRequest = { id, base, files };
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      worker?.postMessage(request);
    });
  };
}
