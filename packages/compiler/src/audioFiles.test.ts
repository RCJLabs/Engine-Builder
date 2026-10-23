import { describe, expect, it } from 'vitest';
import { base64Of } from './audioFiles.ts';

describe('base64Of', () => {
  it('writes what Node’s Buffer writes, padding and all, for every length up to 40 bytes', () => {
    for (let length = 0; length <= 40; length++) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 97 + 13) % 256);
      expect(base64Of(bytes), `${length} bytes`).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});
