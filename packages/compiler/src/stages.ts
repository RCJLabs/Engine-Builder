/**
 * A project's stages as the compiler reads them (M7.4, D86, docs/specs/stages.md): every .ts file
 * under stages/ named and checked by the stage rules, each 2D space's `stage` held to a file there
 * (E095), and the files the spaces' stages reach compiled for the pack. A file nothing reaches is
 * W159 and left out. Other files there, a NOTICE or a README, are the project's own and ignored.
 * Nothing here runs a stage.
 */
import { type Diagnostic, type DiagnosticCode, severityOf } from '@eb/schema';
import { type CheckedScript, checkStage, classifyStage, type ScriptProblem, STAGES_DIR, stagePath } from '@eb/script';
import type { ProjectSource } from './source.ts';
import { atLines, readSpaces, type SpaceFileRead } from './spaces.ts';

export interface StagesRead {
  /** Every stage file by its path under stages/ without `.ts`, sorted, sound or not. */
  readonly files: readonly string[];
  /** Each file's check: its JavaScript when it parses, its imports and its problems. */
  readonly checked: ReadonlyMap<string, CheckedScript>;
  /** E028 to E030, in no order. */
  readonly diagnostics: readonly Diagnostic[];
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
// UTF-16 order, the same in every locale.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const diagnostic = (file: string, code: DiagnosticCode, message: string, at: Partial<ScriptProblem> = {}) => ({
  code,
  severity: severityOf(code),
  message,
  file,
  path: '',
  ...(at.line !== undefined ? { line: at.line } : {}),
  ...(at.column !== undefined ? { column: at.column } : {}),
});

/** stages/ read and each file checked by the stage rules: E028 to E030 at their lines. */
export async function readStages(source: ProjectSource): Promise<StagesRead> {
  const diagnostics: Diagnostic[] = [];
  const sources = new Map<string, string>();
  for (const path of [...(await source.files(STAGES_DIR))].sort(byText)) {
    const role = classifyStage(path);
    if (role.kind === 'misplaced') diagnostics.push(diagnostic(path, 'E030', role.reason));
    if (role.kind !== 'stage') continue;
    const text = decode(await source.read(path));
    if (text === undefined) diagnostics.push(diagnostic(path, 'E028', 'Not valid UTF-8 text'));
    else sources.set(role.file, text);
  }
  const known = new Set(sources.keys());
  const checked = new Map([...sources].map(([file, text]) => [file, checkStage(text, file, known)]));
  for (const [file, stage] of checked)
    for (const problem of stage.problems)
      diagnostics.push(diagnostic(stagePath(file), problem.code, problem.message, problem));
  return { files: [...known].sort(byText), checked, diagnostics };
}

/** The stage each space names, by the space's id (a prefab has none: E058 says so). */
function namedBy(spaces: readonly SpaceFileRead[]): Map<string, { space: SpaceFileRead; stage: string }> {
  const named = new Map<string, { space: SpaceFileRead; stage: string }>();
  for (const space of spaces) {
    const stage = (space.value as { stage?: unknown } | undefined)?.stage;
    if (space.kind === 'space' && typeof stage === 'string') named.set(space.id, { space, stage });
  }
  return named;
}

/**
 * The stages against the spaces: E095 at a space whose stage names no file, W159 at each file no
 * stage reaches, and the JavaScript of the files they reach, by path, for the pack's world.
 */
export function checkStages(
  read: StagesRead,
  spaces: readonly SpaceFileRead[],
): { readonly diagnostics: readonly Diagnostic[]; readonly compiled: Readonly<Record<string, string>> } {
  const found: Diagnostic[] = [];
  const entries = new Set<string>();
  const named = namedBy(spaces);
  for (const { space, stage } of named.values()) {
    if (read.checked.has(stage)) entries.add(stage);
    else
      found.push({
        ...diagnostic(space.file, 'E095', `There is no stage ${stagePath(stage)}`),
        path: '/stage',
      });
  }
  const reached = reachable(read.checked, entries);
  const diagnostics = atLines(spaces, found);
  for (const file of read.files) {
    if (reached.has(file)) continue;
    const message =
      named.size === 0
        ? 'No space names a stage, so nothing draws with it'
        : "No space's stage imports it, directly or through another, so nothing draws with it";
    diagnostics.push(diagnostic(stagePath(file), 'W159', message));
  }
  const compiled: Record<string, string> = {};
  for (const file of [...reached].sort(byText)) {
    const js = read.checked.get(file)?.js;
    if (js !== undefined) compiled[file] = js;
  }
  return { diagnostics, compiled };
}

/**
 * The stage files and every problem with them, the spaces' stages among them, as eb validate gives
 * them: what the editor's script worker reports, keeping the transpiler off the page (M7.4).
 */
export async function readStageProblems(
  source: ProjectSource,
): Promise<{ files: string[]; diagnostics: Diagnostic[] }> {
  const read = await readStages(source);
  const spaces = await readSpaces(source);
  return { files: [...read.files], diagnostics: [...read.diagnostics, ...checkStages(read, spaces.files).diagnostics] };
}

const decode = (bytes: Uint8Array | undefined): string | undefined => {
  if (bytes === undefined) return undefined;
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
};

/** The entries and every stage file they import, directly or through another. */
function reachable(checked: ReadonlyMap<string, CheckedScript>, entries: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file) || !checked.has(file)) return;
    seen.add(file);
    for (const next of checked.get(file)?.imports ?? []) visit(next);
  };
  for (const entry of entries) visit(entry);
  return seen;
}
