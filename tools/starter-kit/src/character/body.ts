/**
 * The starter character's body (M6.5, D77): a mannequin of low-poly parts in the T-pose, each part
 * moved wholly by one bone, like a jointed doll, in five material slots a figure's look colours:
 * clothes, trim (the belt and boots), skin, hair and soles. Sizes are metres, in the rest pose.
 */
import type { HumanBone } from '@eb/models/humanoid';
import { box, cylinder, type Shape } from '../shapes.ts';
import { REST, type Vec3 } from './skeleton.ts';

export const SLOTS = ['clothes', 'trim', 'skin', 'hair', 'soles'] as const;
export type Slot = (typeof SLOTS)[number];

export interface Part {
  readonly bone: HumanBone;
  readonly slot: Slot;
  readonly shape: Shape;
}

/**
 * A limb's piece from `a` to `b`: a box tapering from `wa` to `wb` across `across` and from `da`
 * to `db` along `deep`, both at right angles to the limb.
 */
function limb(a: Vec3, b: Vec3, wa: number, wb: number, da: number, db: number, across: Vec3, deep: Vec3): Shape {
  const corner = (at: Vec3, w: number, d: number, su: number, sv: number): Vec3 => [
    at[0] + (across[0] * su * w) / 2 + (deep[0] * sv * d) / 2,
    at[1] + (across[1] * su * w) / 2 + (deep[1] * sv * d) / 2,
    at[2] + (across[2] * su * w) / 2 + (deep[2] * sv * d) / 2,
  ];
  const ring = (at: Vec3, w: number, d: number) => [
    corner(at, w, d, -1, -1),
    corner(at, w, d, 1, -1),
    corner(at, w, d, 1, 1),
    corner(at, w, d, -1, 1),
  ];
  const low = ring(a, wa, da);
  const high = ring(b, wb, db);
  const faces = [low, high];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    faces.push([low[i] as Vec3, low[j] as Vec3, high[j] as Vec3, high[i] as Vec3]);
  }
  const middle: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return { faces, middle };
}

const UP: Vec3 = [0, 1, 0];
const SIDE: Vec3 = [1, 0, 0];
const FRONT: Vec3 = [0, 0, 1];
const along = (bone: HumanBone, x: number): Vec3 => [x, REST[bone][1], REST[bone][2]];

/** One side's arm and leg, `s` −1 for the left (−x) and 1 for the right. */
function side(s: -1 | 1): Part[] {
  const name = (bone: string) => `${s < 0 ? 'left' : 'right'}${bone}` as HumanBone;
  const arm = (bone: string, from: number, to: number, wa: number, wb: number, slot: Slot, deep = 1): Part => ({
    bone: name(bone),
    slot,
    shape: limb(along(name(bone), from * s), along(name(bone), to * s), wa, wb, wa * deep, wb * deep, UP, FRONT),
  });
  const leg = (bone: string, from: number, to: number, wa: number, wb: number, slot: Slot): Part => {
    const x = REST[name(bone)][0];
    return { bone: name(bone), slot, shape: limb([x, from, 0], [x, to, 0], wa, wb, wa, wb, SIDE, FRONT) };
  };
  const x = REST[name('Foot')][0];
  return [
    arm('UpperArm', 0.17, 0.45, 0.1, 0.085, 'clothes'),
    arm('LowerArm', 0.45, 0.7, 0.08, 0.065, 'skin'),
    arm('Hand', 0.7, 0.86, 0.075, 0.06, 'skin', 0.5),
    leg('UpperLeg', 0.92, 0.5, 0.14, 0.11, 'clothes'),
    leg('LowerLeg', 0.5, 0.12, 0.11, 0.09, 'clothes'),
    leg('LowerLeg', 0.3, 0.1, 0.115, 0.1, 'trim'),
    { bone: name('Foot'), slot: 'trim', shape: box([0.1, 0.08, 0.2], [x, 0.015, -0.05]) },
    { bone: name('Foot'), slot: 'soles', shape: box([0.105, 0.02, 0.22], [x, 0, -0.05]) },
    { bone: name('Toes'), slot: 'trim', shape: box([0.1, 0.05, 0.06], [x, 0.015, -0.17]) },
  ];
}

/** Every part, the trunk and head first, then the left side and the right. */
export const PARTS: readonly Part[] = [
  { bone: 'hips', slot: 'clothes', shape: box([0.3, 0.15, 0.19], [0, 0.86, 0]) },
  { bone: 'hips', slot: 'trim', shape: box([0.31, 0.05, 0.2], [0, 0.98, 0]) },
  { bone: 'spine', slot: 'clothes', shape: box([0.27, 0.17, 0.17], [0, 1.03, 0]) },
  { bone: 'chest', slot: 'clothes', shape: box([0.32, 0.15, 0.19], [0, 1.2, 0]) },
  { bone: 'upperChest', slot: 'clothes', shape: box([0.38, 0.13, 0.2], [0, 1.35, 0]) },
  { bone: 'neck', slot: 'skin', shape: cylinder(0.05, 0.05, 0.09, 8, [0, 1.47, 0]) },
  { bone: 'head', slot: 'skin', shape: cylinder(0.095, 0.09, 0.19, 8, [0, 1.555, 0], 22.5) },
  { bone: 'head', slot: 'hair', shape: cylinder(0.1, 0.07, 0.06, 8, [0, 1.7, 0], 22.5) },
  { bone: 'head', slot: 'skin', shape: box([0.03, 0.04, 0.04], [0, 1.6, -0.105]) },
  ...side(-1),
  ...side(1),
];
