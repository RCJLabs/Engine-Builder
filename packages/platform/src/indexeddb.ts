import { type Store, StoreError, storeError } from './store.ts';

const OBJECTS = 'kv';

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(storeError(req.error));
  });

/**
 * IndexedDB: one database per origin, one object store of strings, keys namespaced by the
 * caller. A write is one transaction with strict durability, so it reaches the disk before it
 * counts as done.
 */
export async function indexedDbStore(name = 'eb', factory: IDBFactory = globalThis.indexedDB): Promise<Store> {
  if (!factory) throw new StoreError('blocked', 'IndexedDB is not available here');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let open: IDBOpenDBRequest;
    try {
      open = factory.open(name, 1);
    } catch (error) {
      // As from a sandboxed frame, where IndexedDB exists but refuses.
      reject(storeError(error));
      return;
    }
    open.onupgradeneeded = () => open.result.createObjectStore(OBJECTS);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(storeError(open.error));
    open.onblocked = () => reject(new StoreError('blocked', 'Another tab holds an older version of the save database'));
  });
  // A newer version opened in another tab asks this one to let go.
  db.onversionchange = () => db.close();
  // Throws once the database is closed, by another tab's upgrade or the browser.
  const objects = (mode: IDBTransactionMode) => {
    try {
      return db.transaction(OBJECTS, mode, { durability: 'strict' }).objectStore(OBJECTS);
    } catch (error) {
      throw storeError(error);
    }
  };
  return {
    kind: 'indexeddb',
    async get(key) {
      const value = await request(objects('readonly').get(key));
      return typeof value === 'string' ? value : undefined;
    },
    write(entries) {
      return new Promise((resolve, reject) => {
        // A throw in here rejects the promise with it.
        const store = objects('readwrite');
        for (const [key, value] of Object.entries(entries)) {
          if (value === undefined) store.delete(key);
          else store.put(value, key);
        }
        const tx = store.transaction;
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(storeError(tx.error));
        tx.onabort = () => reject(storeError(tx.error ?? new Error('The write was aborted')));
      });
    },
    async keys(prefix) {
      const keys = await request(objects('readonly').getAllKeys());
      return keys
        .map(String)
        .filter((key) => key.startsWith(prefix))
        .sort();
    },
  };
}
