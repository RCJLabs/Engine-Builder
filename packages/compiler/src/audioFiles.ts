/**
 * The audio files a game's music names, packed as base64 (M4.8, D58, pack format 8), so an exported
 * game plays its music offline. Only files a music record's stems name travel; a missing one is
 * E018 at its stem already, and is left out.
 */
import { MUSIC_DATA, type RecordInput } from '@eb/schema';
import type { ProjectSource } from './source.ts';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Bytes as base64 (RFC 4648), written out here: the compiler runs where neither btoa nor Buffer is sure to be. */
export function base64Of(bytes: Uint8Array): string {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i] as number, bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out.push(
      ALPHABET[(n >> 18) & 63] as string,
      ALPHABET[(n >> 12) & 63] as string,
      b === undefined ? '=' : (ALPHABET[(n >> 6) & 63] as string),
      c === undefined ? '=' : (ALPHABET[n & 63] as string),
    );
  }
  return out.join('');
}

/** Each stem's file by its path inside assets/, sorted. Empty when no music names any. */
export async function audioFiles(
  source: ProjectSource,
  records: readonly RecordInput[],
): Promise<Record<string, string>> {
  const paths = new Set<string>();
  for (const record of records) {
    if (record.type !== MUSIC_DATA.type || record.unreadable) continue;
    const stems = (record.value as { stems?: unknown }).stems;
    if (!Array.isArray(stems)) continue;
    for (const stem of stems) {
      const asset = (stem as { asset?: unknown } | null)?.asset;
      if (typeof asset === 'string') paths.add(asset);
    }
  }
  const files: Record<string, string> = {};
  for (const path of [...paths].sort()) {
    const bytes = await source.read(`assets/${path}`);
    if (bytes !== undefined) files[path] = base64Of(bytes);
  }
  return files;
}
