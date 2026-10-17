import { describe, expect, it } from 'vitest';
import { sizeText, storageState } from './storage.ts';

describe('storageState', () => {
  it('reads whether storage is kept and how much is used', async () => {
    const storage = { persisted: async () => true, estimate: async () => ({ usage: 1234, quota: 99_000 }) };
    expect(await storageState(storage)).toEqual({ kept: true, used: 1234, quota: 99_000 });
  });

  it('says it can’t tell when the browser can’t, or refuses', async () => {
    expect(await storageState(undefined)).toEqual({ kept: null, used: null, quota: null });
    const refusing = {
      persisted: async () => Promise.reject(new Error('no')),
      estimate: async () => Promise.reject(new Error('no')),
    };
    expect(await storageState(refusing)).toEqual({ kept: null, used: null, quota: null });
  });
});

describe('sizeText', () => {
  it('uses the units phones show, with a decimal below ten', () => {
    expect([999, 1234, 12_345, 1_234_567, 123_456_789, 1_500_000_000].map(sizeText)).toEqual([
      '999 bytes',
      '1.2 kB',
      '12 kB',
      '1.2 MB',
      '123 MB',
      '1.5 GB',
    ]);
  });
});
