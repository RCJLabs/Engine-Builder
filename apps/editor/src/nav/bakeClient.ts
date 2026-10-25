/**
 * The page's side of the bake worker (M6.2, D74): it starts the worker on first use, matches each
 * answer to its job, and stops a worker whose job runs past its time; the next job starts another.
 */
import type { NavSolid } from '@eb/compiler';
import type { Ground } from '../walk/physics.ts';
import type { NavLook, NavReply, NavRequest } from './protocol.ts';

/** How long one bake may take, nav.js's start included: a kilometre of terrain is the most. */
export const BAKE_MS = 120_000;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

interface Waiting {
  readonly resolve: (reply: NavReply) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let next = 0;
const waiting = new Map<number, Waiting>();
const NAV_URL = new URL(`${import.meta.env.BASE_URL}runtime/nav.js`, location.href).href;

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
  const started = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' });
  started.onmessage = ({ data }: MessageEvent<NavReply>) => {
    const job = waiting.get(data.id);
    if (!job) return;
    waiting.delete(data.id);
    clearTimeout(job.timer);
    job.resolve(data);
  };
  started.onerror = (event) => stop(new Error(`The bake worker stopped: ${event.message || 'it failed to start'}`));
  return started;
}

function ask(request: DistributiveOmit<NavRequest, 'id' | 'nav'>): Promise<NavReply> {
  worker ??= connect();
  const id = next++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => stop(new Error(`It didn’t finish within ${BAKE_MS / 1000} seconds`)), BAKE_MS);
    waiting.set(id, { resolve, reject, timer });
    worker?.postMessage({ ...request, id, nav: NAV_URL });
  });
}

export interface Baked {
  readonly navmesh: Uint8Array;
  readonly tiled: boolean;
  readonly ms: number;
  readonly triangles: number;
  readonly look: NavLook;
}

/** A space's solids and ground baked. Rejects with why it can't be. */
export async function bakeInWorker(solids: NavSolid[], ground: Ground | null): Promise<Baked> {
  const reply = await ask({ kind: 'bake', solids, ground });
  if (!reply.ok) throw new Error(reply.error);
  if (reply.kind !== 'bake') throw new Error('The bake worker answered another question');
  return reply;
}

/** A navmesh (Recast's export) as triangles to draw. */
export async function lookInWorker(navmesh: Uint8Array): Promise<NavLook> {
  const reply = await ask({ kind: 'look', navmesh });
  if (!reply.ok) throw new Error(reply.error);
  return reply.look;
}
