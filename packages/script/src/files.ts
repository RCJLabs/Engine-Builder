/**
 * Where a project's scripts live (M3.2, D38): `scripts/<id>.ts`, the id kebab-case as a record's
 * is, and `scripts/game.ts` the one that is the game.
 */
import { isRecordId } from '@eb/core';

export const SCRIPTS_DIR = 'scripts';
/** The script whose exports are the game: modules, start, policies and metrics, as `eb sim --game` reads. */
export const GAME_SCRIPT = 'game';

export const scriptPath = (id: string): string => `${SCRIPTS_DIR}/${id}.ts`;

export type ScriptFile =
  | { readonly kind: 'script'; readonly id: string }
  /** A .ts file in a folder under scripts/, or one whose name is no id. */
  | { readonly kind: 'misplaced'; readonly reason: string }
  /** Anything else: notes, JSON, declaration files for VS Code. */
  | { readonly kind: 'ignored' };

/** What a file under scripts/ is. `path` is relative to the project root. */
export function classifyScript(path: string): ScriptFile {
  const rest = path.slice(SCRIPTS_DIR.length + 1);
  if (!rest.endsWith('.ts') || rest.endsWith('.d.ts')) return { kind: 'ignored' };
  if (rest.includes('/')) return { kind: 'misplaced', reason: 'A script must sit at scripts/<name>.ts' };
  const id = rest.slice(0, -'.ts'.length);
  if (!isRecordId(id)) {
    return {
      kind: 'misplaced',
      reason: `"${id}" is not a valid script name: use lowercase words joined by hyphens, at most 64 characters`,
    };
  }
  return { kind: 'script', id };
}
