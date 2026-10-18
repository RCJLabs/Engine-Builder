/**
 * A project's own game (M3.2, D38): scripts/game.ts, read and checked as the compiler reads it,
 * then run. eb runs a project's scripts as it runs a --game module: because it was asked to check
 * or play that project. A script that never returns hangs eb, as a --game module's would.
 */
import { type ProjectSource, readScripts } from '@eb/compiler';
import { type Diagnostic, severityOf, type ValidateOptions } from '@eb/schema';
import { type GameCatalog, loadProjectGame, type ProjectGame, scriptPath } from '@eb/script';

export type ScriptedGame =
  /** There is no scripts/game.ts. */
  | { readonly kind: 'none' }
  /** A script game.ts reaches has an error, which compiling the project reports. */
  | { readonly kind: 'broken' }
  /** It ran and failed: E031 or E032. */
  | { readonly kind: 'failed'; readonly diagnostic: Diagnostic }
  | { readonly kind: 'loaded'; readonly game: ProjectGame; readonly catalog: GameCatalog };

export async function projectGame(source: ProjectSource): Promise<ScriptedGame> {
  const scripts = await readScripts(source);
  if (!scripts.hasGame) return { kind: 'none' };
  if (scripts.compiled.size === 0) return { kind: 'broken' };
  const loaded = loadProjectGame(scripts.compiled);
  if (loaded.ok) return { kind: 'loaded', game: loaded.game, catalog: loaded.catalog };
  const { code, message, script = 'game', line } = loaded.problem;
  const diagnostic: Diagnostic = {
    code,
    severity: severityOf(code),
    message,
    file: scriptPath(script),
    path: '',
    ...(line !== undefined ? { line } : {}),
  };
  return { kind: 'failed', diagnostic };
}

/** What content is checked against once the game has run: its facts, events and effects, and nothing else. */
export const gameOptions = (catalog: GameCatalog): ValidateOptions => ({
  facts: catalog.facts,
  events: catalog.events,
  effectNames: catalog.effects,
});
