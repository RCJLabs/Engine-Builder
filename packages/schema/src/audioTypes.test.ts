/** The engine's audio types (M4.8): a sound has one to three voices, as ZzFX's designer makes one at a time. */
import { describe, expect, it } from 'vitest';
import { SOUND_DATA } from './audioTypes.ts';
import { validateRecords } from './validate.ts';

const codes = (voices: number) =>
  validateRecords(
    [SOUND_DATA.recordType],
    [{ type: 'sound', id: 'zap', value: { voices: Array.from({ length: voices }, () => ({ frequency: 440 })) } }],
  ).diagnostics.map((d) => `${d.code} ${d.path}`);

describe('the sound type', () => {
  it('takes one to three voices', () => {
    expect(codes(1)).toEqual([]);
    expect(codes(3)).toEqual([]);
    expect(codes(0)).toEqual(['E001 /voices']);
    expect(codes(4)).toEqual(['E001 /voices']);
  });
});
