/**
 * What forms need to know about the open project besides the record on screen: its types from
 * types/, the records there are of each type, and the files under assets/. It is read again after
 * every change, beside the Project panel's summary (projects/opened.ts).
 */
import {
  ASSETS_DIR,
  classifyRecordFile,
  type ProjectSource,
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
  /** Paths inside assets/, sorted. */
  readonly assets: readonly string[];
  /** Every type for validation, stand-ins for broken ones included. */
  readonly recordTypes: readonly RecordType[];
}

export const EMPTY_CATALOG: Catalog = {
  types: new Map(),
  broken: new Map(),
  names: [],
  records: new Map(),
  assets: [],
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
  const assets = (await source.files(ASSETS_DIR)).map((path) => path.slice(prefix.length)).sort(byText);
  const names = [...new Set([...known.types.map((t) => t.type), ...records.keys()])].sort(byText);
  return { types: known.data, broken, names, records, assets, recordTypes: known.types };
}

export const recordFile = (type: string, id: string): string => `${RECORDS_DIR}/${type}/${id}.json`;
