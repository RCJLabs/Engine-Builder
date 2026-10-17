/** The page's side of the OPFS worker: it starts the worker on first use and matches each reply to its request. */
import type { SavedFile } from '../editing/journal.ts';
import type { ProjectFile } from './files.ts';
import type { WorkerReply, WorkerRequest } from './opfsProtocol.ts';

export type WriteFiles = (base: readonly string[], files: readonly ProjectFile[]) => Promise<void>;

export interface OpfsWorker {
  /** Files written as they are, for copies into the library. */
  readonly write: WriteFiles;
  /** An edit saved through the journal (journal.ts), all or nothing. */
  save(base: readonly string[], files: readonly SavedFile[]): Promise<void>;
  /** Finishes or drops a save cut short; resolves to how many files it put right. */
  recover(base: readonly string[]): Promise<number>;
}

type Ask = { [K in WorkerRequest['kind']]: Omit<Extract<WorkerRequest, { kind: K }>, 'id'> }[WorkerRequest['kind']];

const startWorker = () => new Worker(new URL('./opfs.worker.ts', import.meta.url), { type: 'module' });

export function opfsWorker(start: () => Worker = startWorker): OpfsWorker {
  let worker: Worker | null = null;
  let next = 0;
  const waiting = new Map<number, { resolve: (recovered: number) => void; reject: (error: Error) => void }>();

  // A worker that fails to load or crashes takes its requests with it; the next one starts a new worker.
  const fail = (error: Error) => {
    for (const pending of waiting.values()) pending.reject(error);
    waiting.clear();
    worker?.terminate();
    worker = null;
  };

  const connect = (): Worker => {
    const started = start();
    started.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      const pending = waiting.get(data.id);
      if (!pending) return;
      waiting.delete(data.id);
      if (data.ok) pending.resolve(data.recovered);
      else pending.reject(new Error(data.error));
    };
    started.onerror = (event) => fail(new Error(`The file writer stopped: ${event.message || 'it failed to start'}`));
    return started;
  };

  const ask = (request: Ask): Promise<number> => {
    worker ??= connect();
    const id = next++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      worker?.postMessage({ ...request, id } as WorkerRequest);
    });
  };

  return {
    write: async (base, files) => void (await ask({ kind: 'write', base, files })),
    save: async (base, files) => void (await ask({ kind: 'save', base, files })),
    recover: (base) => ask({ kind: 'recover', base }),
  };
}
