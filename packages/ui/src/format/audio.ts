/**
 * A game's sounds, ambience and music as their records hold them (M4.8, D58, docs/specs/audio.md):
 * three engine types the sim never reads. A sound's voices are ZzFX's parameters by name, so a
 * form can show them and a ZzFX array can be pasted in.
 */

/** ZzFX's wave shapes by name, in ZzFX's numbering. */
export const SHAPES = ['sine', 'triangle', 'saw', 'tan', 'noise', 'square'] as const;
export type Shape = (typeof SHAPES)[number];

/** ZzFX 1.4.0's parameters, in its order, with its defaults. */
export const ZZFX_FIELDS = [
  ['volume', 1],
  ['randomness', 0.05],
  ['frequency', 220],
  ['attack', 0],
  ['sustain', 0],
  ['release', 0.1],
  ['shape', 0],
  ['shape-curve', 1],
  ['slide', 0],
  ['delta-slide', 0],
  ['pitch-jump', 0],
  ['pitch-jump-time', 0],
  ['repeat-time', 0],
  ['noise', 0],
  ['modulation', 0],
  ['bit-crush', 0],
  ['delay', 0],
  ['sustain-volume', 1],
  ['decay', 0],
  ['tremolo', 0],
  ['filter', 0],
] as const;
export type ZzfxField = (typeof ZZFX_FIELDS)[number][0];

/** One voice: ZzFX's parameters, each optional, and when it starts in the sound. */
export type Voice = { readonly at?: number; readonly shape?: Shape } & {
  readonly [K in Exclude<ZzfxField, 'shape'>]?: number;
};

export const SOUND_BUSES = ['effects', 'interface'] as const;
export type SoundBus = (typeof SOUND_BUSES)[number];

export interface SoundRecord {
  readonly name?: string;
  readonly bus?: SoundBus;
  readonly voices: readonly Voice[];
}

export const LAYER_KINDS = ['noise', 'drone'] as const;
export const COLOURS = ['white', 'pink', 'brown'] as const;
export const FILTERS = ['lowpass', 'highpass', 'bandpass', 'none'] as const;
export const DRONE_SHAPES = ['sine', 'triangle', 'saw'] as const;

export interface Layer {
  readonly kind: (typeof LAYER_KINDS)[number];
  readonly colour?: (typeof COLOURS)[number];
  readonly filter?: (typeof FILTERS)[number];
  readonly shape?: (typeof DRONE_SHAPES)[number];
  /** A drone's pitch, or a noise's filter, in Hz. */
  readonly frequency?: number;
  readonly q?: number;
  readonly gain?: number;
  /** How far its level wanders, 0 to 1. */
  readonly sway?: number;
  readonly when?: string;
}

export interface NowAndThen {
  readonly sound: string;
  readonly 'every-min': number;
  readonly 'every-max': number;
  readonly when?: string;
}

export interface AmbienceRecord {
  readonly name?: string;
  readonly layers: readonly Layer[];
  readonly 'now-and-then'?: readonly NowAndThen[];
}

export interface Stem {
  readonly asset: string;
  readonly gain?: number;
  readonly when?: string;
}

export interface MusicRecord {
  readonly name?: string;
  readonly stems: readonly Stem[];
  /** Seconds to ease a stem's level, and to cross from other music. */
  readonly fade?: number;
}

export const SOUND = 'sound';
export const AMBIENCE = 'ambience';
export const MUSIC = 'music';

/** The buzzes a feedback line can name, lightest first; one a step, the heaviest (D58). */
export const BUZZES = {
  tap: [12],
  knock: [30],
  double: [30, 60, 30],
  thud: [70],
  alarm: [90, 60, 90],
} as const satisfies Record<string, readonly number[]>;
export type Buzz = keyof typeof BUZZES;
export const BUZZ_NAMES = Object.keys(BUZZES) as Buzz[];

/** What a step's beat calls for: a sound, a buzz or both (docs/specs/audio.md#cues). */
export interface Cue {
  readonly sound?: string;
  readonly buzz?: Buzz;
}

/** The interface's sounds, which the theme names. */
export const UI_SOUNDS = ['press', 'open', 'back'] as const;
export type UiSound = (typeof UI_SOUNDS)[number];

/** A game's audio as the worker sends it once: its records, and the files its music names as base64. */
export interface AudioPack {
  readonly sounds: Readonly<Record<string, SoundRecord>>;
  readonly ambience: Readonly<Record<string, AmbienceRecord>>;
  readonly music: Readonly<Record<string, MusicRecord>>;
  readonly files: Readonly<Record<string, string>>;
}

/** A voice as the arguments ZzFX's `buildSamples` takes, in its order, defaults filled in. */
export function zzfxArgs(voice: Voice): number[] {
  return ZZFX_FIELDS.map(([field, fallback]) => {
    if (field === 'shape') return voice.shape === undefined ? fallback : SHAPES.indexOf(voice.shape);
    return voice[field] ?? fallback;
  });
}

/**
 * A voice from a ZzFX array as its designer copies it, holes and all: only what differs from
 * ZzFX's default is written. Undefined when it isn't one: too long, or a value that isn't a
 * number, or a shape ZzFX doesn't have.
 */
export function voiceFromZzfx(args: readonly unknown[]): Voice | undefined {
  if (args.length > ZZFX_FIELDS.length) return undefined;
  const voice: Record<string, unknown> = {};
  for (const [index, value] of args.entries()) {
    if (value === undefined || value === null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    const [field, fallback] = ZZFX_FIELDS[index] as (typeof ZZFX_FIELDS)[number];
    if (value === fallback) continue;
    if (field === 'shape') {
      const shape = SHAPES[value];
      if (shape === undefined) return undefined;
      voice.shape = shape;
    } else voice[field] = value;
  }
  return voice as Voice;
}
