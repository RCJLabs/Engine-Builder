import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { FakeStorage } from '../test/fake-storage.ts';
import { indexedDbStore, localStore, memoryStore, type Store } from './index.ts';

const stores: [string, () => Promise<Store>][] = [
  ['memory', async () => memoryStore()],
  ['localStorage', async () => localStore(new FakeStorage())],
  ['IndexedDB', () => indexedDbStore('test', new IDBFactory())],
];

describe.each(stores)('the %s store', (_name, open) => {
  it('gets what was written, and nothing for a key never written', async () => {
    const store = await open();
    await store.write({ 'eb/a/x': 'one', 'eb/a/y': 'two' });
    expect(await store.get('eb/a/x')).toBe('one');
    expect(await store.get('eb/a/z')).toBeUndefined();
  });

  it('lists keys by prefix, sorted, and removes a key written as undefined', async () => {
    const store = await open();
    await store.write({ 'eb/b/2': '2', 'eb/a/1': '1', 'eb/b/1': '1', other: 'x' });
    expect(await store.keys('eb/b/')).toEqual(['eb/b/1', 'eb/b/2']);
    await store.write({ 'eb/b/1': undefined });
    expect(await store.keys('eb/')).toEqual(['eb/a/1', 'eb/b/2']);
  });

  it('keeps text exactly, whatever it holds', async () => {
    const store = await open();
    const text = '{"a":"\u0000 🚀  "}';
    await store.write({ k: text });
    expect(await store.get('k')).toBe(text);
  });
});

describe('a write that fails', () => {
  it('leaves a full memory store as it was', async () => {
    const store = memoryStore({ quota: 20 });
    await store.write({ a: 'small' });
    await expect(store.write({ a: 'changed', b: 'x'.repeat(30) })).rejects.toMatchObject({ reason: 'full' });
    expect(await store.get('a')).toBe('small');
    expect(await store.get('b')).toBeUndefined();
  });

  it('puts back what localStorage had, when it fills part way through', async () => {
    const storage = new FakeStorage();
    const store = localStore(storage);
    await store.write({ a: 'old', c: 'gone' });
    storage.failOn = 'b';
    const write = store.write({ a: 'new', fresh: 'added', b: 'more', c: undefined });
    await expect(write).rejects.toMatchObject({ reason: 'full' });
    storage.failOn = undefined;
    const after = await Promise.all(['a', 'fresh', 'b', 'c'].map((key) => store.get(key)));
    expect(after).toEqual(['old', undefined, undefined, 'gone']);
  });
});

describe('IndexedDB', () => {
  it('lets go when another tab upgrades the database, and reports what it can no longer do', async () => {
    const factory = new IDBFactory();
    const store = await indexedDbStore('upgraded', factory);
    await store.write({ a: '1' });
    await new Promise<void>((resolve, reject) => {
      const open = factory.open('upgraded', 2);
      open.onsuccess = () => {
        open.result.close();
        resolve();
      };
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error('blocked: the old connection held on'));
    });
    await expect(store.write({ a: '2' })).rejects.toMatchObject({ name: 'StoreError', reason: 'blocked' });
    await expect(store.get('a')).rejects.toMatchObject({ name: 'StoreError', reason: 'blocked' });
  });
});
