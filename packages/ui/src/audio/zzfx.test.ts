/**
 * Our port of ZzFX against ZzFX itself (M4.8, D58): the `zzfx` package's buildSamples, a dev
 * dependency, with Math.random held at the roll ours is given, must make the same samples over
 * random parameters, every shape, filter, delay, crush and jump among them.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { voiceFromZzfx, zzfxArgs } from '../format/audio.ts';
import { buildSamples, ZZFX_RATE } from './zzfx.ts';

/** Two renders the same, sample for sample: a yes or no, so a failure doesn't diff 176,400 numbers. */
const same = (a: Float32Array, b: Float32Array) => a.length === b.length && a.every((s, i) => Object.is(s, b[i]));

let theirs: typeof import('zzfx')['ZZFX'];

beforeAll(async () => {
  // The package makes an AudioContext as it loads; buildSamples never uses it.
  vi.stubGlobal('AudioContext', class {});
  theirs = (await import('zzfx')).ZZFX;
});
afterEach(() => vi.restoreAllMocks());

/** A random draw from the ranges ZzFX's designer offers, some left at the default. */
function randomArgs(next: () => number): number[] {
  const pick = (lo: number, hi: number, step = 0) => {
    const v = lo + next() * (hi - lo);
    return step ? Math.round(v / step) * step : v;
  };
  const maybe = (value: number, fallback: number) => (next() < 0.4 ? fallback : value);
  return [
    pick(0.2, 1.5),
    maybe(pick(0, 0.5), 0.05),
    pick(20, 2000),
    maybe(pick(0, 0.2), 0),
    maybe(pick(0, 0.3), 0),
    pick(0.02, 0.5),
    pick(0, 5, 1),
    maybe(pick(0.2, 3), 1),
    maybe(pick(-20, 20), 0),
    maybe(pick(-5, 5), 0),
    maybe(pick(-500, 500), 0),
    maybe(pick(0, 0.2), 0),
    maybe(pick(0, 0.2), 0),
    maybe(pick(0, 2), 0),
    maybe(pick(0, 50), 0),
    maybe(pick(0, 0.3), 0),
    maybe(pick(0, 0.2), 0),
    maybe(pick(0.2, 1), 1),
    maybe(pick(0, 0.2), 0),
    maybe(pick(0, 0.5), 0),
    maybe(pick(-3000, 3000), 0),
  ];
}

function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('the ZzFX port', () => {
  it('makes the samples ZzFX 1.4.0 makes, over 200 random sounds', () => {
    const next = lcg(58);
    for (let n = 0; n < 200; n++) {
      const args = randomArgs(next);
      const roll = next();
      vi.spyOn(Math, 'random').mockReturnValue(roll);
      const want = theirs.buildSamples(...args);
      const got = buildSamples(args, ZZFX_RATE, roll);
      expect(got.length, `sound ${n}: ${JSON.stringify(args)}`).toBe(want.length);
      expect(Buffer.from(got.buffer).equals(Buffer.from(want.buffer)), `sound ${n}: ${JSON.stringify(args)}`).toBe(
        true,
      );
    }
  });

  it('fills a hole in the arguments with ZzFX’s default, as ZzFX does', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    // ZzFX's designer copies arrays with holes: [,,925,.04,.3,.6,1,.3,,6.27,-184,.09,.17].
    const args = [undefined, undefined, 925, 0.04, 0.3, 0.6, 1, 0.3, undefined, 6.27, -184, 0.09, 0.17];
    const want = theirs.buildSamples(...args);
    const got = buildSamples(zzfxArgs(voiceFromZzfx(args) ?? {}));
    expect(Buffer.from(got.buffer).equals(Buffer.from(want.buffer))).toBe(true);
  });

  it('renders the same samples every time with no roll given', () => {
    const args = [1, 0.4, 440, 0, 0.1, 0.2];
    expect(same(buildSamples(args), buildSamples(args))).toBe(true);
    // A roll of 0.5 leaves the frequency where randomness 0 puts it, to the last digit.
    expect(same(buildSamples([1, 0, 440, 0, 0.1, 0.2]), buildSamples([1, 0, 440, 0, 0.1, 0.2], ZZFX_RATE, 0.9))).toBe(
      true,
    );
  });
});

describe('a voice as ZzFX’s arguments', () => {
  it('writes only what differs from the default, the shape by name, and back', () => {
    // As ZzFX's designer copies it, with holes: [1.2,,330,,,.3,2,,,,,,,.5].
    const copied = JSON.parse('[1.2,null,330,null,null,0.3,2,null,null,null,null,null,null,0.5]') as unknown[];
    expect(voiceFromZzfx(copied)).toEqual({
      volume: 1.2,
      frequency: 330,
      release: 0.3,
      shape: 'saw',
      noise: 0.5,
    });
    // ZzFX's own defaults, written out rather than left as holes, are still nothing to keep.
    expect(voiceFromZzfx([1, 0.05, 220, 0, 0, 0.1, 0, 1])).toEqual({});
    expect(zzfxArgs({ frequency: 330, shape: 'square', filter: -800 })).toEqual([
      1, 0.05, 330, 0, 0, 0.1, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -800,
    ]);
  });

  it('isn’t one with too many arguments, a word among them, or a shape ZzFX lacks', () => {
    expect(voiceFromZzfx(new Array(22).fill(0))).toBeUndefined();
    expect(voiceFromZzfx([1, 'loud'])).toBeUndefined();
    expect(voiceFromZzfx([1, 0, 220, 0, 0, 0.1, 9])).toBeUndefined();
  });
});
