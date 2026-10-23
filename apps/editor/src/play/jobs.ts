/**
 * The Play worker's jobs (M4.1), as plain functions so tests run them in Node: the project's files
 * compiled with its game, as `eb build` compiles them, into the pack that is played or exported.
 * A pack goes across as JSON, the form a file of it has, so what plays here plays in /play/. Every
 * game opened here has the debug step (M4.9, D59), and the run in play is recorded for the tools.
 */
import { compileWithGame, memorySource } from '@eb/compiler';
import { createHost } from '@eb/ui/session';
import type { SentFile } from '../scripts/protocol.ts';
import { debugJobs } from './debug/host.ts';
import { isDebugRequest } from './debug/protocol.ts';
import type { PlayPageReply, PlayPageRequest } from './protocol.ts';

type Packed =
  | { readonly ok: true; readonly pack: unknown; readonly name: string }
  | Extract<PlayPageReply, { kind: 'refused' }>;

export async function packFiles(id: number, files: readonly SentFile[]): Promise<Packed> {
  const compiled = await compileWithGame(memorySource(Object.fromEntries(files)));
  // A project with any error has no pack.
  if (!compiled.pack)
    return { id, kind: 'refused', errors: compiled.diagnostics.filter((d) => d.severity === 'error') };
  return { ok: true, pack: JSON.parse(JSON.stringify(compiled.pack)), name: compiled.pack.project.id };
}

/** Answers each request in turn; one game at a time. */
export function playJobs(): (request: PlayPageRequest) => Promise<PlayPageReply> {
  const host = createHost({ debug: true });
  const debug = debugJobs(host);
  return async (request) => {
    if (request.kind === 'pack' || request.kind === 'open-files') {
      const packed = await packFiles(request.id, request.files);
      if (!('ok' in packed)) return packed;
      if (request.kind === 'pack') return { id: request.id, kind: 'packed', pack: packed.pack, name: packed.name };
      const open = { id: request.id, kind: 'open', pack: packed.pack } as const;
      const reply = host.answer(open);
      debug.watch(open, reply);
      return reply;
    }
    if (isDebugRequest(request)) {
      if (request.kind !== 'debug-replay') return debug.answer(request);
      const packed = await packFiles(request.id, request.files);
      return 'ok' in packed ? debug.replay(request, packed.pack) : packed;
    }
    const reply = host.answer(request);
    debug.watch(request, reply);
    return reply;
  };
}
