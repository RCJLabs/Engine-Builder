/**
 * A project's scripts as the compiler reads them (M3.2, D38): every file under scripts/ placed and
 * named, each script parsed, held to the purity rules and to its imports, and the ones
 * scripts/game.ts reaches compiled for the pack. Nothing here runs a script.
 */
import { type Diagnostic, type DiagnosticCode, severityOf } from '@eb/schema';
import { checkScript, classifyScript, GAME_SCRIPT, SCRIPTS_DIR, type ScriptProblem, scriptPath } from '@eb/script';
import type { ProjectSource } from './source.ts';

export interface ScriptsRead {
  /** Every script by id, sorted, sound or not. */
  readonly ids: readonly string[];
  readonly hasGame: boolean;
  /**
   * The JavaScript of game.ts and every script it reaches, by id: what the pack carries and the
   * game loads. Empty when there is no game.ts or any script it reaches has an error.
   */
  readonly compiled: ReadonlyMap<string, string>;
  /** E028 to E030, W111 and W112, in no order. */
  readonly diagnostics: readonly Diagnostic[];
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
// UTF-16 order, the same in every locale.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const diagnostic = (
  file: string,
  code: DiagnosticCode,
  message: string,
  at: Partial<ScriptProblem> = {},
): Diagnostic => ({
  code,
  severity: severityOf(code),
  message,
  file,
  path: '',
  ...(at.line !== undefined ? { line: at.line } : {}),
  ...(at.column !== undefined ? { column: at.column } : {}),
});

export async function readScripts(source: ProjectSource): Promise<ScriptsRead> {
  const diagnostics: Diagnostic[] = [];
  const sources = new Map<string, string>();
  for (const path of [...(await source.files(SCRIPTS_DIR))].sort(byText)) {
    const role = classifyScript(path);
    if (role.kind === 'ignored') {
      diagnostics.push(diagnostic(path, 'W111', 'Ignored: scripts are scripts/<name>.ts'));
    } else if (role.kind === 'misplaced') {
      diagnostics.push(diagnostic(path, 'E030', role.reason));
    } else {
      const text = decode(await source.read(path));
      if (text === undefined) diagnostics.push(diagnostic(path, 'E028', 'Not valid UTF-8 text'));
      else sources.set(role.id, text);
    }
  }
  const ids = [...sources.keys()];
  const known = new Set(ids);
  const checked = new Map([...sources].map(([id, text]) => [id, checkScript(text, known)]));
  for (const [id, script] of checked) {
    for (const problem of script.problems)
      diagnostics.push(diagnostic(scriptPath(id), problem.code, problem.message, problem));
  }
  const hasGame = known.has(GAME_SCRIPT);
  const reached = reachable(checked);
  for (const id of ids) {
    if (reached.has(id)) continue;
    const message = hasGame
      ? "scripts/game.ts doesn't import it, directly or through another, so the game never runs it"
      : 'There is no scripts/game.ts, so nothing runs it';
    diagnostics.push(diagnostic(scriptPath(id), 'W112', message));
  }
  const sound = [...reached].every((id) => checked.get(id)?.js !== undefined && checked.get(id)?.problems.length === 0);
  const compiled = new Map<string, string>();
  if (hasGame && sound) for (const id of [...reached].sort(byText)) compiled.set(id, checked.get(id)?.js as string);
  return { ids: ids.sort(byText), hasGame, compiled, diagnostics };
}

const decode = (bytes: Uint8Array | undefined): string | undefined => {
  if (bytes === undefined) return undefined;
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
};

/** game.ts and every script it imports, directly or through another. */
function reachable(checked: ReadonlyMap<string, { readonly imports: readonly string[] }>): Set<string> {
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id) || !checked.has(id)) return;
    seen.add(id);
    for (const next of checked.get(id)?.imports ?? []) visit(next);
  };
  visit(GAME_SCRIPT);
  return seen;
}
