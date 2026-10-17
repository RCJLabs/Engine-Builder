import { createPack, type Pack, type PackProject } from '@eb/core';
import {
  compareDiagnostics,
  type Diagnostic,
  type DiagnosticCode,
  type RecordInput,
  type RecordType,
  severityOf,
  type Usage,
  validateRecords,
} from '@eb/schema';
import { parseJsonFile } from './decode.ts';
import { classifyRecordFile, MANIFEST_FILE, RECORDS_DIR } from './layout.ts';
import { checkManifest } from './manifest.ts';
import type { ProjectSource } from './source.ts';

export interface CompileResult {
  /** Sorted by compareDiagnostics. */
  readonly diagnostics: readonly Diagnostic[];
  /** The content pack, or null when any diagnostic is an error. Warnings don't stop it. */
  readonly pack: Pack | null;
  readonly usedBy: ReadonlyMap<string, readonly Usage[]>;
  /** How many record files the project has, including any that failed. */
  readonly records: number;
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
 * hash in the editor and in the CLI, whatever order the source lists them in.
 */
export async function compileProject(source: ProjectSource, types: readonly RecordType[]): Promise<CompileResult> {
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
  const records = await readRecords(source, report);
  const validation = validateRecords(types, records);
  diagnostics.push(...validation.diagnostics);
  diagnostics.sort(compareDiagnostics);
  const failed = project === null || diagnostics.some((d) => d.severity === 'error');
  return {
    diagnostics,
    pack: failed ? null : createPack(project, groupByType(records)),
    usedBy: validation.usedBy,
    records: records.length,
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

/** `{ [type]: { [id]: value } }`. Only called once validation found no errors. */
function groupByType(records: readonly RecordInput[]): Record<string, Record<string, unknown>> {
  const pack: Record<string, Record<string, unknown>> = {};
  for (const { type, id, value } of records) {
    pack[type] ??= {};
    pack[type][id] = value;
  }
  return pack;
}
