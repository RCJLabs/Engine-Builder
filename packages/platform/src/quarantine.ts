import { parse, type QuarantineReason } from './doubts.ts';
import type { Store } from './store.ts';

export interface Quarantined {
  readonly key: string;
  readonly slot: string;
  readonly problem: QuarantineReason;
  readonly message: string;
  /** The save exactly as it was found. */
  readonly raw: string;
}

/**
 * Quarantine under `<prefix>quarantine/<slot>/<nnnn>`: copies of saves kept before anything
 * could lose them. Nothing here removes one; that is the player's to do, after exporting it.
 */
export function quarantineIn(store: Store, prefix: string) {
  return {
    /** The entries that keep `raw`, and its key; no entries when an earlier copy already holds it. */
    async entryFor(slot: string, raw: string, problem: QuarantineReason, message: string) {
      const existing = await store.keys(`${prefix}quarantine/${slot}/`);
      for (const key of existing) {
        const entry = parse(await store.get(key)) as { raw?: unknown } | undefined;
        if (entry?.raw === raw) return { key, entries: {} };
      }
      // Skipping keys in use, so an entry removed by hand never gets another written over it.
      const taken = new Set(existing);
      const keyAt = (n: number) => `${prefix}quarantine/${slot}/${String(n).padStart(4, '0')}`;
      let n = existing.length;
      while (taken.has(keyAt(n))) n++;
      const key = keyAt(n);
      return { key, entries: { [key]: JSON.stringify({ slot, problem, message, raw }) } };
    },

    async list(): Promise<Quarantined[]> {
      const entries: Quarantined[] = [];
      for (const key of await store.keys(`${prefix}quarantine/`)) {
        const entry = parse(await store.get(key)) as Omit<Quarantined, 'key'> | undefined;
        if (entry) entries.push({ key, ...entry });
      }
      return entries;
    },
  };
}
