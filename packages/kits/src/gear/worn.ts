/** What an actor wears now, and the sums of what it does to a stat. */
import type { DeepReadonly, RecordStore } from '@eb/core';
import { ITEM } from '../inventory/types.ts';
import type { Part } from '../stats/values.ts';
import { actorRecord } from '../stats/values.ts';
import type { GearSlice, WearableItem, WearingActor } from './types.ts';

/** The item's record, with the gear kit's fields, or a thrown error. */
export function wearable(content: RecordStore, id: unknown): WearableItem {
  if (typeof id !== 'string' || !content.has(ITEM, id)) throw new Error(`No item "${String(id)}"`);
  return content.get(ITEM, id) as WearableItem;
}

export const wearer = (content: RecordStore, id: unknown): WearingActor => actorRecord(content, id) as WearingActor;

/** By slot, in slot order: the record's `wears`, with what the state changed. */
export function wornBy(content: RecordStore, slice: DeepReadonly<GearSlice>, actor: string): [string, string][] {
  const worn: Record<string, string | null> = { ...(wearer(content, actor).wears ?? {}), ...(slice.worn[actor] ?? {}) };
  return Object.keys(worn)
    .sort()
    .flatMap((slot): [string, string][] => {
      const item = worn[slot];
      return typeof item === 'string' ? [[slot, item]] : [];
    });
}

/** What each worn item does to the stat, one part an item that touches it. */
export function gearParts(content: RecordStore, slice: DeepReadonly<GearSlice>, actor: string, stat: string): Part[] {
  const parts: Part[] = [];
  for (const [, item] of wornBy(content, slice, actor)) {
    const touching = (wearable(content, item).modifiers ?? []).filter((m) => m.stat === stat);
    if (touching.length === 0) continue;
    const add = touching.reduce((sum, m) => sum + (m.add ?? 0), 0);
    const percent = touching.reduce((sum, m) => sum + (m.percent ?? 0), 0);
    parts.push({ kind: 'item', id: item, add, percent });
  }
  return parts;
}
