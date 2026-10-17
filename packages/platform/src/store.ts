/**
 * Key-value storage behind saves (docs/specs/saves.md). Values are strings. A write of several
 * keys lands whole or not at all, so a save and its summary never disagree.
 */
export interface Store {
  /** Which storage this is, so the stage can warn when saves won't outlive the tab. */
  readonly kind: 'indexeddb' | 'local' | 'memory';
  /** Every method throws a StoreError when storage refuses. */
  get(key: string): Promise<string | undefined>;
  /** Sets every key, or none of them; `undefined` removes a key. */
  write(entries: Readonly<Record<string, string | undefined>>): Promise<void>;
  /** The keys starting with `prefix`, sorted. */
  keys(prefix: string): Promise<string[]>;
}

/** Why storage failed, in terms a player can act on. */
export type StoreFailure = 'full' | 'blocked' | 'failed';

export class StoreError extends Error {
  readonly reason: StoreFailure;
  constructor(reason: StoreFailure, message: string) {
    super(message);
    this.name = 'StoreError';
    this.reason = reason;
  }
}

/** The browser's error, as a StoreError: out of space, storage turned off, or anything else. */
export function storeError(error: unknown): StoreError {
  if (error instanceof StoreError) return error;
  const name = (error as { name?: unknown } | null)?.name;
  const message = error instanceof Error ? error.message : String(error);
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return new StoreError('full', message);
  if (name === 'SecurityError' || name === 'NotAllowedError' || name === 'InvalidStateError') {
    return new StoreError('blocked', message);
  }
  return new StoreError('failed', message);
}

/** Storage in memory, gone with the page. `quota` caps its size in characters, to test a full store. */
export function memoryStore(options: { readonly quota?: number } = {}): Store {
  const map = new Map<string, string>();
  const size = (m: ReadonlyMap<string, string>) => [...m].reduce((sum, [k, v]) => sum + k.length + v.length, 0);
  return {
    kind: 'memory',
    get: async (key) => map.get(key),
    async write(entries) {
      const next = new Map(map);
      for (const [key, value] of Object.entries(entries)) {
        if (value === undefined) next.delete(key);
        else next.set(key, value);
      }
      if (options.quota !== undefined && size(next) > options.quota)
        throw new StoreError('full', 'The memory store is full');
      map.clear();
      for (const [key, value] of next) map.set(key, value);
    },
    keys: async (prefix) => [...map.keys()].filter((key) => key.startsWith(prefix)).sort(),
  };
}

/**
 * localStorage. Its writes land one key at a time, so a write that fails part way puts back
 * the keys it had changed before rethrowing.
 */
export function localStore(storage: Storage): Store {
  return {
    kind: 'local',
    async get(key) {
      try {
        return storage.getItem(key) ?? undefined;
      } catch (error) {
        throw storeError(error);
      }
    },
    async write(entries) {
      const before = new Map(Object.keys(entries).map((key) => [key, storage.getItem(key)]));
      try {
        for (const [key, value] of Object.entries(entries)) {
          if (value === undefined) storage.removeItem(key);
          else storage.setItem(key, value);
        }
      } catch (error) {
        // Removing first frees the space that putting the old values back may need. The
        // caller hears about the first failure whatever happens here.
        for (const [key, value] of before) if (value === null) storage.removeItem(key);
        for (const [key, value] of before) {
          try {
            if (value !== null) storage.setItem(key, value);
          } catch {
            // Nothing more to try: the value that was there is lost to this tab's storage.
          }
        }
        throw storeError(error);
      }
    },
    async keys(prefix) {
      const keys: string[] = [];
      try {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key?.startsWith(prefix)) keys.push(key);
        }
      } catch (error) {
        throw storeError(error);
      }
      return keys.sort();
    },
  };
}
