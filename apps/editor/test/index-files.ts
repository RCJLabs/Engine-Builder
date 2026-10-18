/**
 * The ludus fixture as files for the record index's tests: a project whose files change between
 * reads, as a working copy's do, and what a table shows of an index.
 */
import type { ProjectSource } from '@eb/compiler';
import { FIXTURE_LUDUS, readFixture } from '../../../packages/compiler/test/fixture.ts';
import { readCatalog } from '../src/forms/catalog.ts';
import { EMPTY_INDEX, type RecordIndex, updateIndex } from '../src/records/recordIndex.ts';

/**
 * The ludus project as files that change between reads, as a working copy's do. `reversed` lists
 * them backwards: OPFS promises no order.
 */
export function project(reversed = false) {
  const encoder = new TextEncoder();
  const files = new Map(Object.entries(readFixture(FIXTURE_LUDUS)).map(([path, text]) => [path, encoder.encode(text)]));
  const source: ProjectSource = {
    files: async (dir) => {
      const found = [...files.keys()].filter((path) => dir === '' || path.startsWith(`${dir}/`));
      return reversed ? found.reverse() : found;
    },
    read: async (path) => files.get(path),
  };
  let index: RecordIndex = EMPTY_INDEX;
  return {
    source,
    write: (path: string, text: string | null) => {
      if (text === null) files.delete(path);
      else files.set(path, encoder.encode(text));
    },
    edit: (path: string, change: (value: Record<string, unknown>) => void) => {
      const value = JSON.parse(new TextDecoder().decode(files.get(path)));
      change(value);
      files.set(path, encoder.encode(JSON.stringify(value)));
    },
    /** The index after `paths` changed (all of them when null), and the index read afresh. */
    update: async (paths: readonly string[] | null) => {
      const catalog = await readCatalog(source);
      index = await updateIndex(index, source, catalog, paths);
      return { index, fresh: await updateIndex(EMPTY_INDEX, source, catalog, null) };
    },
  };
}

export const problemsOf = (index: RecordIndex, key: string) =>
  index.records.get(key)?.problems.map((d) => `${d.code} ${d.path}: ${d.message}`);

/** What a table shows of the index, to compare an updated index with one read afresh. */
export const shown = (index: RecordIndex) => ({
  records: [...index.records.values()].map(({ key, value, checked, problems, refs, assets }) => ({
    key,
    value,
    checked,
    problems,
    refs,
    assets,
  })),
  usedBy: Object.fromEntries(index.usedBy),
  assetUsers: Object.fromEntries(index.assetUsers),
});
