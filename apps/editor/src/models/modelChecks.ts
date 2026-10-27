/**
 * The model records' file checks in the editor (M5.5, D67, docs/specs/models.md#the-checks): each
 * model's file read as far as its glTF JSON, for E070 and W146, as compileProject checks them
 * (checkModels); and since M7.1 each sprite's sheet as far as its PNG header, for E091
 * (checkSprites). Read again after every change, once the record index is, since a file can
 * change without its record.
 */
import { checkModels, checkSprites, type ProjectSource } from '@eb/compiler';
import { type Diagnostic, MODEL, type RecordInput, SPRITE } from '@eb/schema';
import type { Catalog } from '../forms/catalog.ts';
import type { RecordIndex } from '../records/recordIndex.ts';

export async function modelProblems(
  source: ProjectSource,
  catalog: Catalog,
  index: RecordIndex,
): Promise<Diagnostic[]> {
  const drawn: RecordInput[] = [];
  for (const record of index.records.values()) {
    if (record.type !== MODEL && record.type !== SPRITE) continue;
    const { type, id, file } = record;
    drawn.push(
      record.unreadable === undefined
        ? { type, id, file, value: record.value }
        : { type, id, file, value: undefined, unreadable: true },
    );
  }
  if (drawn.length === 0) return [];
  const assets = new Set(catalog.assets);
  return [...(await checkModels(source, drawn, assets)), ...(await checkSprites(source, drawn, assets))];
}
