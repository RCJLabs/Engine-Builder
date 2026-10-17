import { indexedDbStore } from './indexeddb.ts';
import { localStore, memoryStore, type Store } from './store.ts';

/**
 * The best storage this browser gives: IndexedDB, then localStorage, then memory. `kind` on the
 * result says which, so the stage can warn when saves won't outlive the tab (a private window
 * that refuses both, say).
 */
export async function openStore(name = 'eb'): Promise<Store> {
  try {
    return await indexedDbStore(name);
  } catch {
    // Fall through to localStorage.
  }
  try {
    // Reading the property can itself throw where storage is off.
    const storage = globalThis.localStorage;
    const probe = `${name}/probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return localStore(storage);
  } catch {
    return memoryStore();
  }
}

export type Persistence = 'granted' | 'denied' | 'unsupported';

/**
 * Asks the browser to keep this origin's storage when space runs low, which Safari and others
 * otherwise clear after a while. Ask when the player first saves, not on load: some browsers
 * grant it only after the site has been used.
 */
export async function requestPersistence(
  storage: StorageManager | undefined = globalThis.navigator?.storage,
): Promise<Persistence> {
  if (!storage?.persist) return 'unsupported';
  try {
    if (await storage.persisted()) return 'granted';
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
