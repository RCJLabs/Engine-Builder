/**
 * Where each camera stands (M5.8, D70, docs/specs/movement.md#the-stage). Third person: 4 m back
 * from a point 1.6 m over the feet, along the look, pulled in short of anything solid between.
 * First person: at the eyes. Yaw 0 looks along -z, as a spawn point turned 0 faces.
 */
import type { Vec3 } from '../spaces/vec.ts';

export type ViewKind = 'third' | 'first';

export const THIRD = { back: 4, up: 1.6, pitch: -15, most: 60, short: 0.2, nearest: 0.6 } as const;
export const FIRST = { eyes: 1.65, most: 85 } as const;

const RAD = Math.PI / 180;

/** The way a yaw and pitch look, in degrees, as a unit vector. */
export function lookOf(yaw: number, pitch: number): Vec3 {
  const y = yaw * RAD;
  const p = pitch * RAD;
  return [-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
}

/** A pitch held to the view's limits. */
export const heldPitch = (kind: ViewKind, pitch: number): number => {
  const most = kind === 'first' ? FIRST.most : THIRD.most;
  return Math.max(-most, Math.min(most, pitch));
};

/** How far a ray goes before it meets something solid, or null when it meets nothing within `most`. */
export type Clear = (from: Vec3, dir: Vec3, most: number) => number | null;

export interface Shot {
  /** Where the camera is. */
  readonly at: Vec3;
  /** The point it looks at. */
  readonly target: Vec3;
  /** How far it stands from the point it turns about: the head in third person, none in first. */
  readonly distance: number;
}

export function shotOf(kind: ViewKind, feet: Vec3, yaw: number, pitch: number, clear: Clear): Shot {
  const look = lookOf(yaw, heldPitch(kind, pitch));
  if (kind === 'first') {
    const eye: Vec3 = [feet[0], feet[1] + FIRST.eyes, feet[2]];
    return { at: eye, target: [eye[0] + look[0], eye[1] + look[1], eye[2] + look[2]], distance: 0 };
  }
  const head: Vec3 = [feet[0], feet[1] + THIRD.up, feet[2]];
  const back: Vec3 = [-look[0], -look[1], -look[2]];
  const hit = clear(head, back, THIRD.back);
  const distance = hit === null ? THIRD.back : Math.max(THIRD.nearest, Math.min(THIRD.back, hit - THIRD.short));
  return {
    at: [head[0] + back[0] * distance, head[1] + back[1] * distance, head[2] + back[2] * distance],
    target: head,
    distance,
  };
}
