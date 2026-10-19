import { createPack, type Pack } from '@eb/core';
import {
  compareDiagnostics,
  type DataType,
  type Diagnostic,
  knownFrom,
  packValue,
  type RecordInput,
  type RecordType,
  type Usage,
  type ValidateOptions,
  validateRecords,
} from '@eb/schema';
import { parseJsonFile } from './decode.ts';
import { diagnosticOf, type ListedRecord, type Report, readProjectFiles } from './projectCheck.ts';
import { atSceneLine, readScenes } from './scenes.ts';
import { readScripts } from './scripts.ts';
import type { ProjectSource } from './source.ts';

export interface CompileResult {
  /** Sorted by compareDiagnostics. */
  readonly diagnostics: readonly Diagnostic[];
  /** The content pack, or null when any diagnostic is an error. Warnings don't stop it. */
  readonly pack: Pack | null;
  readonly usedBy: ReadonlyMap<string, readonly Usage[]>;
  /** How many record files the project has, including any that failed. */
  readonly records: number;
  /** The types forms are drawn from, by name: the project's own from types/ that are sound, and the engine's flag and sheet and the kits'. */
  readonly dataTypes: ReadonlyMap<string, DataType>;
}

/**
 * Reads, checks and packs a project. The same files give the same diagnostics and the same pack
 * hash in the editor and in the CLI, whatever order the source lists them in. `types` are the
 * game's code types, which the project's own types/ join; `options.facts` is the game's fact
 * catalog, for checking the conditions in records. Scripts are checked without being run, and
 * the ones scripts/game.ts reaches go into the pack (M3.2): running them is the caller's choice.
 * Each scene under scenes/ is compiled into a talk, which is checked and packed as one (M3.11).
 */
export async function compileProject(
  source: ProjectSource,
  types: readonly RecordType[],
  options: Omit<ValidateOptions, 'assets'> = {},
): Promise<CompileResult> {
  const files = await readProjectFiles(source, types);
  const scripts = await readScripts(source);
  const known = files.types;
  const kitted = { ...options, kits: files.kits, ...(files.calendar ? { calendar: files.calendar } : {}) };
  const scenes = await readScenes(source, knownFrom(kitted).facts, files.kits);
  const diagnostics: Diagnostic[] = [...files.diagnostics, ...scripts.diagnostics, ...scenes.diagnostics];
  const records = [
    ...(await readRecords(source, files.recordFiles, (r) => diagnostics.push(diagnosticOf(r)))),
    ...scenes.records,
  ].map((record) => (known.unchecked.has(record.type) ? { ...record, unreadable: true } : record));
  const validation = validateRecords(known.types, records, { ...kitted, assets: files.assets });
  diagnostics.push(...validation.diagnostics.map((d) => atSceneLine(d, scenes.maps)));
  diagnostics.sort(compareDiagnostics);
  const failed = files.project === null || diagnostics.some((d) => d.severity === 'error');
  return {
    diagnostics,
    pack:
      failed || files.project === null
        ? null
        : createPack(files.project, packRecords(records, known.types, kitted), Object.fromEntries(scripts.compiled)),
    usedBy: validation.usedBy,
    records: records.length,
    dataTypes: known.data,
  };
}

// Any order will do: validation's output doesn't depend on it, and the pack hash is canonical.
async function readRecords(
  source: ProjectSource,
  files: readonly ListedRecord[],
  report: (r: Report) => void,
): Promise<RecordInput[]> {
  return Promise.all(files.map((file) => readRecord(source, file, report)));
}

async function readRecord(source: ProjectSource, { type, id, file }: ListedRecord, report: (r: Report) => void) {
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
    pack[type][id] = schema ? packValue(schema, value, options) : value;
  }
  return pack;
}
