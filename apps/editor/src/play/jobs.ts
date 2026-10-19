/**
 * The Play worker's jobs (M4.1), as plain functions so tests run them in Node: the project's files
 * compiled with its game, as `eb build` compiles them, into the pack that is played or exported.
 * A pack goes across as JSON, the form a file of it has, so what plays here plays in /play/.
 */
import { compileWithGame, memorySource } from '@eb/compiler';
import { playHost } from '@eb/ui/session';
import type { SentFile } from '../scripts/protocol.ts';
import type { PlayPageReply, PlayPageRequest } from './protocol.ts';

type Packed =
  | { readonly ok: true; readonly pack: unknown; readonly name: string }
  | Extract<PlayPageReply, { kind: 'refused' }>;

export async function packFiles(id: number, files: readonly SentFile[]): Promise<Packed> {
  const compiled = await compileWithGame(memorySource(Object.fromEntries(files)));
  const errors = compiled.diagnostics.filter((d) => d.severity === 'error');
  if (!compiled.pack || errors.length > 0) return { id, kind: 'refused', errors };
  return { ok: true, pack: JSON.parse(JSON.stringify(compiled.pack)), name: compiled.pack.project.id };
}

/** Answers each request in turn; one game at a time. */
export function playJobs(): (request: PlayPageRequest) => Promise<PlayPageReply> {
  const host = playHost();
  return async (request) => {
    if (request.kind === 'pack' || request.kind === 'start-files') {
      const packed = await packFiles(request.id, request.files);
      if (!('ok' in packed)) return packed;
      if (request.kind === 'pack') return { id: request.id, kind: 'packed', pack: packed.pack, name: packed.name };
      return host({ id: request.id, kind: 'start', pack: packed.pack, seed: request.seed });
    }
    return host(request);
  };
}
