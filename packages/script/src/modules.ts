/**
 * Files run as CommonJS modules (M3.2, M7.4): each file's JavaScript in a function of its own, with a
 * `require` its set resolves. Scripts and stages both load this way. Nothing here imports the
 * transpiler or the engine's API, so the stage worker carries only this.
 */

let header: number | undefined;

/**
 * How many lines an engine's new Function puts above a body: two in V8 ("function
 * anonymous(require,exports,module" and ") {"). Measured once rather than assumed, as Firefox's
 * and Safari's engines need not agree.
 */
export function headerLines(): number {
  if (header !== undefined) return header;
  header = 2;
  try {
    new Function("throw new Error('probe');\n//# sourceURL=probe/header-probe.ts")();
  } catch (error) {
    const line = Number(/header-probe\.ts:(\d+)/.exec(error instanceof Error ? (error.stack ?? '') : '')?.[1]);
    if (Number.isSafeInteger(line) && line >= 1) header = line - 1;
  }
  return header;
}

/** What a `require` names: a module the engine gives, another file by its id, or neither and why. */
export type Resolved = { readonly builtin: unknown } | { readonly id: string } | { readonly error: string };

/** How a set of compiled files finds what each imports, where each says it is, and how it fails. */
export interface ModuleSet {
  readonly compiled: ReadonlyMap<string, string>;
  resolve(from: string, spec: string): Resolved;
  /** The file's path in the project, for its stack frames. */
  pathOf(id: string): string;
  /** No file `id`; `from` imported something it may not; a file threw, perhaps one of those two. */
  missing(id: string): Error;
  refused(message: string, from: string): Error;
  thrown(error: unknown): Error;
}

/**
 * The exports of `entry`, running it and every file it imports, each once. A file imported while it
 * is still running gets what it has exported so far, as Node's require gives. Scripts load this way,
 * and since M7.4 a stage's files, with their own resolver.
 */
export function runModules(set: ModuleSet, entry: string): Readonly<Record<string, unknown>> {
  const loaded = new Map<string, { exports: Record<string, unknown> }>();
  const load = (id: string): Record<string, unknown> => {
    const known = loaded.get(id);
    if (known) return known.exports;
    const js = set.compiled.get(id);
    if (js === undefined) throw set.missing(id);
    const module = { exports: {} as Record<string, unknown> };
    loaded.set(id, module);
    const require = (spec: string): unknown => {
      const found = set.resolve(id, spec);
      if ('builtin' in found) return found.builtin;
      if ('id' in found) return load(found.id);
      throw set.refused(found.error, id);
    };
    try {
      new Function('require', 'exports', 'module', `${js}\n//# sourceURL=${set.pathOf(id)}`)(
        require,
        module.exports,
        module,
      );
    } catch (error) {
      throw set.thrown(error);
    }
    return module.exports;
  };
  return load(entry);
}
