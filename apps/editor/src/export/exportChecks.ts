/**
 * export.json's problems in the editor (M4.10, D60): checked as compileProject checks it
 * (checkExport), over the catalog and the record index, so Problems lists what `eb validate` does.
 * Read again after every change, once the index is, since an edition's E055 comes from its used-by.
 */
import { checkExport, EXPORT_FILE, type ProjectSource, parseJsonFile } from '@eb/compiler';
import type { Diagnostic } from '@eb/schema';
import type { Catalog } from '../forms/catalog.ts';
import type { RecordIndex } from '../records/recordIndex.ts';

export async function exportProblems(
  source: ProjectSource,
  catalog: Catalog,
  index: RecordIndex,
): Promise<Diagnostic[]> {
  const bytes = await source.read(EXPORT_FILE);
  if (bytes === undefined) return [];
  const parsed = parseJsonFile(bytes);
  if (!parsed.ok) return [{ code: 'E007', severity: 'error', message: parsed.message, file: EXPORT_FILE, path: '' }];
  const records = new Set(index.records.keys());
  return [
    ...checkExport(parsed.value, {
      types: new Set(catalog.recordTypes.map((t) => t.type)),
      records,
      scenes: catalog.scenes,
      assets: new Set(catalog.assets),
      usedBy: index.usedBy,
      assetsUsedBy: index.assetUsers,
    }).diagnostics,
  ];
}
