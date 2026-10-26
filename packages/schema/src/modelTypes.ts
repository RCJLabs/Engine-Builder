/**
 * The engine's model type (M5.5, D67, docs/specs/models.md#model): a 3D model in a project, as its
 * file under assets/ and how it is drawn there: its scale, which material record each of the
 * file's materials is drawn with, its LOD levels and its collider. A space places a model record;
 * a record whose type has a field naming a model is drawn as it. The rules a type file can't say
 * are E071 (LOD levels out of order) and E072 (a collider without its shape's numbers); the
 * compiler reads the file for E070 and W146.
 */
import type { Report } from './checkValue.ts';
import type { FieldDef, TypeFile } from './typeFile.ts';
import { type DataType, typeFromFile } from './typeSchema.ts';

export const MODEL = 'model';

export const COLLIDER_SHAPES = ['box', 'sphere', 'capsule', 'hull'] as const;
export type ColliderShape = (typeof COLLIDER_SHAPES)[number];
export type Vec3 = readonly [number, number, number];

/** At most three LOD levels beyond the whole mesh; a hull of 4 to 64 points. */
export const LOD_MOST = 3;
export const HULL_LEAST = 4;
export const HULL_MOST = 64;

export interface ModelCollider {
  readonly shape: ColliderShape;
  readonly center?: Vec3;
  readonly size?: Vec3;
  readonly radius?: number;
  readonly height?: number;
  readonly points?: readonly Vec3[];
}

export interface ModelSlot {
  readonly slot: string;
  readonly material: string;
}

/** What import wrote of a skinned model put on the rig (M6.5): each humanoid bone, as the joint it was. */
export interface ModelRig {
  readonly bones: Readonly<Record<string, string>>;
}

/** A clip of the model's file, as import listed it; its pace may be set by hand. */
export interface ModelClip {
  readonly name: string;
  readonly length: number;
  readonly pace?: number;
}

export interface LodLevel {
  readonly ratio: number;
  readonly from: number;
}

/** A model record as its file holds it. */
export interface ModelRecord {
  readonly name?: string;
  readonly file: string;
  readonly scale?: number;
  readonly materials?: readonly ModelSlot[];
  readonly lod?: readonly LodLevel[];
  readonly collider?: ModelCollider;
  readonly rig?: ModelRig;
  readonly clips?: readonly ModelClip[];
}

/** What each of a collider's shapes needs, in the order a fitted one is written. */
export const COLLIDER_NEEDS: Readonly<Record<ColliderShape, readonly (keyof Omit<ModelCollider, 'shape'>)[]>> = {
  box: ['center', 'size'],
  sphere: ['center', 'radius'],
  capsule: ['center', 'radius', 'height'],
  hull: ['points'],
};
const COLLIDER_FIELDS = ['center', 'size', 'radius', 'height', 'points'] as const;

const vec3 = (label: string, description: string): FieldDef => ({
  kind: 'list',
  of: { kind: 'number' },
  min: 3,
  max: 3,
  optional: true,
  label,
  description,
});

// Written by import (M6.5, D77): a model put on the engine's rig, and its clips.
const RIG_FIELDS: TypeFile['fields'] = {
  rig: {
    kind: 'group',
    optional: true,
    label: 'Rig',
    description: 'Set as it was imported: its skeleton put on the engine’s humanoid rig',
    fields: {
      bones: {
        kind: 'map',
        of: { kind: 'text', min: 1 },
        label: 'Bones',
        description: 'Each humanoid bone, as the joint it was in the file',
      },
    },
  },
  clips: {
    kind: 'list',
    optional: true,
    label: 'Clips',
    description: 'Its file’s clips, as import listed them, played in place',
    of: {
      kind: 'group',
      fields: {
        name: { kind: 'text', min: 1, label: 'Clip' },
        length: { kind: 'number', min: 0, label: 'Length', description: 'Seconds' },
        pace: {
          kind: 'number',
          min: 0,
          max: 20,
          optional: true,
          label: 'Pace',
          description: 'Metres a second it was made for: a walk played at the speed moved over it',
        },
      },
    },
  },
};

