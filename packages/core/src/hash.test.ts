import { describe, expect, it } from 'vitest';
import { fnv1a32, fnv1a64, utf8Length } from './hash.ts';

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

const fnv64ViaBigInt = (text: string): string => {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text))
    hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return hash.toString(16).padStart(16, '0');
};

describe('fnv1a64', () => {
  it('matches the published FNV-1a 64-bit vectors', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });

  it('agrees with a BigInt implementation over UTF-8', () => {
    const texts = ['é', 'Landnám', '€', '漢字', '🙂', '\ud800 lone', '\u0000\u00ff', 'x'.repeat(4096), '{"a":[1,2]}'];
    for (const text of texts) expect(fnv1a64(text), JSON.stringify(text)).toBe(fnv64ViaBigInt(text));
  });
});

describe('utf8Length', () => {
  it('counts the bytes TextEncoder would write', () => {
    for (const text of ['', 'abc', 'é', '€', '🙂', 'a🙂b', '\ud800']) {
      expect(utf8Length(text)).toBe(new TextEncoder().encode(text).length);
    }
  });
});
