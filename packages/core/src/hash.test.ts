import { describe, expect, it } from 'vitest';
import { fnv1a32 } from './hash.ts';

const viaTextEncoder = (text: string): number => {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash;
};

describe('fnv1a32', () => {
  it('matches the published FNV-1a 32-bit vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('hashes UTF-8 bytes, matching TextEncoder for every width of code point', () => {
    for (const text of ['é', 'Landnám', '€', '漢字', '🙂', 'a🙂b', 'mixed ⚔️ text', '\ud800 lone']) {
      expect(fnv1a32(text)).toBe(viaTextEncoder(text));
    }
  });

  it('returns an unsigned 32-bit integer', () => {
    const hash = fnv1a32('Space-Wrecked');
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThan(2 ** 32);
  });
});
