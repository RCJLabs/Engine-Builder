/**
 * eb: the engine's command line, for CI and for agents working in a game's repo
 * (docs/specs/project-format.md). Run it as `pnpm eb`.
 *
 * Exit codes: 0 when the project has no errors (warnings are fine), 1 when it has errors, and 2
 * when the command couldn't run at all: bad arguments, an unreadable input or types module.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { compileProject, type ProjectSource, zipSource } from '@eb/compiler';
import { canonicalJson, type FactCatalog } from '@eb/core';
import type { RecordType } from '@eb/schema';
import { folderSource } from './folderSource.ts';
import { formatResult } from './report.ts';

const USAGE = `Usage:
  eb validate <project> [--types <module>] [--json]
  eb build <project> [--types <module>] [--out <file>] [--json]

<project> is a project folder or a .zip of one. --types names a JS or TS module whose
recordTypes export lists the record types to check against, and whose facts export, if it has
one, is the fact catalog to check conditions against (factCatalog(modules) in @eb/core). build
writes the content pack to --out, or to <project id>.pack.json in the current folder.`;

class UsageError extends Error {}

async function main(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: { types: { type: 'string' }, out: { type: 'string' }, json: { type: 'boolean' } },
  });
  const [command, project, ...extra] = positionals;
  if ((command !== 'validate' && command !== 'build') || project === undefined || extra.length > 0) {
    throw new UsageError(USAGE);
  }
  if (command === 'validate' && values.out !== undefined) throw new UsageError('--out only applies to eb build');
  const { types, facts } = values.types === undefined ? { types: [] } : await loadTypes(values.types);
  const result = await compileProject(await openProject(project), types, facts ? { facts } : {});
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

async function loadTypes(path: string): Promise<{ types: readonly RecordType[]; facts?: FactCatalog }> {
  let loaded: { recordTypes?: unknown; facts?: unknown };
  try {
    loaded = await import(pathToFileURL(resolve(path)).href);
  } catch (error) {
    throw new UsageError(`Could not load --types ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const types = loaded.recordTypes;
  // The fields defineRecordType adds; validation checks the rest.
  const isRecordType = (value: unknown): value is RecordType =>
    typeof value === 'object' && value !== null && 'type' in value && 'schema' in value && 'targets' in value;
  if (!Array.isArray(types) || !types.every(isRecordType)) {
    throw new UsageError(`${path} must export recordTypes: a list of record types made by defineRecordType`);
  }
  const { facts } = loaded;
  if (facts === undefined) return { types };
  if (typeof facts !== 'object' || facts === null || Array.isArray(facts)) {
    throw new UsageError(`${path} exports facts, which must be a fact catalog: factCatalog(modules) from @eb/core`);
  }
  return { types, facts: facts as FactCatalog };
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
