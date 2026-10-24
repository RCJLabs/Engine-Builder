/**
 * What the view's models draw from (M5.5), apart from how the editor reads it (liveModels.ts), so
 * the walk's stage (M5.8) can make the same from a pack's world without the editor's project code.
 */
import type { ModelSources } from '@eb/compiler';
import type { MaterialRecord } from '@eb/schema';

export interface ModelFileRead {
  readonly bytes: Uint8Array;
  /** A .gltf's files by the name it gives them, those that are there. */
  readonly beside: ReadonlyMap<string, Uint8Array>;
  /** The bytes' SHA-256, the files beside them included. */
  readonly hash: string;
}

export interface LiveModels {
  /** Each record read, by "type:id": those placed, and the models they draw as. */
  readonly records: ReadonlyMap<string, unknown>;
  /** The model field of each placed type that has one. */
  readonly fields: ReadonlyMap<string, string>;
  /** Each model file named, by its path inside assets/, or null when it isn't there. */
  readonly files: ReadonlyMap<string, ModelFileRead | null>;
  /** Each material record named, or null when it isn't there or isn't one. */
  readonly materials: ReadonlyMap<string, MaterialRecord | null>;
  /** All of it in one string, which changes when anything the view draws from does. */
  readonly key: string;
}

export const sourcesOf = (models: Pick<LiveModels, 'records' | 'fields'>): ModelSources => ({
  record: (key) => models.records.get(key),
  field: (type) => models.fields.get(type) ?? null,
});
