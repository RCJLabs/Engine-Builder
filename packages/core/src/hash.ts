/**
 * 32-bit FNV-1a over the UTF-8 bytes of a string.
 *
 * UTF-8 rather than UTF-16 code units so the same text hashes the same in a C++ or C# port:
 * the published FNV test vectors are byte-based. Used for seeds, fingerprints and content ids.
 * Integer math only (Math.imul, >>> 0), so every JS engine agrees.
 */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  const mix = (byte: number): void => {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  };
  for (let i = 0; i < text.length; i++) {
    let code = text.codePointAt(i) ?? 0;
    if (code > 0xffff) i++; // the second half of a surrogate pair is part of this code point
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd; // a lone surrogate encodes as U+FFFD, as TextEncoder does
    if (code < 0x80) {
      mix(code);
    } else if (code < 0x800) {
      mix(0xc0 | (code >> 6));
      mix(0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      mix(0xe0 | (code >> 12));
      mix(0x80 | ((code >> 6) & 0x3f));
      mix(0x80 | (code & 0x3f));
    } else {
      mix(0xf0 | (code >> 18));
      mix(0x80 | ((code >> 12) & 0x3f));
      mix(0x80 | ((code >> 6) & 0x3f));
      mix(0x80 | (code & 0x3f));
    }
  }
  return hash;
}
