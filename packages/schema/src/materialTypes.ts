/**
 * The engine's material type (M5.5, D67, docs/specs/models.md#material): how a surface is drawn, as
 * a colour, roughness, metalness, glow and opacity. A model's slots name materials to draw its own
 * with. Every field may be left out, for MATERIAL_DEFAULTS's value. The presets are data that
 * Start from and New material from write, and the starter kit's materials are made from them.
 */
import type { FieldDef, TypeFile } from './typeFile.ts';
import { type DataType, typeFromFile } from './typeSchema.ts';

export const MATERIAL = 'material';

/** A material record as its file holds it. */
export interface MaterialRecord {
  readonly name?: string;
  readonly color?: string;
  readonly roughness?: number;
  readonly metalness?: number;
  readonly emissive?: string;
  readonly 'emissive-strength'?: number;
  readonly opacity?: number;
}

/** What each field left out is: a matt light grey that doesn't glow. */
export const MATERIAL_DEFAULTS = Object.freeze({
  color: '#b0b0b0',
  roughness: 0.8,
  metalness: 0,
  emissive: '#000000',
  'emissive-strength': 1,
  opacity: 1,
} as const satisfies Required<Omit<MaterialRecord, 'name'>>);

const num = (label: string, min: number, max: number, description: string): FieldDef => ({
  kind: 'number',
  optional: true,
  label,
  min,
  max,
  description,
});

export const MATERIAL_TYPE_FILE: TypeFile = {
  title: 'Material',
  description: 'How a surface is drawn: colour, roughness, metalness, glow and opacity (docs/specs/models.md).',
  nameField: 'name',
  fields: {
    name: { kind: 'text', optional: true, label: 'Name' },
    color: { kind: 'colour', optional: true, label: 'Colour', description: 'The base colour' },
    roughness: num('Roughness', 0, 1, '0 a mirror, 1 chalk: 0.8 when left out'),
    metalness: num('Metalness', 0, 1, '1 for bare metal: 0 when left out'),
    emissive: { kind: 'colour', optional: true, label: 'Glow', description: 'The colour it glows: none when left out' },
    'emissive-strength': num('Glow strength', 0, 10, 'How bright the glow is: 1 when left out'),
    opacity: num('Opacity', 0, 1, 'Below 1 it is see-through: 1 when left out'),
  },
};

export const MATERIAL_DATA: DataType = typeFromFile(MATERIAL, MATERIAL_TYPE_FILE);

export interface MaterialPreset {
  readonly id: string;
  readonly name: string;
  readonly value: MaterialRecord;
}

/** The presets, as docs/specs/models.md tables them. */
export const MATERIAL_PRESETS: readonly MaterialPreset[] = Object.freeze([
  { id: 'wood', name: 'Wood', value: { color: '#8a5a35', roughness: 0.8, metalness: 0 } },
  { id: 'stone', name: 'Stone', value: { color: '#8d8a84', roughness: 0.95, metalness: 0 } },
  { id: 'metal', name: 'Metal', value: { color: '#b8bcc2', roughness: 0.35, metalness: 1 } },
  { id: 'painted', name: 'Painted', value: { color: '#c4473a', roughness: 0.5, metalness: 0.1 } },
  { id: 'plastic', name: 'Plastic', value: { color: '#e4e4e4', roughness: 0.45, metalness: 0 } },
  { id: 'glass', name: 'Glass', value: { color: '#cfe8f0', roughness: 0.05, metalness: 0, opacity: 0.35 } },
  {
    id: 'glow',
    name: 'Glow',
    value: { color: '#ffd27a', roughness: 0.6, metalness: 0, emissive: '#ffb84d', 'emissive-strength': 3 },
  },
  { id: 'ground', name: 'Ground', value: { color: '#6b5a43', roughness: 1, metalness: 0 } },
]);
