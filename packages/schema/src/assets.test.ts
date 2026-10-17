import { describe, expect, it } from 'vitest';
import { asset, assetKindOf, isAssetOf, ref, z } from './index.ts';

const message = (schema: z.ZodType, value: unknown) => z.safeParse(schema, value).error?.issues.map((i) => i.message);

describe('asset()', () => {
  it('takes paths inside assets/ with "/" between folders, and an image’s extension in either case', () => {
    for (const path of ['a.png', 'portraits/spiculus.PNG', 'a b/c-d_e.jpeg', 'x/y/z.svg']) {
      expect(message(asset('image'), path), path).toBeUndefined();
    }
  });

  it.each([
    ['', 'No image chosen yet'],
    ['/a.png', 'Expected a path inside assets/, with "/" between folders'],
    ['a//b.png', 'Expected a path inside assets/, with "/" between folders'],
    ['../a.png', 'Expected a path inside assets/, with "/" between folders'],
    ['.hidden/a.png', 'Expected a path inside assets/, with "/" between folders'],
    ['__MACOSX/a.png', 'Expected a path inside assets/, with "/" between folders'],
    ['a\\b.png', 'Expected a path inside assets/, with "/" between folders'],
    ['a:b.png', 'Expected a path inside assets/, with "/" between folders'],
    ['a.txt', 'Expected an image: .png, .jpg, .jpeg, .webp, .gif, .svg, .avif'],
  ])('refuses %j once: %s', (path, expected) => {
    expect(message(asset('image'), path)).toEqual([expected]);
  });

  it('takes any file without a kind, and names the others in plain words', () => {
    expect(message(asset(), 'notes.txt')).toBeUndefined();
    expect(message(asset('audio'), 'a.png')).toEqual([
      'Expected an audio file: .mp3, .ogg, .opus, .wav, .m4a, .aac, .flac',
    ]);
    expect(message(asset('model'), '')).toEqual(['No 3D model chosen yet']);
    expect(() => asset('video' as 'image')).toThrow('asset(): no asset kind "video"');
  });

  it('marks the field, through copies, and only asset fields', () => {
    expect(assetKindOf(asset('font').describe('The title font'))).toBe('font');
    expect(assetKindOf(asset())).toBe(true);
    expect(assetKindOf(ref('item'))).toBeUndefined();
    expect(() => assetKindOf(z.string().meta({ 'x-eb-asset': 'video' }))).toThrow('x-eb-asset must be an asset kind');
  });

  it('exports patterns that agree with it, since JSON Schema patterns have no flags', () => {
    const schema = z.toJSONSchema(asset('image')) as { allOf?: { pattern: string }[]; pattern?: string };
    const patterns = [schema.pattern, ...(schema.allOf ?? []).map((p) => p.pattern)].filter((p) => p !== undefined);
    expect(patterns.length).toBe(2);
    for (const path of ['a.PNG', 'a.Jpg', 'b/c.svg']) {
      expect(
        patterns.every((p) => new RegExp(p).test(path)),
        path,
      ).toBe(true);
    }
    expect(patterns.every((p) => new RegExp(p).test('a.txt'))).toBe(false);
  });
});

describe('isAssetOf', () => {
  it('reads the kind from the extension', () => {
    expect(isAssetOf('a/b.WOFF2', 'font')).toBe(true);
    expect(isAssetOf('a/b.png', 'font')).toBe(false);
    expect(isAssetOf('anything', true)).toBe(true);
  });
});
