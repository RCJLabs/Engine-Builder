import { describe, expect, it } from 'vitest';
import { LIMITS, mimeOf, sizeText, today } from './media.ts';

describe('media', () => {
  it('types files by extension, in either case', () => {
    expect(mimeOf('a/B.SVG')).toBe('image/svg+xml');
    expect(mimeOf('theme.opus')).toBe('audio/ogg');
    expect(mimeOf('font.woff2')).toBe('font/woff2');
    expect(mimeOf('README')).toBe('application/octet-stream');
  });

  it('says sizes in plain words', () => {
    expect([1, 512, 1024, 1536, 10 * 1024, 3.4 * 1024 * 1024, LIMITS.file].map(sizeText)).toEqual([
      '1 byte',
      '512 bytes',
      '1 KB',
      '1.5 KB',
      '10 KB',
      '3.4 MB',
      '25 MB',
    ]);
  });

  it('writes today as the log writes dates', () => {
    expect(today(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
