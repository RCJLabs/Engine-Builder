import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryDirectory } from '../../test/memory-fs.ts';
import { idbFolderStore } from './folderStore.ts';
import {
  canOpenFolders,
  type FolderHandle,
  type FolderRecord,
  type FolderStore,
  folderAccess,
  pickFolder,
  RECENT_FOLDERS,
  recentFolders,
  rememberFolder,
} from './folders.ts';

/** A picked folder whose permission the test sets, counting the times the browser would prompt. */
function folder(name: string, permission: PermissionState = 'granted', answer: PermissionState = 'granted') {
  const handle = Object.assign(new MemoryDirectory(name), {
    asked: 0,
    queryPermission: async () => permission,
    requestPermission: async () => {
      handle.asked += 1;
      return answer;
    },
    isSameEntry: async (other: FolderHandle) => other === handle,
  });
  return handle;
}

function memoryStore(): FolderStore {
  let next = 1;
  const records = new Map<number, FolderRecord>();
  return {
    all: async () => [...records.values()],
    add: async (record) => {
      const key = next++;
      records.set(key, { ...record, key });
    },
    remove: async (key) => {
      records.delete(key);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('rememberFolder', () => {
  it('keeps each folder once, newest first, and only the newest few', async () => {
    const store = memoryStore();
    const first = folder('first');
    await rememberFolder(store, first, 1);
    await rememberFolder(store, folder('second'), 2);
    await rememberFolder(store, first, 3);
    expect((await recentFolders(store)).map((r) => [r.name, r.opened])).toEqual([
      ['first', 3],
      ['second', 2],
    ]);
    for (let i = 0; i < RECENT_FOLDERS + 2; i++) await rememberFolder(store, folder(`f${i}`), 10 + i);
    const kept = await recentFolders(store);
    expect(kept).toHaveLength(RECENT_FOLDERS);
    expect(kept[0]?.name).toBe(`f${RECENT_FOLDERS + 1}`);
  });
});

describe('folderAccess', () => {
  it('asks the browser only when it must, and only when allowed to', async () => {
    const granted = folder('a');
    expect(await folderAccess(granted, true)).toBe('granted');
    expect(granted.asked).toBe(0);

    const lapsed = folder('b', 'prompt', 'granted');
    expect(await folderAccess(lapsed, false)).toBe('prompt');
    expect(lapsed.asked).toBe(0);
    expect(await folderAccess(lapsed, true)).toBe('granted');
    expect(lapsed.asked).toBe(1);

    expect(await folderAccess(folder('c', 'denied', 'denied'), true)).toBe('denied');
  });

  it('counts a handle without permission methods as readable', async () => {
    const plain = Object.assign(new MemoryDirectory('d'), { isSameEntry: async () => false });
    expect(await folderAccess(plain, true)).toBe('granted');
  });
});

describe('pickFolder', () => {
  it('asks to read, under one id, so the picker opens where the last pick was', async () => {
    const chosen = folder('game');
    const picker = vi.fn(async () => chosen);
    vi.stubGlobal('showDirectoryPicker', picker);
    expect(canOpenFolders()).toBe(true);
    expect(await pickFolder()).toBe(chosen);
    expect(picker).toHaveBeenCalledWith({ id: 'eb-project', mode: 'read' });
  });

  it('gives null when the user cancels, or the browser has no picker, and passes other errors on', async () => {
    expect(canOpenFolders()).toBe(false);
    expect(await pickFolder()).toBeNull();
    vi.stubGlobal('showDirectoryPicker', async () => {
      throw new DOMException('cancelled', 'AbortError');
    });
    expect(await pickFolder()).toBeNull();
    vi.stubGlobal('showDirectoryPicker', async () => {
      throw new DOMException('not allowed', 'SecurityError');
    });
    await expect(pickFolder()).rejects.toThrow('not allowed');
  });
});

describe('idbFolderStore', () => {
  it('adds, lists and removes folders, keyed by the store', async () => {
    const store = idbFolderStore(new IDBFactory());
    // Real handles survive a structured clone; this stand-in is plain data so the fake can clone it.
    const handle = { kind: 'directory', name: 'game' } as unknown as FolderHandle;
    await store.add({ name: 'game', opened: 5, handle });
    await store.add({ name: 'other', opened: 6, handle });
    const [first, second] = await store.all();
    expect([first?.name, second?.name, first?.handle.name]).toEqual(['game', 'other', 'game']);
    await store.remove(first?.key ?? -1);
    expect((await store.all()).map((r) => r.name)).toEqual(['other']);
  });
});
