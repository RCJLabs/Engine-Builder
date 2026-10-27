/**
 * A stage's files loaded (M7.4, D86, docs/specs/stages.md): what the stage worker carries, so nothing
 * here imports the transpiler, the purity rules or the engine's sim. stages.ts checks the files.
 */
import { headerLines, runModules } from './modules.ts';

export const STAGES_DIR = 'stages';
/** The stage API, as a stage imports it: `import { defineStage } from 'eb/stage'`. */
export const STAGE_API = 'eb/stage';

/** A stage file by its path under stages/, without `.ts`: `battle`, `space-wrecked/painter`. */
export const stagePath = (file: string): string => `${STAGES_DIR}/${file}.ts`;

/** A stage a space can name sits at the top of stages/; the files in its folders are its parts. */
export const isStageEntry = (file: string): boolean => !file.includes('/');

/**
 * The stage file a relative import from `from` names, or undefined if it isn't one or leaves
 * stages/: from `space-wrecked/painter`, "./orbit" is `space-wrecked/orbit` and "../battle.ts" is
 * `battle`.
 */
export function stageImport(from: string, spec: string): string | undefined {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return undefined;
  const parts = from.split('/').slice(0, -1);
  for (const part of spec.replace(/\.ts$/, '').split('/')) {
    if (part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else parts.push(part);
  }
  return parts.length > 0 ? parts.join('/') : undefined;
}

/** Something a stage did wrong as it loaded or drew, at its file and line when the engine says. */
export class StageError extends Error {
  readonly file: string | undefined;
  readonly line: number | undefined;

  constructor(message: string, file?: string, line?: number) {
    super(message);
    this.name = 'StageError';
    this.file = file;
    this.line = line;
  }
}

const FRAME = new RegExp(`\\b(${STAGES_DIR}/[a-z0-9/-]+\\.ts):(\\d+):\\d+`);

/** The error as a StageError that says which file and line, from its stack when it came from a stage. */
export function asStageError(error: unknown): StageError {
  if (error instanceof StageError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const match = FRAME.exec(error instanceof Error ? (error.stack ?? '') : '');
  if (!match) return new StageError(message);
  const line = Number(match[2]) - headerLines();
  return new StageError(message, match[1], line > 0 ? line : undefined);
}

/** The exports of stage `entry`, running it and the files it imports, with `"eb/stage"` the given API. */
export function loadStage(
  compiled: ReadonlyMap<string, string>,
  entry: string,
  api: unknown,
): Readonly<Record<string, unknown>> {
  return runModules(
    {
      compiled,
      resolve(from, spec) {
        if (spec === STAGE_API) return { builtin: api };
        const file = stageImport(from, spec);
        return file === undefined
          ? { error: `A stage may import "${STAGE_API}" and stage files, not "${spec}"` }
          : { id: file };
      },
      pathOf: stagePath,
      missing: (file) => new StageError(`There is no stage file ${stagePath(file)}`, stagePath(file)),
      refused: (message, from) => new StageError(message, stagePath(from)),
      thrown: asStageError,
    },
    entry,
  );
}
