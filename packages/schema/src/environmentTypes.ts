/**
 * The engine's environment type (M5.4, D66, docs/specs/environments.md): a space's sky, sun, light,
 * fog and weather. Every project has it, as it has flags and sounds; a space names one, and the
 * editor's view draws it. Every field may be left out, for ENVIRONMENT_DEFAULTS's value. A fog's
 * near below its far is the one rule a type file can't say (E068).
 */
import type { Report } from './checkValue.ts';
import type { FieldDef, TypeFile } from './typeFile.ts';
import { type DataType, typeFromFile } from './typeSchema.ts';

export const ENVIRONMENT = 'environment';

export const SKIES = ['physical', 'gradient', 'colour'] as const;
export type Sky = (typeof SKIES)[number];
export const WEATHERS = ['none', 'rain', 'snow'] as const;
export type Weather = (typeof WEATHERS)[number];

export interface Fog {
  readonly color: string;
  readonly near: number;
  readonly far: number;
}

/** An environment record as its file holds it. */
export interface EnvironmentRecord {
  readonly name?: string;
  readonly hour?: number;
  readonly sky?: Sky;
  readonly turbidity?: number;
  readonly zenith?: string;
  readonly horizon?: string;
  readonly ground?: string;
  readonly sun?: string;
  readonly 'sun-strength'?: number;
  readonly ambient?: string;
  readonly 'ambient-strength'?: number;
  readonly fog?: Fog;
  readonly weather?: Weather;
  readonly 'weather-amount'?: number;
}

/** What each field left out is: noon under a clear physical sky, no fog, no weather. */
export const ENVIRONMENT_DEFAULTS = Object.freeze({
  hour: 12,
  sky: 'physical',
  turbidity: 2,
  zenith: '#3a6ea5',
  horizon: '#c9d6df',
  ground: '#5b5346',
  sun: '#fff4e0',
  'sun-strength': 2.2,
  ambient: '#ffffff',
  'ambient-strength': 1.6,
  weather: 'none',
  'weather-amount': 0.5,
} as const satisfies Required<Omit<EnvironmentRecord, 'name' | 'fog'>>);

const num = (label: string, min: number, max: number, description: string): FieldDef => ({
  kind: 'number',
  optional: true,
  label,
  min,
  max,
  description,
});
const colour = (label: string, description: string): FieldDef => ({
  kind: 'colour',
  optional: true,
  label,
  description,
});

export const ENVIRONMENT_TYPE_FILE: TypeFile = {
  title: 'Environment',
  description: 'A space’s sky, sun and time of day, light, fog and weather (docs/specs/environments.md).',
  nameField: 'name',
  fields: {
    name: { kind: 'text', optional: true, label: 'Name' },
    hour: num('Hour', 0, 24, 'The time of day, 0 to 24: the sun rises at 6 and sets at 18. 12 when left out'),
    sky: {
      kind: 'enum',
      values: [...SKIES],
      optional: true,
      label: 'Sky',
      description: 'Physical when left out; a gradient from ground to zenith; or the zenith’s colour alone',
    },
    turbidity: num('Haze', 1, 20, 'How hazy a physical sky is: 2 when left out'),
    zenith: colour('Zenith', 'A gradient’s top, or a colour sky’s only colour'),
    horizon: colour('Horizon', 'A gradient’s colour at the horizon'),
    ground: colour('Ground', 'A gradient’s colour below the horizon'),
    sun: colour('Sunlight', 'The sun’s colour at midday; it warms toward dawn and dusk'),
    'sun-strength': num('Sunlight strength', 0, 4, 'At noon: 2.2 when left out; 0 for no sun, as in a cave'),
    ambient: colour('Sky light', 'The light from the whole sky'),
    'ambient-strength': num('Sky light strength', 0, 4, 'By day: 1.6 when left out; a fifth of it at night'),
    fog: {
      kind: 'group',
      optional: true,
      label: 'Fog',
      description: 'None nearer than Near, all of its colour at Far and beyond. No fog when left out',
      fields: {
        color: { kind: 'colour', label: 'Colour' },
        near: { kind: 'number', min: 0, max: 10000, label: 'Near, in metres' },
        far: { kind: 'number', min: 0, max: 10000, label: 'Far, in metres' },
      },
    },
    weather: {
      kind: 'enum',
      values: [...WEATHERS],
      optional: true,
      label: 'Weather',
      description: 'None when left out',
    },
    'weather-amount': num('Weather amount', 0, 1, 'How much rain or snow falls: 0.5 when left out'),
  },
};

export const ENVIRONMENT_DATA: DataType = typeFromFile(ENVIRONMENT, ENVIRONMENT_TYPE_FILE);

/** An environment record that passed its schema: its fog's near below its far (E068). */
export function checkEnvironment(record: EnvironmentRecord, report: Report): void {
  const fog = record.fog;
  if (fog && fog.near >= fog.far) {
    report('E068', '/fog/near', `The fog starts at ${fog.near} m, not nearer than where it is whole, ${fog.far} m`);
  }
}
