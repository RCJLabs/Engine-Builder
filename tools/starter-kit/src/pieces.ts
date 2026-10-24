/**
 * The starter kit's pieces (M5.5, D67, docs/specs/models.md#the-starter-kit): twenty-one low-poly
 * things to block out a place with, each standing on its origin, a metre being a metre. Each part
 * is named by its material, which the kit's material records draw it with, and each piece names
 * the collider shape that fits it best: a box unless it is round or rough.
 */
import type { ColliderShape } from '@eb/schema';
import { box, cylinder, type Shape, wedge } from './shapes.ts';

export const KIT_MATERIALS = ['wood', 'stone', 'metal', 'painted', 'leaves', 'glow'] as const;
export type KitMaterial = (typeof KIT_MATERIALS)[number];

export interface Piece {
  readonly id: string;
  readonly name: string;
  readonly parts: Partial<Record<KitMaterial, readonly Shape[]>>;
  readonly collider: ColliderShape;
}

const legs = (w: number, d: number, h: number, t: number) =>
  [-1, 1].flatMap((x) => [-1, 1].map((z) => box([t, h, t], [(x * (w - t)) / 2, 0, (z * (d - t)) / 2])));

const steps = (count: number, rise: number, run: number, width: number) =>
  Array.from({ length: count }, (_, i) => box([width, rise * (i + 1), run], [0, 0, (count / 2 - i - 0.5) * run]));

