/**
 * What forms need to know about the open project besides the record on screen: its types from
 * types/, the records there are of each type, and the files under assets/, read as the compiler
 * reads them (readProjectFiles), with the problems it finds there. It is read again after every
 * change, beside the Project panel's summary (projects/opened.ts).
 */
import { type ProjectSource, RECORDS_DIR, readProjectFiles, type TypeReport } from '@eb/compiler';
import type { DataType, Diagnostic, RecordType } from '@eb/schema';

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
  /**
   * The problems with the project's files that aren't one record's (M2.8): project.json, types/,
   * files under records/ that aren't records, and the assets' log. The record index has the rest.
   */
  readonly problems: readonly Diagnostic[];
}

export const EMPTY_CATALOG: Catalog = {
  types: new Map(),
  broken: new Map(),
  names: [],
  records: new Map(),
  assets: [],
  assetsLog: undefined,
  recordTypes: [],
  problems: [],
};

// UTF-16 order, the same in every locale, as the compiler sorts.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function readCatalog(source: ProjectSource): Promise<Catalog> {
  const read = await readProjectFiles(source, []);
  const known = read.types;
  const broken = new Map<string, TypeReport>();
  for (const { code, message, file = '', path } of read.diagnostics) {
    const type = /^types\/([^/]+)\.json$/.exec(file)?.[1];
    if (type !== undefined && known.unchecked.has(type) && !broken.has(type))
      broken.set(type, { code, message, file, path });
  }
  const records = new Map<string, string[]>();
  for (const { type, id } of read.recordFiles) {
    const ids = records.get(type) ?? [];
    ids.push(id);
    records.set(type, ids);
  }
  for (const ids of records.values()) ids.sort(byText);
  const assets = [...read.assets].sort(byText);
  const names = [...new Set([...known.types.map((t) => t.type), ...records.keys()])].sort(byText);
  const log = read.assetsLog;
  return {
    types: known.data,
    broken,
    names,
    records,
    assets,
    assetsLog: log?.ok ? log.value : undefined,
    ...(log && !log.ok ? { logProblem: log.message } : {}),
    recordTypes: known.types,
    problems: read.diagnostics,
  };
}

export const recordFile = (type: string, id: string): string => `${RECORDS_DIR}/${type}/${id}.json`;
