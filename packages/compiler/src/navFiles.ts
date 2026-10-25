/**
 * A space's navmesh file (M6.2, D74, docs/specs/navigation.md#the-navmesh): spaces/<id>.nav is
 * "EBNV", a version byte, the hash of what it was baked from as 16 hex digits, then Recast's own
 * export. The compiler reads only the header: E078 for a file that isn't one or whose space isn't
 * there, W147 for one baked from solids or a terrain that have changed since.
 */
import { type Diagnostic, type DiagnosticCode, severityOf } from '@eb/schema';

export const NAV_VERSION = 1;
const MAGIC = 'EBNV';
/** The magic, the version and the hash. */
export const NAV_HEADER = MAGIC.length + 1 + 16;
const HEX = /^[0-9a-f]{16}$/;

/** A .nav file under spaces/, read: its header is null when it isn't one. */
export interface NavFileRead {
  readonly file: string;
  readonly id: string;
  readonly header: { readonly hash: string } | null;
}

/** The file's bytes: the header, then Recast's export. */
export function navFileBytes(hash: string, navmesh: Uint8Array): Uint8Array {
  if (!HEX.test(hash)) throw new Error(`A navmesh's hash is 16 hex digits, not "${hash}"`);
  const bytes = new Uint8Array(NAV_HEADER + navmesh.length);
  for (let i = 0; i < MAGIC.length; i++) bytes[i] = MAGIC.charCodeAt(i);
  bytes[MAGIC.length] = NAV_VERSION;
  for (let i = 0; i < 16; i++) bytes[MAGIC.length + 1 + i] = hash.charCodeAt(i);
  bytes.set(navmesh, NAV_HEADER);
  return bytes;
}

/** The header of a .nav file, or null when the bytes aren't one this engine reads. */
export function navHeader(bytes: Uint8Array): { readonly hash: string } | null {
  if (bytes.length <= NAV_HEADER) return null;
  const magic = String.fromCharCode(...bytes.subarray(0, MAGIC.length));
  const hash = String.fromCharCode(...bytes.subarray(MAGIC.length + 1, NAV_HEADER));
  if (magic !== MAGIC || bytes[MAGIC.length] !== NAV_VERSION || !HEX.test(hash)) return null;
  return { hash };
}

/** Recast's export inside a .nav file, as the stage imports it. */
export const navmeshOf = (bytes: Uint8Array): Uint8Array => bytes.subarray(NAV_HEADER);

const at = (file: string, code: DiagnosticCode, message: string): Diagnostic => ({
  code,
  severity: severityOf(code),
  message,
  file,
  path: '',
});

/**
 * E078 and W147 over the .nav files: `spaces` are the project's space ids, and `hashes` each one's
 * inputs worked out as a bake would (navHashes), none for a space that isn't sound yet.
 */
export function checkNavFiles(
  navs: readonly NavFileRead[],
  spaces: ReadonlySet<string>,
  hashes: ReadonlyMap<string, string>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const nav of navs) {
    const now = hashes.get(nav.id);
    if (!spaces.has(nav.id)) {
      diagnostics.push(
        at(nav.file, 'E078', `No space "${nav.id}" for this navmesh: spaces/${nav.id}.json isn't there`),
      );
    } else if (nav.header === null) {
      diagnostics.push(
        at(nav.file, 'E078', 'Not a navmesh this engine reads: open its space and press Bake navigation'),
      );
    } else if (now !== undefined && nav.header.hash !== now) {
      diagnostics.push(
        at(nav.file, 'W147', "Baked before the space's solids or terrain last changed: press Bake navigation again"),
      );
    }
  }
  return diagnostics;
}
