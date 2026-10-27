/**
 * Sprites' checks in the record (M7.1, D83, docs/specs/2d-scenes.md#sprites): a sound sprite, and
 * each of E091's record rules broken once: a clip running backwards, a default clip it lacks, an
 * origin outside the frame, no clips; and what the type file holds to: a sheet that is an image,
 * whole-pixel frames, a rate within reason.
 */
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './diagnostics.ts';
import { defaultClipOf, type SpriteRecord } from './spriteTypes.ts';
import { type RecordInput, validateRecords } from './validate.ts';

const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map(({ code, path }) => `${code} ${path}`);
const check = (value: unknown) => {
  const input: RecordInput = { type: 'sprite', id: 'guard', file: 'records/sprite/guard.json', value };
  return codes(
    validateRecords([], [input], { assets: new Set(['sprites/guard.png', 'sprites/guard.ogg']) }).diagnostics,
  );
};

const GUARD: SpriteRecord = {
  name: 'Guard',
  sheet: 'sprites/guard.png',
  frame: [16, 24],
  origin: [8, 0],
  clips: { idle: { frames: [0, 1], fps: 2 }, walk: { frames: [2, 5], fps: 8 } },
  clip: 'idle',
};

describe('a sprite record', () => {
  it('is sound as written, its default clip its own or its first', () => {
    expect(check(GUARD)).toEqual([]);
    expect(defaultClipOf(GUARD)).toBe('idle');
    expect(defaultClipOf({ ...GUARD, clip: undefined })).toBe('idle');
    expect(defaultClipOf({ ...GUARD, clip: 'walk' })).toBe('walk');
  });

  it('is E091 for a clip that runs backwards', () => {
    expect(check({ ...GUARD, clips: { ...GUARD.clips, walk: { frames: [5, 2], fps: 8 } } })).toEqual([
      'E091 /clips/walk/frames',
    ]);
  });

  it('is E091 for a default clip it doesn’t have', () => {
    expect(check({ ...GUARD, clip: 'run' })).toEqual(['E091 /clip']);
  });

  it('is E091 for an origin outside the frame, and for no clips at all', () => {
    expect(check({ ...GUARD, origin: [16, 0] })).toEqual(['E091 /origin']);
    expect(check({ ...GUARD, clips: {}, clip: undefined })).toEqual(['E091 /clips']);
  });

  it('holds to its type file: a sheet that is an image, whole pixels, a rate up to 60', () => {
    expect(check({ ...GUARD, sheet: 'sprites/guard.ogg' })).toEqual(['E001 /sheet']);
    expect(check({ ...GUARD, frame: [16.5, 24] })).toEqual(['E001 /frame/0']);
    expect(check({ ...GUARD, frame: [0, 24] })).toEqual(['E001 /frame/0']);
    expect(check({ ...GUARD, clips: { idle: { frames: [0, 1], fps: 120 } } })).toEqual(['E001 /clips/idle/fps']);
  });
});
