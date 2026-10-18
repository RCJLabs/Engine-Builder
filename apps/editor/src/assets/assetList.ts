/**
 * What the Assets panel lists (M2.7): every file under assets/ with its kind, its log entry and
 * the provenance problems that are its own, filtered and searched as plain functions. The
 * problems are the compiler's: checkProvenance is the function compileProject reports from.
 */
import { ASSETS_LOG } from '@eb/compiler';
import { pointerKeys, pointerSegment } from '@eb/core';
import { type AssetKind, checkProvenance, type Diagnostic, kindOfAsset, severityOf } from '@eb/schema';
import type { Catalog } from '../forms/catalog.ts';
import { assetFile } from './assetEdits.ts';
import { entryOf } from './assetLog.ts';

export interface AssetRow {
  /** Inside assets/. */
  readonly path: string;
  readonly kind: AssetKind | undefined;
  readonly entry: unknown;
  /** Its own: E019, its entry's E020 and E021, W107; each `path` points into its entry. */
  readonly problems: readonly Diagnostic[];
}

export interface AssetProblems {
  /** By path inside assets/, each pointing into the asset's entry ('' for the asset as a whole). */
  readonly byAsset: ReadonlyMap<string, readonly Diagnostic[]>;
  /** Entries for files that aren't there (W106), by path inside assets/. */
  readonly orphans: readonly string[];
  /** The log's own: E021 outside any entry, or E007 when it isn't JSON. */
  readonly log: readonly Diagnostic[];
}

const ENTRY = /^\/files\/([^/]*)(.*)$/;

/** The provenance problems of the catalog's assets, each where the panel shows it. */
export function assetProblems(catalog: Catalog): AssetProblems {
  if (catalog.logProblem !== undefined) {
    return {
      byAsset: new Map(),
      orphans: [],
      log: [{ code: 'E007', severity: 'error', message: catalog.logProblem, file: ASSETS_LOG, path: '' }],
    };
  }
  const assets = new Set(catalog.assets);
  const byAsset = new Map<string, Diagnostic[]>();
  const orphans: string[] = [];
  const log: Diagnostic[] = [];
  for (const issue of checkProvenance(catalog.assetsLog, assets)) {
    const match = ENTRY.exec(issue.path);
    const asset = issue.asset ?? (match ? pointerKeys(`/${match[1]}`)[0] : undefined);
    const diagnostic: Diagnostic = {
      code: issue.code,
      severity: severityOf(issue.code),
      message: issue.message,
      file: issue.asset === undefined ? ASSETS_LOG : assetFile(issue.asset),
      path: issue.asset !== undefined ? '' : match ? (match[2] ?? '') : issue.path,
    };
    if (asset === undefined) log.push(diagnostic);
    else if (!assets.has(asset)) {
      if (issue.code === 'W106') orphans.push(asset);
    } else byAsset.set(asset, [...(byAsset.get(asset) ?? []), diagnostic]);
  }
  return { byAsset, orphans, log };
}

/** Every asset as a row, in path order. */
export function assetRows(catalog: Catalog, problems: AssetProblems): AssetRow[] {
  return catalog.assets.map((path) => ({
    path,
    kind: kindOfAsset(path),
    entry: entryOf(catalog.assetsLog, path),
    problems: problems.byAsset.get(path) ?? [],
  }));
}

export type KindFilter = 'all' | AssetKind | 'other';

export interface AssetView {
  readonly search: string;
  readonly kind: KindFilter;
  /** Only the assets with a problem of their own. */
  readonly troubled: boolean;
}

export const ALL_ASSETS: AssetView = { search: '', kind: 'all', troubled: false };

/** The words a search looks in: the path, and who made it, under what licence, from where. */
function haystack(row: AssetRow): string {
  const entry = typeof row.entry === 'object' && row.entry !== null ? (row.entry as Record<string, unknown>) : {};
  const said = ['licence', 'author', 'source'].map((key) => (typeof entry[key] === 'string' ? entry[key] : ''));
  return [row.path, ...said].join('\n').toLowerCase();
}

/** The rows a view shows, in path order. A search matches every word, in any order. */
export function shownRows(rows: readonly AssetRow[], view: AssetView): AssetRow[] {
  const words = view.search.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(
    (row) =>
      (view.kind === 'all' || (view.kind === 'other' ? row.kind === undefined : row.kind === view.kind)) &&
      (!view.troubled || row.problems.length > 0) &&
      (words.length === 0 || words.every((word) => haystack(row).includes(word))),
  );
}

/** A pointer into the log at `pointer` inside the entry for `path`. */
export const logPointer = (path: string, pointer: string): string => `/files/${pointerSegment(path)}${pointer}`;
