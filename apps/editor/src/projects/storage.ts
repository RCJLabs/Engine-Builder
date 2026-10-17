/** Whether the browser will keep the editor's storage, and how much of it is used. */
export { type Persistence, requestPersistence } from '@eb/platform';

export interface StorageState {
  /** True when the browser keeps the storage until the user clears it; null when it can't say. */
  readonly kept: boolean | null;
  /** Bytes used and allowed, for the whole site, as the browser estimates them. */
  readonly used: number | null;
  readonly quota: number | null;
}

type StorageLike = Pick<StorageManager, 'persisted' | 'estimate'>;

export async function storageState(
  storage: StorageLike | undefined = globalThis.navigator?.storage,
): Promise<StorageState> {
  const kept = storage?.persisted ? await storage.persisted().catch(() => null) : null;
  const estimate = storage?.estimate ? await storage.estimate().catch(() => null) : null;
  return { kept, used: estimate?.usage ?? null, quota: estimate?.quota ?? null };
}

/** 1,234,567 bytes as "1.2 MB": the units people see in their phone's storage settings. */
export function sizeText(bytes: number): string {
  if (bytes < 1000) return `${bytes} bytes`;
  const [value, unit] = bytes < 1e6 ? [bytes / 1e3, 'kB'] : bytes < 1e9 ? [bytes / 1e6, 'MB'] : [bytes / 1e9, 'GB'];
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`;
}
