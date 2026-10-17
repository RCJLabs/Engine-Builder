import { isRecordId } from '@eb/core';
import { parse } from './doubts.ts';
import type { Store } from './store.ts';

/**
 * A slot as a list shows it. `readable` is false when the summary written beside the save can't
 * be read: the save itself may still load, and the slot is listed rather than hidden, so the
 * player never writes over a save they couldn't see.
 */
export type SlotSummary =
  | {
      readonly slot: string;
      readonly readable: true;
      readonly savedAt: number;
      readonly build: string;
      readonly summary: Readonly<Record<string, unknown>>;
    }
  | { readonly slot: string; readonly readable: false };

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every slot that holds a save, read from the summaries rather than the saves, which may be large. */
export async function listSlots(store: Store, prefix: string): Promise<SlotSummary[]> {
  const listed: SlotSummary[] = [];
  for (const key of await store.keys(`${prefix}slot/`)) {
    const slot = key.slice(`${prefix}slot/`.length);
    // Not a key this package wrote: a slot name is a kebab-case id.
    if (!isRecordId(slot)) continue;
    const info = parse(await store.get(`${prefix}summary/${slot}`));
    const readable =
      isObject(info) &&
      typeof info.savedAt === 'number' &&
      Number.isFinite(info.savedAt) &&
      typeof info.build === 'string' &&
      isObject(info.summary);
    listed.push(
      readable
        ? {
            slot,
            readable,
            savedAt: info.savedAt as number,
            build: info.build as string,
            summary: info.summary as Record<string, unknown>,
          }
        : { slot, readable: false },
    );
  }
  return listed.sort(newestFirst);
}

// Readable slots by time, newest first; then the unreadable ones, which have none. Ties by name.
function newestFirst(a: SlotSummary, b: SlotSummary): number {
  if (a.readable !== b.readable) return a.readable ? -1 : 1;
  const byTime = a.readable && b.readable ? b.savedAt - a.savedAt : 0;
  return byTime || (a.slot < b.slot ? -1 : 1);
}
