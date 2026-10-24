/**
 * The model records' file checks in the editor (M5.5, D67, docs/specs/models.md#the-checks): each
 * model's file read as far as its glTF JSON, for E070 and W146, as compileProject checks them
 * (checkModels). Read again after every change, once the record index is, since the file can
 * change without the record.
 */
import { checkModels, type ProjectSource } from '@eb/compiler';
import { type Diagnostic, MODEL, type RecordInput } from '@eb/schema';
import type { Catalog } from '../forms/catalog.ts';
import type { RecordIndex } from '../records/recordIndex.ts';

export async function modelProblems(
  source: ProjectSource,
  catalog: Catalog,
  index: RecordIndex,
): Promise<Diagnostic[]> {
  const models: RecordInput[] = [];
  for (const record of index.records.values()) {
    if (record.type !== MODEL) continue;
    const { type, id, file } = record;
    models.push(
      record.unreadable === undefined
        ? { type, id, file, value: record.value }
        : { type, id, file, value: undefined, unreadable: true },
    );
  }
  return models.length === 0 ? [] : checkModels(source, models, new Set(catalog.assets));
}
