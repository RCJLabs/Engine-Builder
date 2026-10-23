/*!
 * The sample loop below is ported from ZzFX 1.4.0's buildSamples (M4.8, D58), as written but for
 * its one call to Math.random, which is `roll` here, so a sound renders the same every time.
 * https://github.com/KilledByAPixel/ZzFX
 *
 * @license ZzFX MIT License
 *
 * Copyright (c) 2019 - Frank Force
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/** ZzFX's sample rate. */
export const ZZFX_RATE = 44100;
/** ZzFX's master volume, which its player applies: a sound plays at this times its own volume. */
export const ZZFX_VOLUME = 0.3;

const PI2 = Math.PI * 2;
const sign = (v: number) => (v < 0 ? -1 : 1);

/** The biquad ZzFX filters with: high-pass above 0, low-pass below. */
function filterOf(filter: number, sampleRate: number) {
  const quality = 2;
  const w = (PI2 * Math.abs(filter) * 2) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / 2 / quality;
  const a0 = 1 + alpha;
  const b0 = (1 + sign(filter) * cos) / 2 / a0;
  return { a1: (-2 * cos) / a0, a2: (1 - alpha) / a0, b0, b1: -(sign(filter) + cos) / a0, b2: b0 };
}

/** One sample of a wave shape at phase `t`, as ZzFX's nested choice has it. */
function wave(shape: number, shapeCurve: number, t: number): number {
  if (!shape) return Math.sin(t);
  if (!(shape > 1)) return 1 - 4 * Math.abs(Math.round(t / PI2) - t / PI2);
  if (!(shape > 2)) return 1 - (((((2 * t) / PI2) % 2) + 2) % 2);
  if (!(shape > 3)) return Math.max(Math.min(Math.tan(t), 1), -1);
  if (!(shape > 4)) return Math.sin(t ** 3);
  return (t / PI2) % 1 < shapeCurve / 2 ? 1 : -1;
}

/**
 * ZzFX's `buildSamples`: its 21 arguments in its order, at `sampleRate`, with `roll` in [0, 1)
 * where ZzFX calls Math.random. A roll of 0.5 leaves the frequency where it is.
 */
export function buildSamples(
  args: readonly number[],
  sampleRate: number = ZZFX_RATE,
  roll = 0.5,
): Float32Array<ArrayBuffer> {
  let [
    volume = 1,
    randomness = 0.05,
    frequency = 220,
    attack = 0,
    sustain = 0,
    release = 0.1,
    shape = 0,
    shapeCurve = 1,
    slide = 0,
    deltaSlide = 0,
    pitchJump = 0,
    pitchJumpTime = 0,
    repeatTime = 0,
    noise = 0,
    modulation = 0,
    bitCrush = 0,
    delay = 0,
    sustainVolume = 1,
    decay = 0,
    tremolo = 0,
    filter = 0,
  ] = args;
  slide *= (500 * PI2) / sampleRate / sampleRate;
  const startSlide = slide;
  frequency *= ((1 + randomness * 2 * roll - randomness) * PI2) / sampleRate;
  let startFrequency = frequency;
  const { a1, a2, b0, b1, b2 } = filterOf(filter, sampleRate);
  let x2 = 0;
  let x1 = 0;
  let y2 = 0;
  let y1 = 0;

  // Scaled by the sample rate; the least attack keeps a sound from popping.
  attack = attack * sampleRate || 9;
  decay *= sampleRate;
  sustain *= sampleRate;
  release *= sampleRate;
  delay *= sampleRate;
  deltaSlide *= (500 * PI2) / sampleRate ** 3;
  modulation *= PI2 / sampleRate;
  pitchJump *= PI2 / sampleRate;
  pitchJumpTime *= sampleRate;
  repeatTime = (repeatTime * sampleRate) | 0;

  const length = (attack + decay + sustain + release + delay) | 0;
  const b = new Float32Array(length > 0 ? length : 0);
  const crushEvery = (bitCrush * 100) | 0;
  let modOffset = 0;
  let repeat = 0;
  let crush = 0;
  let jump = 1;
  let t = 0;
  let s = 0;
  for (let i = 0; i < length; b[i++] = s * volume) {
    crush++;
    // ZzFX's `% 0` is NaN, so with no bit crush every sample is made.
    if (!(crush % crushEvery)) {
      s = wave(shape, shapeCurve, t);
      const tremor = repeatTime ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime) : 1;
      const envelope =
        i < attack
          ? i / attack
          : i < attack + decay
            ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
            : i < attack + decay + sustain
              ? sustainVolume
              : i < length - delay
                ? ((length - i - delay) / release) * sustainVolume
                : 0;
      s = tremor * (shape > 4 ? s : sign(s) * Math.abs(s) ** shapeCurve) * envelope;
      if (delay) {
        const echo =
          delay > i
            ? 0
            : ((i < length - delay ? 1 : (length - i) / delay) * (b[(i - delay) | 0] as number)) / 2 / volume;
        s = s / 2 + echo;
      }
      if (filter) {
        const out = b2 * x2 + b1 * x1 + b0 * s - a2 * y2 - a1 * y1;
        x2 = x1;
        x1 = s;
        y2 = y1;
        y1 = out;
        s = out;
      }
    }
    slide += deltaSlide;
    frequency += slide;
    const f = frequency * Math.cos(modulation * modOffset++);
    t += f + f * noise * (((i * i * PI2) % 2) - 1);
    if (jump && ++jump > pitchJumpTime) {
      frequency += pitchJump;
      startFrequency += pitchJump;
      jump = 0;
    }
    if (repeatTime && !(++repeat % repeatTime)) {
      frequency = startFrequency;
      slide = startSlide;
      jump ||= 1;
    }
  }
  return b;
}
