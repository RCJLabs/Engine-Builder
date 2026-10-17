/**
 * Calls `byte` for each byte of the string's UTF-8 encoding.
 *
 * UTF-8 rather than UTF-16 code units so the same text hashes the same in a C++ or C# port, and
 * the published FNV test vectors apply. Encoded by hand, since pure code has no TextEncoder; a
 * lone surrogate encodes as U+FFFD, as TextEncoder does.
 */
function eachUtf8Byte(text: string, byte: (b: number) => void): void {
  for (let i = 0; i < text.length; i++) {
    let code = text.codePointAt(i) ?? 0;
    if (code > 0xffff) i++; // the second half of a surrogate pair is part of this code point
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) {
      byte(code);
    } else if (code < 0x800) {
      byte(0xc0 | (code >> 6));
      byte(0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      byte(0xe0 | (code >> 12));
      byte(0x80 | ((code >> 6) & 0x3f));
      byte(0x80 | (code & 0x3f));
    } else {
      byte(0xf0 | (code >> 18));
      byte(0x80 | ((code >> 12) & 0x3f));
      byte(0x80 | ((code >> 6) & 0x3f));
      byte(0x80 | (code & 0x3f));
    }
  }
}

/** The length of a string in UTF-8 bytes, the size a port measures. */
export function utf8Length(text: string): number {
  let n = 0;
  eachUtf8Byte(text, () => {
    n++;
  });
  return n;
}

/**
 * 32-bit FNV-1a over UTF-8, for seeds and short fingerprints. Integer math only (Math.imul,
 * >>> 0), so every JS engine agrees.
 */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  eachUtf8Byte(text, (b) => {
    hash = Math.imul(hash ^ b, 0x01000193) >>> 0;
  });
  return hash;
}

const hex4 = (limb: number): string => limb.toString(16).padStart(4, '0');

/**
 * 64-bit FNV-1a over UTF-8, as 16 lowercase hex digits (docs/specs/state-hash.md).
 *
 * A double can't hold a 64-bit integer exactly and BigInt is slow per byte, so the hash is four
 * 16-bit limbs, h0 the lowest. The prime is 2^40 + 0x1b3, so h × prime = h × 0x1b3 + (h << 40).
 * Every partial sum stays under 2^27, exact in a double.
 */
export function fnv1a64(text: string): string {
  let h0 = 0x2325;
  let h1 = 0x8422;
  let h2 = 0x9ce4;
  let h3 = 0xcbf2;
  eachUtf8Byte(text, (b) => {
    h0 ^= b;
    const t0 = h0 * 0x1b3;
    const t1 = h1 * 0x1b3 + (t0 >>> 16);
    // h << 40 lands h0 (shifted 8) in limb 2 and h1 (shifted 8) in limb 3; h2 and h3 overflow.
    const t2 = h2 * 0x1b3 + (h0 << 8) + (t1 >>> 16);
    const t3 = h3 * 0x1b3 + (h1 << 8) + (t2 >>> 16);
    h0 = t0 & 0xffff;
    h1 = t1 & 0xffff;
    h2 = t2 & 0xffff;
    h3 = t3 & 0xffff;
  });
  return hex4(h3) + hex4(h2) + hex4(h1) + hex4(h0);
}

/** Hashes several parts with an unambiguous separator, e.g. a seed from (run seed, day, index). */
export function hashParts(...parts: readonly (string | number)[]): number {
  return fnv1a32(parts.join('\u001f'));
}
