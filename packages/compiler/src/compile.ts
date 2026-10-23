import { createPack, type Pack, type RecordIndex } from '@eb/core';
import { TALK } from '@eb/kits';
import {
  compareDiagnostics,
  type DataType,
  type Diagnostic,
  knownFrom,
  packValue,
  type RecordInput,
  type RecordType,
  recordFieldsOf,
  type Usage,
  type ValidateOptions,
  validateRecords,
} from '@eb/schema';
import { audioFiles } from './audioFiles.ts';
import { creditsOf } from './credits.ts';
import { parseJsonFile } from './decode.ts';
import { checkExport } from './exportCheck.ts';
import { EXPORT_FILE } from './exportFile.ts';
import { checkGuide, GUIDE_FILE } from './guide.ts';
import { diagnosticOf, type ListedRecord, type Report, readProjectFiles } from './projectCheck.ts';
import { projectFiles } from './projectZip.ts';
import { atSceneLine, readScenes } from './scenes.ts';
import { readScripts } from './scripts.ts';
import type { ProjectSource } from './source.ts';
import { checkProjectSpaces, readSpaces } from './spaces.ts';
import { checkProjectUi, packUi, readUi } from './ui.ts';

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

/** What a project is checked against: validation's options, and the game's actions and modes for its screens (M4.1). */
export interface CompileOptions extends Omit<ValidateOptions, 'assets'> {
  /** The game's actions, as "module/verb": what a screen's buttons may take. Without them, unchecked. */
  readonly actions?: readonly string[];
  /** The game's modes, its kits' among them: what screens show. Without them, unchecked. */
  readonly modes?: readonly string[];
}

/**
 * Reads, checks and packs a project. The same files give the same diagnostics and the same pack
 * hash in the editor and in the CLI, whatever order the source lists them in. `types` are the
 * game's code types, which the project's own types/ join; `options.facts` is the game's fact
 * catalog, for checking the conditions in records. Scripts are checked without being run, and
 * the ones scripts/game.ts reaches go into the pack (M3.2): running them is the caller's choice.
 * Each scene under scenes/ is compiled into a talk, which is checked and packed as one (M3.11).
 * The screens under ui/ are checked against the game and packed as they are (M4.1), the feedback
 * (M4.2) and the shell (M4.3) with them; the assets' credits from the provenance log too (M4.4).
 * export.json's targets and editions are checked against the records (M4.10), but never packed.
 */
export async function compileProject(
  source: ProjectSource,
  types: readonly RecordType[],
  options: CompileOptions = {},
): Promise<CompileResult> {
  const files = await readProjectFiles(source, types);
  const scripts = await readScripts(source);
  const known = files.types;
  const { actions, modes, ...validate } = options;
  const kitted = { ...validate, kits: files.kits, ...(files.calendar ? { calendar: files.calendar } : {}) };
  const grounds = knownFrom(kitted);
  const scenes = await readScenes(source, grounds.facts, files.kits);
  const ui = await readUi(source);
  const spaces = await readSpaces(source);
  const diagnostics: Diagnostic[] = [
    ...files.diagnostics,
    ...scripts.diagnostics,
    ...scenes.diagnostics,
    ...ui.diagnostics,
    ...spaces.diagnostics,
    ...checkProjectSpaces(spaces.files),
  ];
  // A scene beside a talk record of its id is E004 at both, and isn't checked: one problem, as the editor has it.
  const talks = new Set(files.recordFiles.filter((r) => r.type === TALK).map((r) => r.id));
  const records = [
    ...(await readRecords(source, files.recordFiles, (r) => diagnostics.push(diagnosticOf(r)))),
    ...scenes.records.map((scene) => (talks.has(scene.id) ? { ...scene, unreadable: true } : scene)),
  ].map((record) => (known.unchecked.has(record.type) ? { ...record, unreadable: true } : record));
  const validation = validateRecords(known.types, records, { ...kitted, assets: files.assets });
  diagnostics.push(...validation.diagnostics.map((d) => atSceneLine(d, scenes.maps)));
  const exported = await readJsonFile(source, EXPORT_FILE, (d) => diagnostics.push(d));
  const checked = checkExport(exported, {
    types: new Set(known.types.map((t) => t.type)),
    records: new Set(records.map((r) => `${r.type}:${r.id}`)),
    scenes: new Set(scenes.records.map((r) => r.id)),
    assets: files.assets,
    usedBy: validation.usedBy,
    assetsUsedBy: validation.assetsUsedBy,
  });
  diagnostics.push(...checked.diagnostics.map((d) => atSceneLine(d, scenes.maps)));
  const guide = await readJsonFile(source, GUIDE_FILE, (d) => diagnostics.push(d));
  if (guide !== undefined) {
    const present = new Set(await projectFiles(source));
    diagnostics.push(...checkGuide(guide, (file) => present.has(file)).diagnostics);
  }
  diagnostics.push(
    ...checkProjectUi(ui, {
      facts: grounds.facts,
      openFacts: grounds.openFacts,
      kits: files.kits,
      ...(actions !== undefined ? { actions } : {}),
      ...(modes !== undefined ? { modes } : {}),
      ...(validate.events !== undefined ? { events: validate.events } : {}),
      records: indexOf(records),
      assets: files.assets,
      recordFields: recordFieldsOf(known.types),
    }),
  );
  diagnostics.sort(compareDiagnostics);
  const failed = files.project === null || diagnostics.some((d) => d.severity === 'error');
  const packedUi = packUi(ui);
  const audio = failed ? {} : await audioFiles(source, records);
  return {
    diagnostics,
    pack:
      failed || files.project === null
        ? null
        : createPack(
            files.project,
            packRecords(records, known.types, kitted),
            Object.fromEntries(scripts.compiled),
            packedUi,
            // Credits travel with the screens that can show them: a game without any keeps its pack.
            packedUi === undefined ? undefined : creditsOf(files.assetsLog, files.assets),
            audio,
          ),
    usedBy: validation.usedBy,
    records: records.length,
    dataTypes: known.data,
  };
}

/** export.json's (M4.10) or guide.json's (M4.11) value, or undefined when there is none or it isn't JSON (E007). */
async function readJsonFile(source: ProjectSource, file: string, report: (d: Diagnostic) => void): Promise<unknown> {
  const bytes = await source.read(file);
  if (bytes === undefined) return undefined;
  const parsed = parseJsonFile(bytes);
  if (parsed.ok) return parsed.value;
  report({ code: 'E007', severity: 'error', message: parsed.message, file, path: '' });
  return undefined;
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

/** The records by type and id, for the facts screens read whose arguments name one. */
function indexOf(records: readonly RecordInput[]): RecordIndex {
  const byType = new Map<string, Set<string>>();
  for (const { type, id } of records) {
    const ids = byType.get(type) ?? new Set<string>();
    byType.set(type, ids.add(id));
  }
  // UTF-16 order, the same in every locale.
  return {
    ids: (type) => [...(byType.get(type) ?? [])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    has: (type, id) => byType.get(type)?.has(id) ?? false,
  };
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
