/**
 * Save codes: a save as text to copy, paste or send (docs/specs/saves.md). `EB1.<game>.<payload>.<check>`:
 * - the game's id, so a code pasted into the wrong game says whose it is before anything is
 *   unpacked, as space-wrecked's codes do;
 * - the payload, the save's canonical JSON deflated and in base64url;
 * - FNV-1a 32 of everything before it, so a mistyped code is caught before it is inflated.
 * The save's own checksum then catches the rest when it loads.
 */
import { canonicalJson, fnv1a32, isRecordId, type SaveFile } from '@eb/core';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

const PREFIX = 'EB1';
/** The most a code may unpack to. A pasted code is untrusted, and a small one can inflate a thousandfold. */
export const MAX_CODE_BYTES = 4 << 20;

export function encodeSaveCode(file: SaveFile): string {
  const payload = toBase64Url(deflateSync(strToU8(canonicalJson(file)), { level: 9 }));
  const body = `${PREFIX}.${file.game}.${payload}`;
  return `${body}.${checkOf(body)}`;
}

export type Decoded =
  | { readonly ok: true; readonly game: string; readonly file: unknown }
  | { readonly ok: false; readonly message: string };

/**
 * The save in a code, still to be checked by loadSave. Spaces and line breaks in the code are
 * ignored. With `game`, a code from another game is refused before it is unpacked.
 */
export function decodeSaveCode(code: string, game?: string): Decoded {
  // Dots, because base64url uses "-" itself and a game id may too.
  const parts = code.replace(/\s+/g, '').split('.');
  const [prefix, codeGame = '', payload = '', check] = parts;
  if (parts.length !== 4 || prefix !== PREFIX || !isRecordId(codeGame))
    return { ok: false, message: 'Not a save code' };
  if (checkOf(`${PREFIX}.${codeGame}.${payload}`) !== check)
    return { ok: false, message: 'The code is mistyped or cut short' };
  if (game !== undefined && codeGame !== game) {
    return { ok: false, message: `The code is a save of "${codeGame}", not "${game}"` };
  }
  try {
    // A buffer one byte past the limit: fflate fills a given buffer and stops, rather than growing it.
    const bytes = inflateSync(fromBase64Url(payload), { out: new Uint8Array(MAX_CODE_BYTES + 1) });
    if (bytes.length > MAX_CODE_BYTES) return { ok: false, message: 'The code unpacks to more than a save can be' };
    return { ok: true, game: codeGame, file: JSON.parse(strFromU8(bytes)) };
  } catch {
    return { ok: false, message: 'The code does not hold a save' };
  }
}

const checkOf = (body: string) => fnv1a32(body).toString(16).padStart(8, '0');

// btoa and atob take binary strings; chunks keep String.fromCharCode under the argument limit.
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('Not base64url');
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
