import { createPack, type Pack, type PackProject } from '@eb/core';
import {
  compareDiagnostics,
  type DataType,
  type Diagnostic,
  type DiagnosticCode,
  packValue,
  type RecordInput,
  type RecordType,
  severityOf,
  type Usage,
  type ValidateOptions,
  validateRecords,
} from '@eb/schema';
import { parseJsonFile } from './decode.ts';
import { ASSETS_DIR, classifyRecordFile, MANIFEST_FILE, RECORDS_DIR } from './layout.ts';
import { checkManifest } from './manifest.ts';
import type { ProjectSource } from './source.ts';
import { readTypes } from './types.ts';

export interface CompileResult {
  /** Sorted by compareDiagnostics. */
  readonly diagnostics: readonly Diagnostic[];
  /** The content pack, or null when any diagnostic is an error. Warnings don't stop it. */
  readonly pack: Pack | null;
  readonly usedBy: ReadonlyMap<string, readonly Usage[]>;
  /** How many record files the project has, including any that failed. */
  readonly records: number;
  /** The project's own types from types/ that are sound, by name. */
  readonly dataTypes: ReadonlyMap<string, DataType>;
}

interface Report {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly file: string;
  readonly path: string;
  readonly type?: string;
  readonly id?: string;
}

/**
 * Reads, checks and packs a project. The same files give the same diagnostics and the same pack
 * hash in the editor and in the CLI, whatever order the source lists them in. `types` are the
 * game's code types, which the project's own types/ join; `options.facts` is the game's fact
 * catalog, for checking the conditions in records.
 */
export async function compileProject(
  source: ProjectSource,
  types: readonly RecordType[],
  options: Omit<ValidateOptions, 'assets'> = {},
): Promise<CompileResult> {
  const diagnostics: Diagnostic[] = [];
  const report = ({ code, message, type, id, file, path }: Report) =>
    diagnostics.push({
      code,
      severity: severityOf(code),
      message,
      ...(type === undefined ? {} : { type, id }),
      file,
      path,
    });
  const project = await readProject(source, report);
  const known = await readTypes(source, types, report);
  const assets = await readAssets(source);
  const records = (await readRecords(source, report)).map((record) =>
    known.unchecked.has(record.type) ? { ...record, unreadable: true } : record,
  );
  const validation = validateRecords(known.types, records, { ...options, assets });
  diagnostics.push(...validation.diagnostics);
  diagnostics.sort(compareDiagnostics);
  const failed = project === null || diagnostics.some((d) => d.severity === 'error');
  return {
    diagnostics,
    pack: failed ? null : createPack(project, packRecords(records, known.types, options)),
    usedBy: validation.usedBy,
    records: records.length,
    dataTypes: known.data,
  };
}

async function readProject(source: ProjectSource, report: (r: Report) => void): Promise<PackProject | null> {
  const file = MANIFEST_FILE;
  const bytes = await source.read(file);
  if (bytes === undefined) {
    report({ code: 'E008', message: 'Missing project.json', file, path: '' });
    return null;
  }
  const parsed = parseJsonFile(bytes);
  if (!parsed.ok) {
    report({ code: 'E007', message: parsed.message, file, path: '' });
    return null;
  }
  const { project, problems } = checkManifest(parsed.value);
  for (const problem of problems) report({ ...problem, file });
  return project;
}

/** The files under assets/, as paths inside it, for asset fields to name. */
async function readAssets(source: ProjectSource): Promise<ReadonlySet<string>> {
  const prefix = `${ASSETS_DIR}/`;
  return new Set((await source.files(ASSETS_DIR)).map((path) => path.slice(prefix.length)));
}

// Any order will do: validation's output doesn't depend on it, and the pack hash is canonical.
async function readRecords(source: ProjectSource, report: (r: Report) => void): Promise<RecordInput[]> {
  const paths = await source.files(RECORDS_DIR);
  const read = await Promise.all(paths.map((file) => readRecord(source, file, report)));
  return read.filter((record) => record !== undefined);
}

async function readRecord(source: ProjectSource, file: string, report: (r: Report) => void) {
  const role = classifyRecordFile(file);
  if (role.kind === 'ignored') {
    report({ code: 'W101', message: 'Ignored: record files are records/<type>/<id>.json', file, path: '' });
    return undefined;
  }
  if (role.kind === 'misplaced') {
    report({ code: 'E010', message: 'A record file must sit at records/<type>/<id>.json', file, path: '' });
    return undefined;
  }
  const { type, id } = role;
  const bytes = await source.read(file);
  const parsed = bytes === undefined ? ({ ok: false, message: 'Missing file' } as const) : parseJsonFile(bytes);
  if (parsed.ok) return { type, id, file, value: parsed.value };
  report({ code: 'E007', message: parsed.message, type, id, file, path: '' });
  // Still a record, so references to it don't fail as well: one problem, one diagnostic.
  return { type, id, file, value: undefined, unreadable: true };
}

/**
 * `{ [type]: { [id]: value } }`, with conditions written as text turned into trees (D31). Only
 * called once validation found no errors, so every record has a type and every text parses.
 */
function packRecords(
  records: readonly RecordInput[],
  types: readonly RecordType[],
  options: Omit<ValidateOptions, 'assets'>,
): Record<string, Record<string, unknown>> {
  const byName = new Map(types.map((t) => [t.type, t]));
  const pack: Record<string, Record<string, unknown>> = {};
  for (const { type, id, value } of records) {
    const schema = byName.get(type)?.schema;
    pack[type] ??= {};
    pack[type][id] = schema ? packValue(schema, value, options.facts) : value;
  }
  return pack;
}
