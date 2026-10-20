/** The maps kit's records, read by id: validation stops content naming one that isn't there (E005, E035, E053). */
import type { RecordStore } from '@eb/core';
import { type KindNames, MAP, type MapRecord, NODE_KIND, type NodeKindRecord } from './types.ts';

export function mapRecord(content: RecordStore, id: unknown): MapRecord {
  if (typeof id !== 'string' || !content.has(MAP, id)) throw new Error(`No map "${String(id)}"`);
  return content.get(MAP, id) as MapRecord;
}

export function kindRecord(content: RecordStore, id: unknown): NodeKindRecord {
  if (typeof id !== 'string' || !content.has(NODE_KIND, id)) throw new Error(`No node kind "${String(id)}"`);
  return content.get(NODE_KIND, id) as NodeKindRecord;
}

/** What the generator reads of each kind, from the content. */
export const kindNames =
  (content: RecordStore): KindNames =>
  (kind) =>
    kindRecord(content, kind);