export const MODEL_TYPE_FILE: TypeFile = {
  title: 'Model',
  description: 'A 3D model: its file, scale, materials, LOD and collider (docs/specs/models.md).',
  nameField: 'name',
  fields: {
    name: { kind: 'text', optional: true, label: 'Name' },
    file: { kind: 'asset', of: 'model', label: 'File', description: 'A .glb or .gltf under assets/' },
    scale: {
      kind: 'number',
      min: 0.001,
      max: 1000,
      optional: true,
      label: 'Scale',
      description: 'The whole model’s size: 1 when left out',
    },
    materials: {
      kind: 'list',
      optional: true,
      label: 'Materials',
      description: 'Each of the file’s materials, by its name there, drawn with a material record instead',
      of: {
        kind: 'group',
        fields: {
          slot: { kind: 'text', min: 1, label: 'In the file', description: 'Its name in the file, or #0, #1… unnamed' },
          material: { kind: 'ref', to: 'material', label: 'Drawn with' },
        },
      },
    },
    lod: {
      kind: 'list',
      optional: true,
      max: LOD_MOST,
      label: 'LOD levels',
      description: 'Fewer triangles from farther away: each keeps its ratio of them from its distance on',
      of: {
        kind: 'group',
        fields: {
          ratio: {
            kind: 'number',
            min: 0.01,
            max: 0.99,
            label: 'Keeps',
            description: 'Of the triangles, 0.01 to 0.99',
          },
          from: { kind: 'number', min: 0.1, max: 10000, label: 'From, in metres' },
        },
      },
    },
    collider: {
      kind: 'group',
      optional: true,
      label: 'Collider',
      description: 'What the physics holds it as, in the model’s own metres. Fit collider measures one',
      fields: {
        shape: { kind: 'enum', values: [...COLLIDER_SHAPES], label: 'Shape' },
        center: vec3('Centre', 'Its middle, x, y, z'),
        size: vec3('Size', 'A box’s width, height and depth'),
        radius: { kind: 'number', min: 0, optional: true, label: 'Radius' },
        height: { kind: 'number', min: 0, optional: true, label: 'Height', description: 'A capsule’s, caps included' },
        points: {
          kind: 'list',
          of: { kind: 'list', of: { kind: 'number' }, min: 3, max: 3 },
          min: HULL_LEAST,
          max: HULL_MOST,
          optional: true,
          label: 'Points',
          description: 'A hull’s corners, x, y, z each',
        },
      },
    },
    ...RIG_FIELDS,
  },
};

export const MODEL_DATA: DataType = typeFromFile(MODEL, MODEL_TYPE_FILE);

/** A model record that passed its schema: LOD levels in order (E071) and a collider with its numbers (E072). */
export function checkModel(record: ModelRecord, report: Report): void {
  (record.lod ?? []).forEach((level, i) => {
    const before = record.lod?.[i - 1];
    if (!before) return;
    if (level.ratio >= before.ratio)
      report(
        'E071',
        `/lod/${i}/ratio`,
        `Level ${i + 1} keeps ${level.ratio}, not fewer than level ${i}’s ${before.ratio}`,
      );
    if (level.from <= before.from)
      report(
        'E071',
        `/lod/${i}/from`,
        `Level ${i + 1} starts at ${level.from} m, not beyond level ${i}’s ${before.from} m`,
      );
  });
  if (record.collider) checkCollider(record.collider, report);
}

function checkCollider(collider: ModelCollider, report: Report): void {
  const needs: readonly string[] = COLLIDER_NEEDS[collider.shape];
  const a = collider.shape === 'hull' ? 'A hull' : `A ${collider.shape}`;
  for (const field of COLLIDER_FIELDS) {
    const has = collider[field] !== undefined;
    if (needs.includes(field) && !has) report('E072', `/collider/${field}`, `${a} needs its ${field}`);
    if (!needs.includes(field) && has) report('E072', `/collider/${field}`, `${a} has no ${field}: take it out`);
  }
  if (collider.size?.some((n) => n <= 0)) report('E072', '/collider/size', 'Each of a box’s sides is above 0 m');
  if (collider.radius !== undefined && collider.radius <= 0 && needs.includes('radius'))
    report('E072', '/collider/radius', 'Its radius is above 0 m');
  if (collider.shape === 'capsule' && collider.radius !== undefined && collider.height !== undefined) {
    if (collider.height < 2 * collider.radius)
      report('E072', '/collider/height', `A capsule is at least as long as it is wide, ${2 * collider.radius} m`);
  }
}
