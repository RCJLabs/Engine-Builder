/**
 * An import with models in it as file changes (M5.5, D67, docs/specs/models.md#import): every file
 * and every packed model's GLB written with its provenance, a GLB's with the packing added to its
 * edits, and a model record for each model that is to have one, in one step that undo takes back
 * whole. Nothing is written over: a path or a record that is there already refuses the step.
 */
import type { ProjectSource } from '@eb/compiler';
import { MODEL, type ModelRecord, type Provenance } from '@eb/schema';
import { type Incoming, importEntered } from '../assets/assetEdits.ts';
import type { FileChange } from '../editing/history.ts';
import { recordFile } from '../forms/catalog.ts';
import { createRecordFile } from '../forms/recordEdits.ts';

/** The edit a packed model's provenance entry gains. */
export const PACKED_EDIT = 'Geometry packed with Meshopt on import';

export interface PackedModel extends Incoming {
  /** The model record made for it, unless Make a model was left unticked. */
  readonly record: { readonly id: string; readonly value: ModelRecord } | null;
}

const packedEntry = (entry: Provenance): Provenance => ({ ...entry, edits: [...(entry.edits ?? []), PACKED_EDIT] });

/** The pick imported: its other files, its models' GLBs and their records, one provenance for all. */
export async function importModels(
  source: ProjectSource,
  others: readonly Incoming[],
  models: readonly PackedModel[],
  entry: Provenance,
): Promise<FileChange[]> {
  const files = [
    ...others.map((file) => ({ ...file, entry })),
    ...models.map(({ path, bytes }) => ({ path, bytes, entry: packedEntry(entry) })),
  ];
  const changes = await importEntered(source, files);
  for (const { record } of models) {
    if (record) changes.push(...(await createRecordFile(source, recordFile(MODEL, record.id), record.value)));
  }
  return changes;
}
