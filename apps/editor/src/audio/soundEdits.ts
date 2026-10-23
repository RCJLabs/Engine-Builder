/**
 * What the sound preview does to a sound (M4.8, D58, docs/specs/audio.md#the-editor), as plain
 * functions: a voice from what ZzFX's designer copies, a preset's voices, and a voice varied a
 * little. Randomness is passed in, so a test can hold it still.
 */
import { SHAPES, type Shape, type SoundRecord, type Voice, voiceFromZzfx, ZZFX_FIELDS } from '@eb/ui/format';

/**
 * The numbers in `zzfx(...[1,,220])`, `zzfx(1,,220)`, `[1,,220]` or `1,,220`, holes as undefined;
 * undefined when it isn't one of those, or a number among them isn't one.
 */
export function zzfxNumbers(text: string): (number | undefined)[] | undefined {
  const inner = text
    .trim()
    .replace(/;$/, '')
    .replace(/^zzfx\s*\(\s*(\.\.\.)?/i, '')
    .replace(/\)\s*$/, '')
    .trim()
    .replace(/^\[/, '')
    .replace(/\]$/, '');
  if (inner.trim() === '') return undefined;
  const parts = inner.split(',').map((part) => part.trim());
  const numbers: (number | undefined)[] = [];
  for (const part of parts) {
    if (part === '' || part === 'undefined') numbers.push(undefined);
    else if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(part)) numbers.push(Number(part));
    else return undefined;
  }
  return numbers;
}

/** A voice from pasted ZzFX, or why not. */
export function pastedVoice(text: string): Voice | string {
  const numbers = zzfxNumbers(text);
  if (!numbers) return 'That isn’t a ZzFX sound: paste what ZzFX’s designer copies, like zzfx(...[,,925,.04,.3]).';
  return voiceFromZzfx(numbers) ?? `ZzFX takes at most ${ZZFX_FIELDS.length} numbers, its shape 0 to 5.`;
}

/** A sound's voices as the form holds them: anything that isn't a voice left out, so a half-made one still plays. */
export function playable(value: unknown): SoundRecord {
  const voices = (value as { voices?: unknown } | null)?.voices;
  if (!Array.isArray(voices)) return { voices: [] };
  return {
    voices: voices.flatMap((voice) => {
      if (typeof voice !== 'object' || voice === null) return [];
      const clean: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(voice)) {
        if (key === 'shape' ? SHAPES.includes(v as Shape) : typeof v === 'number' && Number.isFinite(v)) clean[key] = v;
      }
      return [clean as Voice];
    }),
  };
}

type Random = () => number;
const between = (random: Random, lo: number, hi: number) => lo + random() * (hi - lo);
/** Two decimals, or whole hertz: what a person would type. */
const round = (field: string, v: number) =>
  field === 'frequency' || field === 'filter' ? Math.round(v) : Math.round(v * 100) / 100;

const voice = (random: Random, fields: Readonly<Record<string, readonly [number, number] | Shape>>): Voice => {
  const made: Record<string, unknown> = {};
  for (const [field, range] of Object.entries(fields)) {
    made[field] = typeof range === 'string' ? range : round(field, between(random, range[0], range[1]));
  }
  return made as Voice;
};

/** The presets Start from offers, each a voice drawn from its own ranges (after sfxr's categories, written here). */
export const PRESETS: Readonly<Record<string, (random: Random) => Voice[]>> = {
  Blip: (r) => [voice(r, { volume: [0.4, 0.6], frequency: [600, 1200], release: [0.03, 0.08], shape: 'square' })],
  Pickup: (r) => [
    voice(r, {
      volume: [0.5, 0.7],
      frequency: [800, 1400],
      sustain: [0.03, 0.08],
      release: [0.1, 0.2],
      shape: 'square',
      'pitch-jump': [200, 600],
      'pitch-jump-time': [0.03, 0.08],
    }),
  ],
  Jump: (r) => [
    voice(r, { volume: [0.5, 0.7], frequency: [200, 400], release: [0.15, 0.3], shape: 'triangle', slide: [3, 8] }),
  ],
  Hit: (r) => [
    voice(r, {
      volume: [0.6, 0.9],
      frequency: [60, 200],
      release: [0.1, 0.25],
      shape: 'noise',
      noise: [0.5, 1],
      slide: [-3, -1],
    }),
  ],
  Laser: (r) => [
    voice(r, { volume: [0.4, 0.6], frequency: [900, 1600], release: [0.1, 0.25], shape: 'saw', slide: [-10, -4] }),
  ],
  Explosion: (r) => [
    voice(r, {
      volume: [0.8, 1],
      frequency: [40, 100],
      release: [0.4, 1],
      shape: 'noise',
      noise: [1, 3],
      filter: [-1200, -400],
    }),
  ],
  'Power-up': (r) => [
    voice(r, {
      volume: [0.5, 0.7],
      frequency: [300, 500],
      sustain: [0.1, 0.2],
      release: [0.2, 0.3],
      shape: 'triangle',
      slide: [2, 5],
      'repeat-time': [0.06, 0.1],
      tremolo: [0.2, 0.4],
    }),
  ],
  Step: (r) => [
    voice(r, {
      volume: [0.4, 0.6],
      frequency: [80, 150],
      release: [0.05, 0.1],
      shape: 'noise',
      noise: [0.4, 0.8],
      filter: [-900, -500],
    }),
  ],
};

/** The bounds a voice's fields keep to, as the sound's type file has them. */
const BOUNDS: Readonly<Record<string, readonly [number, number]>> = {
  volume: [0, 4],
  randomness: [0, 1],
  frequency: [0, 20000],
  'sustain-volume': [0, 1],
  'bit-crush': [0, 1],
  tremolo: [0, 1],
  delay: [0, 1],
};

/** Each number a voice sets, moved by up to a tenth either way, kept in bounds; its shape and start kept. */
export function vary(voice: Voice, random: Random): Voice {
  const varied: Record<string, unknown> = {};
  for (const [field, v] of Object.entries(voice)) {
    if (typeof v !== 'number' || field === 'at') {
      varied[field] = v;
      continue;
    }
    const [lo, hi] = BOUNDS[field] ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
    varied[field] = Math.min(hi, Math.max(lo, round(field, v * (1 + (random() * 2 - 1) * 0.1))));
  }
  return varied as Voice;
}
