/**
 * eb: the engine's command line, for CI and for agents working in a game's repo
 * (docs/specs/project-format.md, docs/specs/runner.md). Run it as `pnpm eb`.
 *
 * Exit codes: 0 when all is well (warnings are fine); 1 when the project has errors, or a sim
 * found a refused offer or runs that differ from their golden file; and 2 when the command
 * couldn't run at all: bad arguments, or an unreadable input, module or golden file.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { compileProject, type ProjectSource, zipSource } from '@eb/compiler';
import { canonicalJson } from '@eb/core';
import { folderSource } from './folderSource.ts';
import { loadGame, loadTypes, UsageError } from './modules.ts';
import { formatResult } from './report.ts';
import { runSchemas } from './schemas.ts';
import { runSim } from './sim.ts';

const USAGE = `Usage:
  eb validate <project> [--types <module>] [--json]
  eb build <project> [--types <module>] [--out <file>] [--json]
  eb schemas <folder> [--types <module>] [--json]
  eb sim <project> --game <module> [--policy <name>] [--seeds <n>] [--prefix <text>]
         [--max-turns <n>] [--golden <file> [--update]] [--json]

<project> is a project folder or a .zip of one. --types names a JS or TS module whose
recordTypes export lists the record types to check against; whose facts and events exports (or
modules export) give the facts conditions and the events trigger rows are checked against; and
whose effects export lists its effects' schemas. Without --types, content is checked against the
engine's own facts, events and effects, and any other is taken as written. build writes the
content pack to --out, or to <project id>.pack.json in the current folder.

schemas writes each record type's JSON Schema into the folder's .vscode/eb-schemas/ and maps
records/<type>/*.json to them in .vscode/settings.json, so an editor checks records edited by
hand. Run it again after changing a type.

sim plays the project with a bot, one run per seed (100 seeds, seed-0 on, by default), and
reports how the runs went. --game names a module exporting recordTypes, modules and start, and
optionally policies and metrics. --golden checks the runs against a golden file, playing its own
seeds, policy and cap; with --update it writes the file instead.`;

const SIM_ONLY = ['game', 'policy', 'seeds', 'prefix', 'max-turns', 'golden', 'update'] as const;

async function main(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      types: { type: 'string' },
      out: { type: 'string' },
      json: { type: 'boolean' },
      game: { type: 'string' },
      policy: { type: 'string' },
      seeds: { type: 'string' },
      prefix: { type: 'string' },
      'max-turns': { type: 'string' },
      golden: { type: 'string' },
      update: { type: 'boolean' },
    },
  });
  const [command, project, ...extra] = positionals;
  if (!['validate', 'build', 'schemas', 'sim'].includes(command ?? '') || project === undefined || extra.length > 0) {
    throw new UsageError(USAGE);
  }
  if (command === 'sim') {
    if (values.game === undefined) throw new UsageError('eb sim needs --game <module>');
    if (values.types !== undefined || values.out !== undefined)
      throw new UsageError('eb sim takes --game, not --types or --out');
    return runSim(await openProject(project), await loadGame(values.game), values);
  }
  const misplaced = SIM_ONLY.find((flag) => values[flag] !== undefined);
  if (misplaced) throw new UsageError(`--${misplaced} only applies to eb sim`);
  if (command !== 'build' && values.out !== undefined) throw new UsageError('--out only applies to eb build');
  if (command === 'schemas') return runSchemas(project, values);
  const { types, ...catalogues } = values.types === undefined ? { types: [] } : await loadTypes(values.types);
  const result = await compileProject(await openProject(project), types, catalogues);
  let out: string | undefined;
  if (command === 'build' && result.pack) {
    out = values.out ?? `${result.pack.project.id}.pack.json`;
    await mkdir(dirname(resolve(out)), { recursive: true });
    await writeFile(out, `${canonicalJson(result.pack)}\n`);
  }
  if (values.json) {
    const ok = !result.diagnostics.some((d) => d.severity === 'error');
    const summary = { ok, records: result.records, hash: result.pack?.hash ?? null, out: out ?? null };
    console.log(JSON.stringify({ ...summary, diagnostics: result.diagnostics }, null, 2));
  } else {
    for (const line of formatResult(result, values.types === undefined)) console.log(line);
    if (out) console.log(`Wrote ${out}.`);
  }
  return result.diagnostics.some((d) => d.severity === 'error') ? 1 : 0;
}

async function openProject(path: string): Promise<ProjectSource> {
  const info = await stat(path).catch(() => undefined);
  if (info?.isDirectory()) return folderSource(path);
  if (!info?.isFile()) throw new UsageError(`${path} is neither a project folder nor a zip`);
  try {
    return zipSource(new Uint8Array(await readFile(path)));
  } catch (error) {
    throw new UsageError(`${path} is not a zip: ${error instanceof Error ? error.message : String(error)}`);
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const usage =
      error instanceof UsageError ||
      (error instanceof Error && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS'));
    console.error(usage ? (error as Error).message : error);
    process.exitCode = 2;
  },
);
