/**
 * The engine's foliage type (M5.6, D68, docs/specs/foliage.md#the-foliage-record): a model
 * scattered over a terrain, as plants per 100 m² where it is painted fully, with their size, turn,
 * lean, and the ground they grow on. A terrain lists the ones it paints; the density is a channel
 * of the PNG beside its space. Every field but the model may be left out, for FOLIAGE_DEFAULTS's
 * value. Ranges in order are the one rule a type file can't say (E074).
 */
import type { Report } from './checkValue.ts';
import type { FieldDef, TypeFile } from './typeFile.ts';
import { type DataType, typeFromFile } from './typeSchema.ts';

export const FOLIAGE = 'foliage';

/** A foliage record as its file holds it. */
export interface FoliageRecord {
  readonly name?: string;
  readonly model: string;
  readonly density?: number;
  readonly smallest?: number;
  readonly largest?: number;
  readonly turn?: boolean;
  readonly lean?: number;
  readonly steepest?: number;
  readonly lowest?: number;
  readonly highest?: number;
  readonly distance?: number;
}

/** What each field left out is; `lowest` and `highest` left out set no limit. */
export const FOLIAGE_DEFAULTS = Object.freeze({
  density: 10,
  smallest: 0.8,
  largest: 1.2,
  turn: true,
  lean: 0,
  steepest: 90,
  distance: 200,
} as const satisfies Required<Omit<FoliageRecord, 'name' | 'model' | 'lowest' | 'highest'>>);

const num = (label: string, min: number, max: number, description: string): FieldDef => ({
  kind: 'number',
  optional: true,
  label,
  min,
  max,
  description,
});

export const FOLIAGE_TYPE_FILE: TypeFile = {
  title: 'Foliage',
  description: 'A model scattered over a terrain where it is painted (docs/specs/foliage.md).',
  nameField: 'name',
  fields: {
    name: { kind: 'text', optional: true, label: 'Name' },
    model: { kind: 'ref', to: 'model', label: 'Model', description: 'What is scattered' },
    density: num('Density', 0.01, 400, 'Plants per 100 m² where it is painted fully: 10 when left out'),
    smallest: num('Smallest', 0.05, 20, 'The smallest a plant is, times the model’s scale: 0.8 when left out'),
    largest: num('Largest', 0.05, 20, 'The largest a plant is: 1.2 when left out'),
    turn: {
      kind: 'bool',
      optional: true,
      label: 'Turn at random',
      description: 'About its upright: yes when left out',
    },
    lean: num('Lean', 0, 1, '0 stands upright, 1 square to the ground: 0 when left out'),
    steepest: num('Steepest', 0, 90, 'No plant on ground steeper than this, in degrees: 90 when left out'),
    lowest: {
      kind: 'number',
      optional: true,
      label: 'Lowest',
      description: 'No plant on ground below this, in metres',
    },
    highest: {
      kind: 'number',
      optional: true,
      label: 'Highest',
      description: 'No plant on ground above this, in metres',
    },
    distance: num('Drawn to', 5, 5000, 'Drawn up to this many metres from the camera: 200 when left out'),
  },
};

export const FOLIAGE_DATA: DataType = typeFromFile(FOLIAGE, FOLIAGE_TYPE_FILE);

/** A foliage record that passed its schema: its size range and its heights in order (E074). */
export function checkFoliage(record: FoliageRecord, report: Report): void {
  const smallest = record.smallest ?? FOLIAGE_DEFAULTS.smallest;
  const largest = record.largest ?? FOLIAGE_DEFAULTS.largest;
  if (smallest > largest) {
    const path = record.smallest === undefined ? '/largest' : '/smallest';
    report('E074', path, `The smallest, ${smallest}, is above the largest, ${largest}`);
  }
  if (record.lowest !== undefined && record.highest !== undefined && record.lowest >= record.highest) {
    report('E074', '/lowest', `The lowest, ${record.lowest} m, isn’t below the highest, ${record.highest} m`);
  }
}

export interface FoliagePreset {
  readonly id: string;
  readonly name: string;
  /** The starter kit's model it is made with, when the project has it. */
  readonly kitModel: string;
  readonly value: Omit<FoliageRecord, 'name' | 'model'>;
}

/** The presets, as docs/specs/foliage.md tables them. */
export const FOLIAGE_PRESETS: readonly FoliagePreset[] = Object.freeze([
  {
    id: 'trees',
    name: 'Trees',
    kitModel: 'kit-pine',
    value: { density: 2, smallest: 0.8, largest: 1.3, turn: true, lean: 0, steepest: 35, distance: 400 },
  },
  {
    id: 'bushes',
    name: 'Bushes',
    kitModel: 'kit-bush',
    value: { density: 8, smallest: 0.7, largest: 1.2, turn: true, lean: 0.2, steepest: 40, distance: 200 },
  },
  {
    id: 'grass',
    name: 'Grass',
    kitModel: 'kit-grass',
    value: { density: 150, smallest: 0.6, largest: 1.3, turn: true, lean: 1, steepest: 45, distance: 60 },
  },
  {
    id: 'rocks',
    name: 'Rocks',
    kitModel: 'kit-rock-small',
    value: { density: 3, smallest: 0.5, largest: 1.8, turn: true, lean: 1, steepest: 90, distance: 300 },
  },
]);
