/**
 * A project's own game (M3.2, D38): scripts/game.ts, read and checked as the compiler reads it,
 * then run. compileProject never runs a script; this does, for a caller that chose to: eb, asked to
 * check or play the project, and the editor's script worker, once the project is trusted. A script
 * that never returns hangs its caller here, as a --game module's would; the editor stops its worker
 * from outside.
 */
import { compareDiagnostics, type Diagnostic, severityOf, type ValidateOptions } from '@eb/schema';
import { type GameCatalog, loadProjectGame, type ProjectGame, scriptPath } from '@eb/script';
import { type CompileResult, compileProject } from './compile.ts';
import { readScripts, type ScriptsRead } from './scripts.ts';
import type { ProjectSource } from './source.ts';

export type ScriptedGame =
  /** There is no scripts/game.ts. */
  | { readonly kind: 'none' }
  /** A script game.ts reaches has an error, which compiling the project reports. */
  | { readonly kind: 'broken' }
  /** It ran and failed: E031 or E032. */
  | { readonly kind: 'failed'; readonly diagnostic: Diagnostic }
  | { readonly kind: 'loaded'; readonly game: ProjectGame; readonly catalog: GameCatalog };

/** The game that scripts already read make, run. */
export function gameOf(scripts: ScriptsRead): ScriptedGame {
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

export async function projectGame(source: ProjectSource): Promise<ScriptedGame> {
  return gameOf(await readScripts(source));
}

/** What content is checked against once the game has run: its facts, events and effects, and nothing else. */
export const gameOptions = (catalog: GameCatalog): ValidateOptions => ({
  facts: catalog.facts,
  events: catalog.events,
  effectNames: catalog.effects,
});

/**
 * compileProject with the project's own game, as `eb validate` and `eb build` compile a project
 * with no --types: checked against the game when it loads, and a game that fails (E031, E032) is
 * an error like any other, so there is no pack.
 */
export async function compileWithGame(source: ProjectSource, scripted?: ScriptedGame): Promise<CompileResult> {
  const game = scripted ?? (await projectGame(source));
  const result = await compileProject(source, [], game.kind === 'loaded' ? gameOptions(game.catalog) : {});
  if (game.kind !== 'failed') return result;
  return { ...result, diagnostics: [...result.diagnostics, game.diagnostic].sort(compareDiagnostics), pack: null };
}
