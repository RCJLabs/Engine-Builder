/**
 * What compileProject reads and checks before it validates the records (M2.8): project.json,
 * types/, which files under records/ are records, the files under assets/ and their provenance
 * log. The editor reads the same (forms/catalog.ts) and adds its record index's checks, so its
 * Problems panel and `eb validate` give the same list.
 */
import type { CalendarDef, PackProject } from '@eb/core';
import { checkProvenance, type Diagnostic, type DiagnosticCode, type RecordType, severityOf } from '@eb/schema';
import { type ParsedFile, parseJsonFile } from './decode.ts';
import { ASSETS_DIR, ASSETS_LOG, classifyRecordFile, MANIFEST_FILE, RECORDS_DIR } from './layout.ts';
import { checkManifest } from './manifest.ts';
import type { ProjectSource } from './source.ts';
import { classifySpaceFile, SPACES_DIR } from './spaceFiles.ts';
import { type ProjectTypes, readTypes } from './types.ts';

export interface Report {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly file: string;
  readonly path: string;
  readonly type?: string;
  readonly id?: string;
}

/** A report as a diagnostic, its severity from its code. */
export const diagnosticOf = ({ code, message, type, id, file, path }: Report): Diagnostic => ({
  code,
  severity: severityOf(code),
  message,
  ...(type === undefined ? {} : { type, id }),
  file,
  path,
});

/** A file under records/ that is a record: records/<type>/<id>.json. */
export interface ListedRecord {
  readonly type: string;
  readonly id: string;
  readonly file: string;
}

export interface ProjectFilesRead {
  /** Null when project.json is missing or unsound. */
  readonly project: PackProject | null;
  /** The kits on (M3.3, D41), in the engine's order: none when project.json is unsound. */
  readonly kits: readonly string[];
  /** project.json's calendar, with the time kit on and the calendar sound (M3.5, D43). */
  readonly calendar?: CalendarDef;
  /** project.json's start-space (M5.9, D71), as written: E075 checks it against the spaces. */
  readonly startSpace?: string;
  readonly types: ProjectTypes;
  /** The record files, as the source lists them. Their contents aren't read. */
  readonly recordFiles: readonly ListedRecord[];
  /** The files under assets/, as paths inside it, for asset fields to name. The provenance log isn't one. */
  readonly assets: ReadonlySet<string>;
  /** The provenance log as read (D34), or undefined when there is none. */
  readonly assetsLog: ParsedFile | undefined;
  /**
   * Every problem with them, in no order: E007 to E010, E015 to E017, E019 to E021, E033, E034,
   * E037, W101 and W105 to W107. A record that isn't JSON is the records' check's (E007), as are
   * its fields.
   */
  readonly diagnostics: readonly Diagnostic[];
}

export async function readProjectFiles(
  source: ProjectSource,
  codeTypes: readonly RecordType[],
): Promise<ProjectFilesRead> {
  const diagnostics: Diagnostic[] = [];
  const report = (r: Report) => diagnostics.push(diagnosticOf(r));
  const { project, startSpace } = await readManifestFile(source, report);
  const kits = project?.kits ?? [];
  const types = await readTypes(source, codeTypes, report, kits);
  const assets = await readAssets(source);
  const assetsLog = await checkAssetsLog(source, assets, report);
  const recordFiles = await listRecords(source, report);
  const calendar = project?.calendar;
  return {
    project,
    kits,
    ...(calendar ? { calendar } : {}),
    ...(startSpace !== undefined ? { startSpace } : {}),
    types,
    recordFiles,
    assets,
    assetsLog,
    diagnostics,
  };
}

/** What a game's kits are built from: the kits on, and the time kit's calendar. */
export interface KitSettings {
  readonly kits: readonly string[];
  readonly calendar?: CalendarDef;
  /** The project has a space: its game has the world module (M5.8, D70). */
  readonly spaces?: true;
}

/** The kits project.json turns on and its calendar, for a caller that reads nothing else: none when it is missing or unsound. */
export async function readKitSettings(source: ProjectSource): Promise<KitSettings> {
  const { project } = await readManifestFile(source, () => {});
  const spaces = (await source.files(SPACES_DIR)).some((path) => classifySpaceFile(path).kind === 'space');
  return {
    kits: project?.kits ?? [],
    ...(project?.calendar ? { calendar: project.calendar } : {}),
    ...(spaces ? { spaces } : {}),
  };
}

async function readManifestFile(
  source: ProjectSource,
  report: (r: Report) => void,
): Promise<{ project: PackProject | null; startSpace?: string }> {
  const file = MANIFEST_FILE;
  const bytes = await source.read(file);
  if (bytes === undefined) {
    report({ code: 'E008', message: 'Missing project.json', file, path: '' });
    return { project: null };
  }
  const parsed = parseJsonFile(bytes);
  if (!parsed.ok) {
    report({ code: 'E007', message: parsed.message, file, path: '' });
    return { project: null };
  }
  const { problems, ...read } = checkManifest(parsed.value);
  for (const problem of problems) report({ ...problem, file });
  return read;
}

async function readAssets(source: ProjectSource): Promise<ReadonlySet<string>> {
  const prefix = `${ASSETS_DIR}/`;
  const files = (await source.files(ASSETS_DIR)).filter((path) => path !== ASSETS_LOG);
  return new Set(files.map((path) => path.slice(prefix.length)));
}

/**
 * The assets' provenance (D34): every file logged, under a licence that passes. A log that isn't
 * JSON is one E007, not an E019 for every file it would have covered.
 */
async function checkAssetsLog(
  source: ProjectSource,
  assets: ReadonlySet<string>,
  report: (r: Report) => void,
): Promise<ParsedFile | undefined> {
  const bytes = await source.read(ASSETS_LOG);
  const parsed = bytes === undefined ? undefined : parseJsonFile(bytes);
  if (parsed && !parsed.ok) {
    report({ code: 'E007', message: parsed.message, file: ASSETS_LOG, path: '' });
    return parsed;
  }
  for (const issue of checkProvenance(parsed?.value, assets)) {
    const file = issue.asset === undefined ? ASSETS_LOG : `${ASSETS_DIR}/${issue.asset}`;
    report({ code: issue.code, message: issue.message, file, path: issue.path });
  }
  return parsed;
}

/** The record files under records/, and a problem for each file there that isn't one. */
async function listRecords(source: ProjectSource, report: (r: Report) => void): Promise<ListedRecord[]> {
  const found: ListedRecord[] = [];
  for (const file of await source.files(RECORDS_DIR)) {
    const role = classifyRecordFile(file);
    if (role.kind === 'ignored') {
      report({ code: 'W101', message: 'Ignored: record files are records/<type>/<id>.json', file, path: '' });
    } else if (role.kind === 'misplaced') {
      report({ code: 'E010', message: 'A record file must sit at records/<type>/<id>.json', file, path: '' });
    } else found.push({ type: role.type, id: role.id, file });
  }
  return found;
}