export const PIECES: readonly Piece[] = [
  { id: 'floor', name: 'Floor', parts: { stone: [box([2, 0.1, 2])] }, collider: 'box' },
  { id: 'wall', name: 'Wall', parts: { stone: [box([2, 2.5, 0.2])] }, collider: 'box' },
  {
    id: 'doorway',
    name: 'Doorway',
    parts: {
      stone: [box([0.6, 2.5, 0.2], [-0.7, 0, 0]), box([0.6, 2.5, 0.2], [0.7, 0, 0]), box([0.8, 0.5, 0.2], [0, 2, 0])],
    },
    collider: 'box',
  },
  {
    id: 'window-wall',
    name: 'Window wall',
    parts: {
      stone: [
        box([2, 1, 0.2]),
        box([2, 0.5, 0.2], [0, 2, 0]),
        box([0.6, 1, 0.2], [-0.7, 1, 0]),
        box([0.6, 1, 0.2], [0.7, 1, 0]),
      ],
      wood: [box([0.8, 0.06, 0.24], [0, 1, 0])],
    },
    collider: 'box',
  },
  { id: 'stairs', name: 'Stairs', parts: { stone: steps(4, 0.25, 0.3, 1.2) }, collider: 'box' },
  { id: 'ramp', name: 'Ramp', parts: { stone: [wedge([1.2, 1, 2])] }, collider: 'hull' },
  {
    id: 'pillar',
    name: 'Pillar',
    parts: {
      stone: [box([0.7, 0.2, 0.7]), cylinder(0.25, 0.25, 2.1, 8, [0, 0.2, 0], 22.5), box([0.6, 0.2, 0.6], [0, 2.3, 0])],
    },
    collider: 'box',
  },
  {
    id: 'crate',
    name: 'Crate',
    parts: {
      wood: [box([0.8, 0.8, 0.8])],
      metal: [box([0.84, 0.06, 0.84], [0, 0.1, 0]), box([0.84, 0.06, 0.84], [0, 0.64, 0])],
    },
    collider: 'box',
  },
  {
    id: 'barrel',
    name: 'Barrel',
    parts: {
      wood: [cylinder(0.3, 0.36, 0.5, 12), cylinder(0.36, 0.3, 0.5, 12, [0, 0.5, 0])],
      metal: [cylinder(0.33, 0.33, 0.05, 12, [0, 0.18, 0]), cylinder(0.33, 0.33, 0.05, 12, [0, 0.77, 0])],
    },
    collider: 'capsule',
  },
  {
    id: 'fence',
    name: 'Fence',
    parts: {
      wood: [
        box([0.1, 1, 0.1], [-0.9, 0, 0]),
        box([0.1, 1, 0.1], [0.9, 0, 0]),
        box([2, 0.08, 0.05], [0, 0.4, 0]),
        box([2, 0.08, 0.05], [0, 0.8, 0]),
      ],
    },
    collider: 'box',
  },
  {
    id: 'gate',
    name: 'Gate',
    parts: {
      wood: [box([0.12, 1.2, 0.12], [-0.9, 0, 0]), box([0.12, 1.2, 0.12], [0.9, 0, 0])],
      painted: [box([1.6, 0.9, 0.05], [0, 0.15, 0])],
      metal: [box([0.1, 0.1, 0.08], [0.7, 0.6, 0])],
    },
    collider: 'box',
  },
  {
    id: 'rock-small',
    name: 'Small rock',
    parts: { stone: [cylinder(0.45, 0.25, 0.4, 5, [0, 0, 0], 10)] },
    collider: 'hull',
  },
  {
    id: 'rock-large',
    name: 'Large rock',
    parts: { stone: [cylinder(1.1, 0.8, 0.6, 7, [0, 0, 0], 5), cylinder(0.8, 0.3, 0.7, 7, [0, 0.6, 0], 30)] },
    collider: 'hull',
  },
  {
    id: 'pine',
    name: 'Pine',
    parts: {
      wood: [cylinder(0.14, 0.1, 1, 6)],
      leaves: [
        cylinder(0.9, 0, 1.4, 8, [0, 0.8, 0]),
        cylinder(0.7, 0, 1.2, 8, [0, 1.6, 0], 22.5),
        cylinder(0.45, 0, 1, 8, [0, 2.3, 0]),
      ],
    },
    collider: 'capsule',
  },
  {
    id: 'oak',
    name: 'Oak',
    parts: {
      wood: [cylinder(0.22, 0.16, 1.8, 7)],
      leaves: [cylinder(1.2, 1.4, 0.8, 9, [0, 1.6, 0]), cylinder(1.4, 0.5, 1.1, 9, [0, 2.4, 0], 20)],
    },
    collider: 'capsule',
  },
  {
    id: 'bush',
    name: 'Bush',
    parts: { leaves: [cylinder(0.4, 0.6, 0.3, 8), cylinder(0.6, 0.2, 0.5, 8, [0, 0.3, 0], 22.5)] },
    collider: 'sphere',
  },
  {
    // A tuft for foliage's grass preset (M5.6, D68): five thin three-sided blades, few triangles
    // since a meadow draws thousands.
    id: 'grass',
    name: 'Grass',
    parts: {
      leaves: [
        cylinder(0.035, 0, 0.45, 3),
        cylinder(0.03, 0, 0.35, 3, [0.08, 0, 0.03], 40),
        cylinder(0.03, 0, 0.4, 3, [-0.07, 0, 0.05], 80),
        cylinder(0.03, 0, 0.3, 3, [0.02, 0, -0.08], 20),
        cylinder(0.025, 0, 0.32, 3, [-0.04, 0, -0.05], 60),
      ],
    },
    collider: 'box',
  },
  {
    id: 'lamp-post',
    name: 'Lamp post',
    parts: {
      metal: [
        box([0.3, 0.1, 0.3]),
        cylinder(0.05, 0.05, 2.3, 6, [0, 0.1, 0]),
        cylinder(0.22, 0, 0.18, 4, [0, 2.65, 0], 45),
      ],
      glow: [box([0.24, 0.25, 0.24], [0, 2.4, 0])],
    },
    collider: 'box',
  },
  {
    id: 'table',
    name: 'Table',
    parts: { wood: [box([1.2, 0.08, 0.8], [0, 0.72, 0]), ...legs(1.2, 0.8, 0.72, 0.08)] },
    collider: 'box',
  },
  {
    id: 'bench',
    name: 'Bench',
    parts: {
      wood: [
        box([1.4, 0.06, 0.4], [0, 0.4, 0]),
        box([0.08, 0.4, 0.36], [-0.6, 0, 0]),
        box([0.08, 0.4, 0.36], [0.6, 0, 0]),
      ],
    },
    collider: 'box',
  },
  {
    id: 'chest',
    name: 'Chest',
    parts: {
      wood: [box([0.9, 0.5, 0.6])],
      painted: [box([0.94, 0.16, 0.64], [0, 0.5, 0])],
      metal: [box([0.12, 0.14, 0.04], [0, 0.42, 0.32])],
    },
    collider: 'box',
  },
];
