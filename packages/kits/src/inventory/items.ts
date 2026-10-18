/** Items as both kits read them: the record, and how many more fit in the bag. */
import type { RecordStore } from '@eb/core';
import { ITEM, type ItemRecord } from './types.ts';

/** The item's record, or a thrown error: validation stops a reference to a missing item. */
export function itemRecord(content: RecordStore, id: unknown): ItemRecord {
  if (typeof id !== 'string' || !content.has(ITEM, id)) throw new Error(`No item "${String(id)}"`);
  return content.get(ITEM, id) as ItemRecord;
}

/** How many of `count` fit beside `have` under the item's limit: what doesn't is lost. */
export function room(item: ItemRecord, have: number, count: number): number {
  return item.max === undefined ? count : Math.min(count, Math.max(0, item.max - have));
}
