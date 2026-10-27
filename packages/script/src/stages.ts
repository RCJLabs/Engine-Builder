/**
 * A project's stages checked (M7.4, D86, docs/specs/stages.md): `stages/<id>.ts` draws a 2D space,
 * and may import other files anywhere under stages/ and `"eb/stage"`, nothing else. The stage rules
 * allow what a picture needs and the sim may not. stageLoad.ts runs them, in the stage worker.
 */
import { isRecordId } from '@eb/core';
import { scan, stageViolations } from '@eb/purity';
import type { CheckedScript, ScriptProblem } from './check.ts';
import { STAGE_API, STAGES_DIR, stageImport } from './stageLoad.ts';
import { transpileScript } from './transpile.ts';

export type StageFile =
  | { readonly kind: 'stage'; readonly file: string }
  | { readonly kind: 'misplaced'; readonly reason: string }
  | { readonly kind: 'ignored' };

/** What a file under stages/ is. `path` is relative to the project root. */
export function classifyStage(path: string): StageFile {
  const rest = path.slice(STAGES_DIR.length + 1);
  if (!rest.endsWith('.ts') || rest.endsWith('.d.ts')) return { kind: 'ignored' };
  const file = rest.slice(0, -'.ts'.length);
  const bad = file.split('/').find((part) => !isRecordId(part));
  if (bad !== undefined) {
    return {
      kind: 'misplaced',
      reason: `"${bad}" is not a valid stage file or folder name: use lowercase words joined by hyphens`,
    };
  }
  return { kind: 'stage', file };
}

/** A stage file checked: E028 when it doesn't parse, E029 for each stage rule broken, E030 for each import refused. */
export function checkStage(source: string, file: string, files: ReadonlySet<string>): CheckedScript {
  const problems: ScriptProblem[] = [];
  const out = transpileScript(source);
  if (!out.ok) {
    const { message, line, column } = out;
    problems.push({
      code: 'E028',
      message,
      ...(line !== undefined ? { line } : {}),
      ...(column !== undefined ? { column } : {}),
    });
  }
  const scanned = scan(source);
  for (const { line, rule } of stageViolations('', scanned.code)) problems.push({ code: 'E029', message: rule, line });
  const imports: string[] = [];
  for (const { spec, line } of scanned.imports) {
    if (spec === STAGE_API) continue;
    const target = stageImport(file, spec);
    if (target !== undefined && files.has(target)) {
      imports.push(target);
      continue;
    }
    const message =
      target !== undefined
        ? `Imports "${spec}", which is no stage file here`
        : `Imports "${spec}": a stage may import "${STAGE_API}" and other files under stages/ ("./<name>")`;
    problems.push({ code: 'E030', message, line });
  }
  return { ...(out.ok ? { js: out.js } : {}), imports, problems };
}
