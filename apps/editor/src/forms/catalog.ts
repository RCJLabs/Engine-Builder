/**
 * What forms need to know about the open project besides the record on screen: its types from
 * types/, the records there are of each type, and the files under assets/. It is read again after
 * every change, beside the Project panel's summary (projects/opened.ts).
 */
import {
  ASSETS_DIR,
  ASSETS_LOG,
  classifyRecordFile,
  type ProjectSource,
  parseJsonFile,
  RECORDS_DIR,
  readTypes,
  type TypeReport,
} from '@eb/compiler';
import type { DataType, RecordType } from '@eb/schema';

export interface Catalog {
  /** The project's types whose files are sound, by name. */
  readonly types: ReadonlyMap<string, DataType>;
  /** What is wrong with each type file that has problems, by type: its first problem. */
  readonly broken: ReadonlyMap<string, TypeReport>;
  /** Every type that types/ or records/ names, sorted. */
  readonly names: readonly string[];
  /** Record ids by type, sorted. */
  readonly records: ReadonlyMap<string, readonly string[]>;
  /** Paths inside assets/, sorted: every file there but the provenance log. */
  readonly assets: readonly string[];
  /**
   * The assets' provenance log (D34, M2.7): its JSON, or undefined when there is none; `logProblem`
   * says why when it can't be read.
   */
  readonly assetsLog: unknown;
  readonly logProblem?: string;
  /** Every type for validation, stand-ins for broken ones included. */
  readonly recordTypes: readonly RecordType[];
}

export const EMPTY_CATALOG: Catalog = {
  types: new Map(),
  broken: new Map(),
  names: [],
  records: new Map(),
  assets: [],
  assetsLog: undefined,
  recordTypes: [],
};

// UTF-16 order, the same in every locale, as the compiler sorts.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function readCatalog(source: ProjectSource): Promise<Catalog> {
  const reports: TypeReport[] = [];
  const known = await readTypes(source, [], (report) => reports.push(report));
  const broken = new Map<string, TypeReport>();
  for (const report of reports) {
    const type = /^types\/([^/]+)\.json$/.exec(report.file)?.[1];
    if (type !== undefined && known.unchecked.has(type) && !broken.has(type)) broken.set(type, report);
  }
  const records = new Map<string, string[]>();
  for (const path of await source.files(RECORDS_DIR)) {
    const role = classifyRecordFile(path);
    if (role.kind !== 'record') continue;
    const ids = records.get(role.type) ?? [];
    ids.push(role.id);
    records.set(role.type, ids);
  }
  for (const ids of records.values()) ids.sort(byText);
  const prefix = `${ASSETS_DIR}/`;
  const assets = (await source.files(ASSETS_DIR))
    .filter((path) => path !== ASSETS_LOG)
    .map((path) => path.slice(prefix.length))
    .sort(byText);
  const names = [...new Set([...known.types.map((t) => t.type), ...records.keys()])].sort(byText);
  const log = await readLog(source);
  return { types: known.data, broken, names, records, assets, ...log, recordTypes: known.types };
}

/** The provenance log as read: its JSON, nothing when there is none, or why it can't be read. */
async function readLog(source: ProjectSource): Promise<{ assetsLog: unknown; logProblem?: string }> {
  const bytes = await source.read(ASSETS_LOG);
  if (bytes === undefined) return { assetsLog: undefined };
  const parsed = parseJsonFile(bytes);
  return parsed.ok ? { assetsLog: parsed.value } : { assetsLog: undefined, logProblem: parsed.message };
}

export const recordFile = (type: string, id: string): string => `${RECORDS_DIR}/${type}/${id}.json`;
