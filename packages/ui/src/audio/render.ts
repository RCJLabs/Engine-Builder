/**
 * A game's sounds and ambience made into samples (M4.8, D58, docs/specs/audio.md): a sound's voices
 * by the ZzFX port, mixed at their offsets; an ambience's layer as a loop with no seam. Both are
 * plain functions of their records, so the editor's preview, the player and a Node test render the
 * same samples.
 */
import { fnv1a32 } from '@eb/core';
import { type Layer, type SoundRecord, zzfxArgs } from '../format/audio.ts';
import { buildSamples, ZZFX_RATE } from './zzfx.ts';

/** A sound's voices, each rendered with no randomness and added in at its `at`. */
export function renderSound(sound: SoundRecord, sampleRate: number = ZZFX_RATE): Float32Array<ArrayBuffer> {
  const voices = sound.voices.map((voice) => ({
    from: Math.round((voice.at ?? 0) * sampleRate),
    samples: buildSamples(zzfxArgs(voice), sampleRate),
  }));
  const length = voices.reduce((most, { from, samples }) => Math.max(most, from + samples.length), 0);
  const out = new Float32Array(length);
  for (const { from, samples } of voices)
    for (let i = 0; i < samples.length; i++) out[from + i] = (out[from + i] as number) + (samples[i] as number);
  return out;
}

/** An ambience layer's loop: 8 seconds at 22,050 Hz. */
export const LOOP_SECONDS = 8;
export const LOOP_RATE = 22050;
/** The end of the loop faded over its start, so it has no seam. */
const SEAM_SECONDS = 0.25;
/** A noise layer's loudness before its gain, as root mean square. */
const NOISE_RMS = 0.25;

/** mulberry32: noise that is the same for the same layer everywhere (from spliceworld's room.js). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** White, pink (Paul Kellet's refined filter) or brown (leaky integration) noise. */
function noise(colour: Layer['colour'], length: number, random: () => number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(length);
  let [b0, b1, b2, b3, b4, b5, b6, last] = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < length; i++) {
    const white = random() * 2 - 1;
    if (colour === 'pink') {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
    } else if (colour === 'brown') {
      last = (last + 0.02 * white) / 1.02;
      out[i] = last;
    } else out[i] = white;
  }
  return out;
}

/** The RBJ cookbook's biquad, run over the samples in place. */
function filterInPlace(samples: Float32Array, kind: Layer['filter'], frequency: number, q: number, rate: number) {
  if (kind === undefined || kind === 'none') return;
  const w = (2 * Math.PI * Math.min(frequency, rate / 2 - 1)) / rate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const [b0, b1, b2] =
    kind === 'lowpass'
      ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2]
      : kind === 'highpass'
        ? [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
        : [alpha, 0, -alpha];
  const [a1, a2] = [-2 * cos, 1 - alpha];
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i] as number;
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    [x2, x1, y2, y1] = [x1, x, y1, y];
    samples[i] = y;
  }
}

function scaleToRms(samples: Float32Array, rms: number) {
  let sum = 0;
  for (const s of samples) sum += s * s;
  const now = Math.sqrt(sum / Math.max(1, samples.length));
  if (now > 0) for (let i = 0; i < samples.length; i++) samples[i] = ((samples[i] as number) * rms) / now;
}

/** A drone with a whole number of cycles in the loop, so it meets itself. */
function drone(shape: Layer['shape'], frequency: number, length: number, rate: number): Float32Array<ArrayBuffer> {
  const cycles = Math.max(1, Math.round(frequency * LOOP_SECONDS));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const phase = ((i * cycles) / (LOOP_SECONDS * rate)) % 1;
    out[i] =
      0.5 *
      (shape === 'triangle'
        ? 1 - 4 * Math.abs(phase - 0.5)
        : shape === 'saw'
          ? 2 * phase - 1
          : Math.sin(2 * Math.PI * phase));
  }
  return out;
}

/**
 * One layer of an ambience as a seamless loop: `seed` names the ambience and the layer, so its
 * noise is the same wherever it is made. Its level wanders by `sway` along two slow sines with
 * whole periods in the loop.
 */
export function renderLayer(layer: Layer, seed: string, rate: number = LOOP_RATE): Float32Array<ArrayBuffer> {
  const loop = LOOP_SECONDS * rate;
  const seam = Math.round(SEAM_SECONDS * rate);
  const length = loop + seam;
  let samples: Float32Array<ArrayBuffer>;
  if (layer.kind === 'drone') samples = drone(layer.shape, layer.frequency ?? 110, length, rate);
  else {
    samples = noise(layer.colour, length, seeded(fnv1a32(seed)));
    filterInPlace(samples, layer.filter ?? 'lowpass', layer.frequency ?? 800, layer.q ?? Math.SQRT1_2, rate);
    scaleToRms(samples, NOISE_RMS);
  }
  const gain = layer.gain ?? 0.5;
  const sway = layer.sway ?? 0;
  for (let i = 0; i < length; i++) {
    const at = (i % loop) / loop;
    const wander = 0.5 + 0.25 * Math.sin(2 * Math.PI * at) + 0.25 * Math.sin(2 * Math.PI * 3 * at + 1);
    samples[i] = (samples[i] as number) * gain * (1 - sway * wander);
  }
  const out = samples.slice(0, loop);
  for (let k = 0; k < seam; k++) {
    const into = k / seam;
    out[k] = (samples[k] as number) * into + (samples[loop + k] as number) * (1 - into);
  }
  return out;
}

/** The largest magnitude in the samples. */
export function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  return peak;
}
