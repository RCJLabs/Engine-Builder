/**
 * Recent folders in IndexedDB, the one store that can keep a directory handle: handles survive a
 * structured clone, not JSON. The database and store names are storage keys, never to be renamed.
 */
import type { FolderRecord, FolderStore } from './folders.ts';

const DATABASE = 'eb-editor';
const VERSION = 1;
const FOLDERS = 'folders';

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(FOLDERS, { keyPath: 'key', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function act<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FOLDERS, mode);
    const request = run(transaction.objectStore(FOLDERS));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('The folder list could not be saved.'));
  });
}

export function idbFolderStore(factory: IDBFactory = indexedDB): FolderStore {
  let db: Promise<IDBDatabase> | null = null;
  const open = () => {
    db ??= openDatabase(factory);
    return db;
  };
  return {
    all: async () => (await act(await open(), 'readonly', (store) => store.getAll())) as FolderRecord[],
    add: async (record) => {
      await act(await open(), 'readwrite', (store) => store.add(record));
    },
    remove: async (key) => {
      await act(await open(), 'readwrite', (store) => store.delete(key));
    },
  };
}
