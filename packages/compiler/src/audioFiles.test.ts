import { describe, expect, it } from 'vitest';
import { audioFiles, base64Of } from './audioFiles.ts';
import { memorySource } from './source.ts';

describe('base64Of', () => {
  it('writes what Node’s Buffer writes, padding and all, for every length up to 40 bytes', () => {
    for (let length = 0; length <= 40; length++) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 97 + 13) % 256);
      expect(base64Of(bytes), `${length} bytes`).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});

describe('audioFiles', () => {
  it('packs the files a music’s stems name, and nothing another type’s stems name', async () => {
    const source = memorySource({
      'assets/audio/theme.wav': new Uint8Array([1, 2, 3]),
      'assets/audio/other.wav': new Uint8Array([4, 5, 6]),
    });
    const records = [
      { type: 'music', id: 'hut', value: { stems: [{ asset: 'audio/theme.wav' }, { asset: 'audio/gone.wav' }] } },
      { type: 'band', id: 'own', value: { stems: [{ asset: 'audio/other.wav' }] } },
    ];
    expect(await audioFiles(source, records as never)).toEqual({ 'audio/theme.wav': 'AQID' });
  });
});
