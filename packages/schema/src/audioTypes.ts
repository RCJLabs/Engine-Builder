/**
 * The engine's audio types (M4.8, D58, docs/specs/audio.md#records): sounds as layered ZzFX voices,
 * ambience as synthesised layers and sounds now and then, music as file stems. Every project has
 * them, as it has flags and sheets; the sim never reads them. Their bounds are ZzFX's designer's,
 * a little wider, so a pasted sound fits.
 */
import {
  AMBIENCE,
  COLOURS,
  DRONE_SHAPES,
  FILTERS,
  LAYER_KINDS,
  MUSIC,
  SHAPES,
  SOUND,
  SOUND_BUSES,
} from '@eb/ui/format';
import type { FieldDef, TypeFile } from './typeFile.ts';
import { type DataType, typeFromFile } from './typeSchema.ts';

const num = (label: string, min: number, max: number, description?: string): FieldDef => ({
  kind: 'number',
  optional: true,
  label,
  min,
  max,
  ...(description ? { description } : {}),
});

/** ZzFX's parameters, by name, in its order, each with its default said. */
const VOICE: TypeFile['fields'] = {
  at: num('Starts at (s)', 0, 4, 'When this voice starts in the sound; 0 when left out'),
  volume: num('Volume', 0, 4, '1 when left out'),
  randomness: num('Randomness', 0, 1, 'How far each play’s pitch moves, either way; 0.05 when left out'),
  frequency: num('Frequency (Hz)', 0, 20000, '220 when left out'),
  attack: num('Attack (s)', 0, 3),
  sustain: num('Sustain (s)', 0, 3),
  release: num('Release (s)', 0, 3, '0.1 when left out'),
  shape: { kind: 'enum', values: [...SHAPES], optional: true, label: 'Shape', description: 'Sine when left out' },
  'shape-curve': num('Shape curve', 0, 10, '1 when left out; for a square, its duty'),
  slide: num('Slide', -100, 100),
  'delta-slide': num('Delta slide', -100, 100),
  'pitch-jump': num('Pitch jump (Hz)', -5000, 5000),
  'pitch-jump-time': num('Pitch jump time (s)', 0, 3),
  'repeat-time': num('Repeat time (s)', 0, 3),
  noise: num('Noise', 0, 10),
  modulation: num('Modulation (Hz)', -1000, 1000),
  'bit-crush': num('Bit crush', 0, 1),
  delay: num('Delay (s)', 0, 1),
  'sustain-volume': num('Sustain volume', 0, 1, '1 when left out'),
  decay: num('Decay (s)', 0, 3),
  tremolo: num('Tremolo', 0, 1),
  filter: num('Filter (Hz)', -22050, 22050, 'Above 0 cuts what is below it, under 0 what is above it'),
};

export const SOUND_TYPE_FILE: TypeFile = {
  title: 'Sound',
  description: 'A sound effect: one to three ZzFX voices, each starting at its own time (docs/specs/audio.md).',
  nameField: 'name',
  fields: {
    name: { kind: 'text', optional: true, label: 'Name' },
    bus: {
      kind: 'enum',
      values: [...SOUND_BUSES],
      optional: true,
      label: 'Bus',
      description: 'Effects when left out; interface for buttons and screens',
    },
    voices: { kind: 'list', label: 'Voices', min: 1, max: 3, of: { kind: 'group', fields: VOICE } },
  },
};

export const AMBIENCE_TYPE_FILE: TypeFile = {
  title: 'Ambience',
  description: 'What plays underneath: noise and drones made by the engine, and sounds now and then.',
  nameField: 'name',
  fields: {
    name: { kind: 'text', optional: true, label: 'Name' },
    layers: {
      kind: 'list',
      label: 'Layers',
      min: 1,
      max: 6,
      of: {
        kind: 'group',
        fields: {
          kind: { kind: 'enum', values: [...LAYER_KINDS], label: 'Kind' },
          colour: {
            kind: 'enum',
            values: [...COLOURS],
            optional: true,
            label: 'Colour',
            description: 'Of a noise; white when left out',
          },
          filter: {
            kind: 'enum',
            values: [...FILTERS],
            optional: true,
            label: 'Filter',
            description: 'Of a noise; low-pass when left out',
          },
          shape: {
            kind: 'enum',
            values: [...DRONE_SHAPES],
            optional: true,
            label: 'Shape',
            description: 'Of a drone; sine when left out',
          },
          frequency: num('Frequency (Hz)', 20, 11000, 'A drone’s pitch, or where a noise’s filter cuts'),
          q: num('Q', 0.1, 20, 'How sharp a noise’s filter is'),
          gain: num('Gain', 0, 1, '0.5 when left out'),
          sway: num('Sway', 0, 1, 'How far its level wanders'),
          when: { kind: 'condition', optional: true, label: 'Plays while' },
        },
      },
    },
    'now-and-then': {
      kind: 'list',
      optional: true,
      label: 'Now and then',
      of: {
        kind: 'group',
        fields: {
          sound: { kind: 'ref', to: SOUND, label: 'Sound' },
          'every-min': { kind: 'number', min: 1, max: 600, label: 'At least every (s)' },
          'every-max': { kind: 'number', min: 1, max: 600, label: 'At most every (s)' },
          when: { kind: 'condition', optional: true, label: 'Plays while' },
        },
      },
    },
  },
};

export const MUSIC_TYPE_FILE: TypeFile = {
  title: 'Music',
  description: 'Stems from audio files, started together, each playing while its condition holds.',
  nameField: 'name',
  fields: {
    name: { kind: 'text', optional: true, label: 'Name' },
    stems: {
      kind: 'list',
      label: 'Stems',
      max: 8,
      of: {
        kind: 'group',
        fields: {
          asset: { kind: 'asset', of: 'audio', label: 'File' },
          gain: num('Gain', 0, 1, '1 when left out'),
          when: { kind: 'condition', optional: true, label: 'Plays while' },
        },
      },
    },
    fade: num('Fade (s)', 0, 10, 'How long a stem eases in and out; 1.5 when left out'),
  },
};

export const SOUND_DATA: DataType = typeFromFile(SOUND, SOUND_TYPE_FILE);
export const AMBIENCE_DATA: DataType = typeFromFile(AMBIENCE, AMBIENCE_TYPE_FILE);
export const MUSIC_DATA: DataType = typeFromFile(MUSIC, MUSIC_TYPE_FILE);
export const AUDIO_DATA: readonly DataType[] = [SOUND_DATA, AMBIENCE_DATA, MUSIC_DATA];
