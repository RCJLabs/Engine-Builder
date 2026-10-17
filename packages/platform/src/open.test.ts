import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeStorage } from '../test/fake-storage.ts';
import { openStore, requestPersistence } from './index.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openStore', () => {
  it('opens IndexedDB where there is one', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    expect((await openStore('t')).kind).toBe('indexeddb');
  });

  it('falls back to localStorage where IndexedDB is missing or refuses', async () => {
    vi.stubGlobal('localStorage', new FakeStorage());
    vi.stubGlobal('indexedDB', undefined);
    expect((await openStore('t')).kind).toBe('local');
    const refusing = {
      open() {
        throw Object.assign(new Error('The operation is insecure'), { name: 'SecurityError' });
      },
    };
    vi.stubGlobal('indexedDB', refusing);
    expect((await openStore('t')).kind).toBe('local');
  });

  it('falls back to memory where localStorage will not take a write either', async () => {
    const full = new FakeStorage();
    full.failOn = 't/probe';
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', full);
    expect((await openStore('t')).kind).toBe('memory');
    expect(full.length).toBe(0);
  });
});

describe('requestPersistence', () => {
  const manager = (persisted: boolean, persist: () => Promise<boolean>) =>
    ({ persisted: async () => persisted, persist }) as unknown as StorageManager;

  it('says when the browser has no such thing', async () => {
    vi.stubGlobal('navigator', {});
    expect(await requestPersistence()).toBe('unsupported');
    expect(await requestPersistence({} as StorageManager)).toBe('unsupported');
  });

  it('asks only when the storage is not persisted already', async () => {
    const persist = vi.fn(async () => true);
    expect(await requestPersistence(manager(true, persist))).toBe('granted');
    expect(persist).not.toHaveBeenCalled();
    expect(await requestPersistence(manager(false, persist))).toBe('granted');
    expect(persist).toHaveBeenCalledOnce();
  });

  it('reports a refusal, and a browser that throws as one', async () => {
    expect(await requestPersistence(manager(false, async () => false))).toBe('denied');
    const throwing = manager(false, async () => {
      throw new Error('not now');
    });
    expect(await requestPersistence(throwing)).toBe('denied');
  });
});
