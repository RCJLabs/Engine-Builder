/** The index's records as checks look them up by type and id: a screen's facts (M4.1), a space's placed records (M5.2). */
import type { RecordIndex as RecordLookup } from '@eb/core';
import type { RecordIndex } from './recordIndex.ts';

export function recordLookup(index: RecordIndex): RecordLookup {
  const byType = new Map<string, string[]>();
  for (const { type, id } of index.records.values()) byType.set(type, [...(byType.get(type) ?? []), id]);
  return { ids: (type) => byType.get(type) ?? [], has: (type, id) => byType.get(type)?.includes(id) ?? false };
}
