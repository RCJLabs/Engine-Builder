import { describe, expect, it } from 'vitest';
import { folderKey, libraryKey, pageKey, TRUST_KEY, trustStore } from './trust.ts';

/** localStorage as the spec has it: strings by key, shared by every store made on it. */
function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe('trusting a project to run its scripts', () => {
  it('keeps the answer for a stored project or a listed folder, and for no other', () => {
    const storage = memoryStorage();
    trustStore(storage).trust(libraryKey('hold'));
    trustStore(storage).trust(folderKey(3));
    const later = trustStore(storage);
    expect(later.trusted(libraryKey('hold'))).toBe(true);
    expect(later.trusted(folderKey(3))).toBe(true);
    expect(later.trusted(libraryKey('hold-2'))).toBe(false);
    expect(later.trusted(folderKey(4))).toBe(false);
    expect(JSON.parse(storage.items.get(TRUST_KEY) ?? '')).toEqual(['folder:3', 'library:hold']);
  });

  it('keeps a folder the recent list couldn’t keep only while the page is open', () => {
    const storage = memoryStorage();
    const store = trustStore(storage);
    store.trust(pageKey('hold'));
    expect(store.trusted(pageKey('hold'))).toBe(true);
    expect(trustStore(storage).trusted(pageKey('hold'))).toBe(false);
    expect(storage.items.has(TRUST_KEY)).toBe(false);
  });

  it('forgets a deleted project, so one copied in under its folder asks again', () => {
    const storage = memoryStorage();
    const store = trustStore(storage);
    store.trust(libraryKey('hold'));
    store.forget(libraryKey('hold'));
    expect(store.trusted(libraryKey('hold'))).toBe(false);
    expect(trustStore(storage).trusted(libraryKey('hold'))).toBe(false);
  });

  it('counts answers it can’t read as none, and asks again rather than run', () => {
    const storage = memoryStorage({ [TRUST_KEY]: '{not json' });
    const store = trustStore(storage);
    expect(store.trusted(libraryKey('hold'))).toBe(false);
    store.trust(libraryKey('hold'));
    expect(JSON.parse(storage.items.get(TRUST_KEY) ?? '')).toEqual(['library:hold']);
    expect(trustStore(memoryStorage({ [TRUST_KEY]: '[1, "library:a", null]' })).trusted(libraryKey('a'))).toBe(true);
  });

  it('keeps answers for the page when storage refuses them', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const store = trustStore(blocked);
    store.trust(libraryKey('hold'));
    expect(store.trusted(libraryKey('hold'))).toBe(true);
    expect(trustStore(null).trusted(libraryKey('hold'))).toBe(false);
  });
});
