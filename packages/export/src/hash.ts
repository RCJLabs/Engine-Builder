/**
 * The build's hash (docs/specs/export.md): SHA-256 over every file but the two that name it, each
 * as its path, a zero byte and its bytes, in path order. The same files give the same hash in the
 * editor and in Node; any byte changed changes it.
 */

export const utf8 = new TextEncoder();

export const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256(bytes: Uint8Array): Promise<string> {
  // Its bytes are never a SharedArrayBuffer's, which the DOM's digest refuses to type.
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)));
}

/** Files that hold the hash, so they can't be part of it. */
export const NAMES_THE_BUILD = new Set(['sw.js', 'version.json']);

// UTF-16 order, the same in every locale.
export const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export async function buildHash(files: ReadonlyMap<string, Uint8Array>): Promise<string> {
  const parts: Uint8Array[] = [];
  for (const path of [...files.keys()].sort(byPath)) {
    if (NAMES_THE_BUILD.has(path)) continue;
    parts.push(utf8.encode(path), new Uint8Array([0]), files.get(path) as Uint8Array);
  }
  const all = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return (await sha256(all)).slice(0, 12);
}
