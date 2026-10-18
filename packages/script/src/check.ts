/**
 * What can be known of a script without running it (M3.2): whether it parses, whether it keeps
 * the purity rules sim code keeps (tools/lint-boundaries' own), and whether it imports only "eb"
 * and other scripts. The rules read the source; they are a check, not a wall (D38).
 */
import { patternViolations, scan } from '@eb/purity';
import { transpileScript } from './transpile.ts';

/** E028 doesn't parse, E029 breaks a purity rule, E030 imports what a script may not. */
export interface ScriptProblem {
  readonly code: 'E028' | 'E029' | 'E030';
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

export interface CheckedScript {
  /** The JavaScript, when the script parses. */
  readonly js?: string;
  /** The scripts it imports, by id, in the order written. */
  readonly imports: readonly string[];
  /** In no order: the compiler sorts every diagnostic, by line within a file. */
  readonly problems: readonly ScriptProblem[];
}

/** The engine's API, as a script imports it: `import { defineModule } from 'eb'`. */
export const EB = 'eb';

/** The script a relative import names: "./hold" and "./hold.ts" are scripts/hold.ts. */
export const importedScript = (spec: string): string | undefined =>
  /^\.\/([^/]+?)(\.ts)?$/.exec(spec)?.[1] ?? undefined;

export function checkScript(source: string, scripts: ReadonlySet<string>): CheckedScript {
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
  for (const { line, rule } of patternViolations('', scanned.code))
    problems.push({ code: 'E029', message: rule, line });
  const imports: string[] = [];
  for (const { spec, line } of scanned.imports) {
    if (spec === EB) continue;
    const script = importedScript(spec);
    if (script !== undefined && scripts.has(script)) {
      imports.push(script);
      continue;
    }
    const message =
      script !== undefined
        ? `Imports "${spec}", which is no script here: scripts import each other as "./<name>"`
        : `Imports "${spec}": a script may import "eb" and other scripts ("./<name>")`;
    problems.push({ code: 'E030', message, line });
  }
  return { ...(out.ok ? { js: out.js } : {}), imports, problems };
}
