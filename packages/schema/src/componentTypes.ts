/**
 * The engine's component kinds (M5.2, D64, docs/specs/components.md): what an object in a space can
 * carry, each a type file as a project's own kinds in components/ are, so a kind's form is drawn
 * and its fields checked as a record's are. Nothing runs them until M5.8, which fills in what a
 * file leaves out: a light is white, of intensity 1 and range 10 m; a collider a still box; a sound
 * plays at volume 1 to 10 m; water is #3a6d8c, of clarity 0.6 (M5.3).
 */
import type { TypeFile } from './typeFile.ts';
import { type DataType, typeFromFile } from './typeSchema.ts';

const metres = (label: string, description: string) =>
  ({ kind: 'number', optional: true, min: 0.1, max: 1000, label, description }) as const;

const KINDS: Readonly<Record<string, TypeFile>> = {
  light: {
    title: 'Light',
    description: 'A point light at the object.',
    fields: {
      color: { kind: 'colour', optional: true, label: 'Colour', description: 'White when left out' },
      intensity: {
        kind: 'number',
        optional: true,
        min: 0,
        max: 100,
        label: 'Intensity',
        description: '1 when left out',
      },
      range: metres('Range, in metres', 'How far it reaches: 10 m when left out'),
    },
  },
  collider: {
    title: 'Collider',
    description: 'Something solid, the size of the object.',
    fields: {
      shape: {
        kind: 'enum',
        values: ['box', 'sphere', 'capsule'],
        optional: true,
        label: 'Shape',
        description: 'A box when left out',
      },
      moves: { kind: 'bool', optional: true, label: 'Moves', description: 'Pushed and falling; still when left out' },
    },
  },
  trigger: {
    title: 'Trigger zone',
    description: 'A zone the size of the object whose effects run as the player comes in.',
    fields: {
      when: { kind: 'condition', optional: true, label: 'When', description: 'Every time when left out' },
      effects: { kind: 'effects', label: 'Effects' },
      once: { kind: 'bool', optional: true, label: 'Once', description: 'Only the first time the player comes in' },
    },
  },
  spawn: {
    title: 'Spawn point',
    description: 'A place the player can arrive at, facing the way the object is turned.',
    fields: {
      start: { kind: 'bool', optional: true, label: 'Start', description: 'Where the space is entered first' },
    },
  },
  // M5.3 (D65): water at a plane's height, as many as a space needs.
  water: {
    title: 'Water',
    description: 'Water at the object, which must be a plane: its top is the surface.',
    fields: {
      color: { kind: 'colour', optional: true, label: 'Colour', description: '#3a6d8c when left out' },
      clarity: {
        kind: 'number',
        optional: true,
        min: 0,
        max: 1,
        label: 'Clarity',
        description: 'How far the eye sees into it, 0 to 1: 0.6 when left out',
      },
    },
  },
  sound: {
    title: 'Sound',
    description: 'A sound or an ambience heard near the object.',
    fields: {
      of: { kind: 'ref', to: ['sound', 'ambience'], label: 'Sound' },
      volume: { kind: 'number', optional: true, min: 0, max: 1, label: 'Volume', description: '1 when left out' },
      range: metres('Range, in metres', 'How far it is heard: 10 m when left out'),
    },
  },
};

/** The engine's kinds in the order Add component offers them. */
export const ENGINE_COMPONENTS: ReadonlyMap<string, DataType> = new Map(
  Object.entries(KINDS).map(([kind, file]) => [kind, typeFromFile(kind, file)]),
);

export const isEngineComponent = (kind: string): boolean => ENGINE_COMPONENTS.has(kind);
