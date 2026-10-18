/**
 * Whether a project's scripts may run in this browser (D38). A script can do anything the editor
 * can, so a project made here runs its scripts at once, while one imported from a zip or opened
 * from a folder asks first, once. The answers are kept in localStorage under TRUST_KEY, by the
 * project's key: "library:<folder>" for a project stored here, "folder:<n>" for an opened folder
 * by its key in the recent list. A folder the list couldn't keep is trusted until the page closes.
 */

/** The localStorage key. Like every storage key, never renamed (CLAUDE.md). */
export const TRUST_KEY = 'eb-scripts-trusted';

/** What a project is known by, and whether an answer about it outlives the page. */
export interface TrustKey {
  readonly key: string;
  readonly keep: boolean;
}

export const libraryKey = (folder: string): TrustKey => ({ key: `library:${folder}`, keep: true });
export const folderKey = (key: number): TrustKey => ({ key: `folder:${key}`, keep: true });
/** An opened folder the recent list couldn't keep: known by its name, for this page only. */
export const pageKey = (name: string): TrustKey => ({ key: `page:${name}`, keep: false });

export interface TrustStore {
  trusted(project: TrustKey): boolean;
  trust(project: TrustKey): void;
  /** Forgets the answer: a project deleted, or a folder taken off the list, whose key may come again. */
  forget(project: TrustKey): void;
}

type KeyValue = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The answers, in `storage` when it can hold them. One that can't be read (blocked, or not JSON)
 * counts as none: the projects in it are asked about again, which costs a tap, never a script run
 * unasked.
 */
export function trustStore(storage: KeyValue | null): TrustStore {
  const page = new Set<string>();
  const read = (): Set<string> => {
    try {
      const list: unknown = JSON.parse(storage?.getItem(TRUST_KEY) ?? '[]');
      return new Set(Array.isArray(list) ? list.filter((key): key is string => typeof key === 'string') : []);
    } catch {
      return new Set();
    }
  };
  const write = (keys: ReadonlySet<string>) => {
    try {
      storage?.setItem(TRUST_KEY, JSON.stringify([...keys].sort()));
    } catch {
      // Full or blocked: the answer lasts while the page is open.
    }
  };
  return {
    trusted: ({ key }) => page.has(key) || read().has(key),
    trust({ key, keep }) {
      page.add(key);
      if (!keep) return;
      const keys = read();
      keys.add(key);
      write(keys);
    },
    forget({ key }) {
      page.delete(key);
      const keys = read();
      if (keys.delete(key)) write(keys);
    },
  };
}

function browserStorage(): KeyValue | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The editor's one store of answers. */
export const trust: TrustStore = trustStore(typeof window === 'undefined' ? null : browserStorage());
