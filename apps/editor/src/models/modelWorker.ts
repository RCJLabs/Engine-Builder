/**
 * The page's side of the model worker (M5.5, D67): it starts the worker on first use, matches each
 * answer to its job, and stops a worker whose job runs past its time; the next job starts another.
 */
import type { ColliderShape, ModelCollider } from '@eb/schema';
import type { ModelReply, ModelRequest, Packed, PickedFile } from './protocol.ts';

/** How long packing one model may take, the worker's and Draco's start included. */
export const PACK_MS = 120_000;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

interface Waiting {
  readonly resolve: (reply: ModelReply) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let next = 0;
const waiting = new Map<number, Waiting>();

function stop(error: Error): void {
  for (const job of waiting.values()) {
    clearTimeout(job.timer);
    job.reject(error);
  }
  waiting.clear();
  worker?.terminate();
  worker = null;
}

function connect(): Worker {
  const started = new Worker(new URL('./model.worker.ts', import.meta.url), { type: 'module' });
  started.onmessage = ({ data }: MessageEvent<ModelReply>) => {
    const job = waiting.get(data.id);
    if (!job) return;
    waiting.delete(data.id);
    clearTimeout(job.timer);
    job.resolve(data);
  };
  started.onerror = (event) => stop(new Error(`The model worker stopped: ${event.message || 'it failed to start'}`));
  return started;
}

/** A job sent off, its answer or why there is none. */
function ask(request: DistributiveOmit<ModelRequest, 'id'>): Promise<ModelReply> {
  worker ??= connect();
  const id = next++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => stop(new Error(`It didn’t finish within ${PACK_MS / 1000} seconds`)), PACK_MS);
    waiting.set(id, { resolve, reject, timer });
    worker?.postMessage({ ...request, id });
  });
}

/** A model packed as import brings it in. Rejects with why it can't be. */
export async function packInWorker(main: PickedFile, beside: readonly PickedFile[]): Promise<Packed> {
  const reply = await ask({ kind: 'pack', main, beside });
  if (!reply.ok) throw new Error(reply.error);
  if (!('packed' in reply)) throw new Error('The model worker answered another question');
  return reply.packed;
}

/** A collider of `shape` fitted to a model's file, a .gltf's files beside it. */
export async function fitInWorker(
  main: PickedFile,
  beside: readonly PickedFile[],
  shape: ColliderShape,
): Promise<ModelCollider> {
  const reply = await ask({ kind: 'fit', main, beside, shape });
  if (!reply.ok) throw new Error(reply.error);
  if (!('collider' in reply)) throw new Error('The model worker answered another question');
  return reply.collider;
}
