/** The sound preview's edits (M4.8): ZzFX pasted in, presets, Vary, and a half-made sound still playable. */
import { describe, expect, it } from 'vitest';
import { PRESETS, pastedVoice, playable, vary, zzfxNumbers } from './soundEdits.ts';

const held = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] as number;
};

describe('pasting ZzFX', () => {
  it('reads what ZzFX’s designer copies, and the bare forms, holes as defaults', () => {
    const want = [undefined, undefined, 925, 0.04, 0.3];
    expect(zzfxNumbers('zzfx(...[,,925,.04,.3])')).toEqual(want);
    expect(zzfxNumbers('zzfx(...[,,925,.04,.3]);')).toEqual(want);
    expect(zzfxNumbers('zzfx(,,925,.04,.3)')).toEqual(want);
    expect(zzfxNumbers('[,,925,.04,.3]')).toEqual(want);
    expect(zzfxNumbers(' ,,925, .04 ,.3 ')).toEqual(want);
    expect(pastedVoice('zzfx(...[.8,.1,70,.01,,.18,,,-2])')).toEqual({
      volume: 0.8,
      randomness: 0.1,
      frequency: 70,
      attack: 0.01,
      release: 0.18,
      slide: -2,
    });
  });

  it('says why when it isn’t ZzFX', () => {
    expect(pastedVoice('')).toMatch(/isn’t a ZzFX sound/);
    expect(pastedVoice('zzfx(...[1,,loud])')).toMatch(/isn’t a ZzFX sound/);
    expect(pastedVoice(`[${new Array(22).fill(1).join(',')}]`)).toMatch(/at most 21 numbers/);
    expect(pastedVoice('[1,,220,,,,9]')).toMatch(/shape 0 to 5/);
  });
});

describe('presets and Vary', () => {
  it('draws each preset from its ranges, in bounds, the same for the same draws', () => {
    for (const [name, make] of Object.entries(PRESETS)) {
      const voices = make(held(0.5));
      expect(voices.length, name).toBeGreaterThan(0);
      expect(make(held(0.5)), name).toEqual(voices);
      for (const voice of voices) expect(voice.volume ?? 1, name).toBeLessThanOrEqual(1);
    }
    expect(PRESETS.Pickup?.(held(0))).toEqual([
      {
        volume: 0.5,
        frequency: 800,
        sustain: 0.03,
        release: 0.1,
        shape: 'square',
        'pitch-jump': 200,
        'pitch-jump-time': 0.03,
      },
    ]);
  });

  it('moves each number by up to a tenth, keeping the shape, the start and the bounds', () => {
    const voice = { at: 0.2, volume: 1, frequency: 440, shape: 'saw' as const, randomness: 1 };
    expect(vary(voice, held(1))).toEqual({ at: 0.2, volume: 1.1, frequency: 484, shape: 'saw', randomness: 1 });
    expect(vary(voice, held(0))).toEqual({ at: 0.2, volume: 0.9, frequency: 396, shape: 'saw', randomness: 0.9 });
    expect(vary(voice, held(0.5))).toEqual(voice);
  });

  it('leaves out of a half-made sound what can’t be played', () => {
    expect(playable({ voices: [{ frequency: 'high', release: 0.2, shape: 'wobble' }, 'x', { shape: 'saw' }] })).toEqual(
      {
        voices: [{ release: 0.2 }, { shape: 'saw' }],
      },
    );
    expect(playable(undefined)).toEqual({ voices: [] });
  });
});
