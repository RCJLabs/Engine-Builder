/**
 * Runs a project's scripts (M3.2): each script's JavaScript in a function of its own, with a
 * `require` that gives "eb" and the other scripts, as CommonJS does. Only trusted projects get
 * here (D38): the purity rules read the source, and running it is still running it.
 */
import { EB_MODULE } from './api.ts';
import { EB, importedScript } from './check.ts';
import { SCRIPTS_DIR, scriptPath } from './files.ts';

/** Something a script did wrong while running, at its script and line when the engine says. */
export class ScriptError extends Error {
  readonly script: string | undefined;
  readonly line: number | undefined;

  constructor(message: string, script?: string, line?: number) {
    super(message);
    this.name = 'ScriptError';
    this.script = script;
    this.line = line;
  }
}

const FRAME = new RegExp(`\\b${SCRIPTS_DIR}/([a-z0-9-]+)\\.ts:(\\d+):\\d+`);

let header: number | undefined;

/**
 * How many lines an engine's new Function puts above a body: two in V8 ("function
 * anonymous(require,exports,module" and ") {"). Measured once rather than assumed, as Firefox's
 * and Safari's engines need not agree.
 */
function headerLines(): number {
  if (header !== undefined) return header;
  header = 2;
  try {
    new Function(`throw new Error('probe');\n//# sourceURL=${SCRIPTS_DIR}/header-probe.ts`)();
  } catch (error) {
    const line = Number(/header-probe\.ts:(\d+)/.exec(error instanceof Error ? (error.stack ?? '') : '')?.[1]);
    if (Number.isSafeInteger(line) && line >= 1) header = line - 1;
  }
  return header;
}

/** The script and line an error was thrown at, from its stack, when it came from a script. */
export function scriptLocation(error: unknown): { script: string; line?: number } | undefined {
  if (error instanceof ScriptError && error.script !== undefined) {
    return { script: error.script, ...(error.line !== undefined ? { line: error.line } : {}) };
  }
  const stack = error instanceof Error ? error.stack : undefined;
  const match = stack ? FRAME.exec(stack) : null;
  if (!match) return undefined;
  const line = Number(match[2]) - headerLines();
  return { script: match[1] as string, ...(line > 0 ? { line } : {}) };
}

/** The error as a ScriptError that says where, if it can. */
export function asScriptError(error: unknown): ScriptError {
  if (error instanceof ScriptError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const at = scriptLocation(error);
  return new ScriptError(message, at?.script, at?.line);
}

/**
 * The exports of `entry`, running it and every script it imports, each once. A script imported
 * while it is still running gets what it has exported so far, as Node's require gives.
 */
export function loadScripts(compiled: ReadonlyMap<string, string>, entry: string): Readonly<Record<string, unknown>> {
  const loaded = new Map<string, { exports: Record<string, unknown> }>();
  const load = (id: string): Record<string, unknown> => {
    const known = loaded.get(id);
    if (known) return known.exports;
    const js = compiled.get(id);
    if (js === undefined) throw new ScriptError(`There is no script ${scriptPath(id)}`, id);
    const module = { exports: {} as Record<string, unknown> };
    loaded.set(id, module);
    const require = (spec: string): unknown => {
      if (spec === EB) return EB_MODULE;
      const script = importedScript(spec);
      if (script === undefined) throw new ScriptError(`A script may import "eb" and other scripts, not "${spec}"`, id);
      return load(script);
    };
    try {
      new Function('require', 'exports', 'module', `${js}\n//# sourceURL=${scriptPath(id)}`)(
        require,
        module.exports,
        module,
      );
    } catch (error) {
      throw asScriptError(error);
    }
    return module.exports;
  };
  return load(entry);
}
