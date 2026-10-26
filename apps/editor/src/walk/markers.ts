/**
 * Where the quest markers point (M6.6, D78, docs/specs/markers.md#where-a-target-is), as plain
 * functions. A target here is its object's place, or an actor where the walk has it; a target in
 * another space is the door out of this one toward it (core's doorToward, the fewest doors); this
 * space itself, or one no door leads to, shows nothing. Bearings are degrees from the way the camera
 * faces, right positive: yaw 0 looks along -z, which is north (cameras.ts).
 */
import { type Doors, doorToward } from '@eb/core';
import type { QuestMarker } from '@eb/ui';
import type { Vec3 } from '../spaces/vec.ts';

/** How far above an object's place its marker stands, and above an actor's head. */
export const ABOVE_OBJECT = 0.5;
export const ABOVE_HEAD = 0.3;
/** The compass strip spans 180°: a pip past its edge sits at the edge. */
export const COMPASS_HALF = 90;
/** An objective's text shows while its pip is this near the middle. */
export const TEXT_WITHIN = 10;

/** What the walk knows of where things are, for the space walked. */
export interface MarkerWorld {
  readonly here: string;
  readonly doors: Doors;
  /** An object's place in this space, by its path. */
  place(path: string): Vec3 | undefined;
  /** An actor's space, and where it stands with its height when that space is this one. */
  actor(id: string): { readonly space: string; readonly at?: Vec3; readonly height?: number } | undefined;
}

export interface MarkerPoint {
  readonly quest: string;
  readonly objective: string;
  readonly text: string;
  /** Where the marker stands. */
  readonly at: Vec3;
  /** The door it stands in at, for a target in another space. */
  readonly door?: string;
}

const up = (at: Vec3, by: number): Vec3 => [at[0], at[1] + by, at[2]];

/** The door out of here toward `space`, at its place. */
function doorPoint(world: MarkerWorld, space: string): { at: Vec3; door: string } | undefined {
  const door = doorToward(world.doors, world.here, space);
  const at = door === undefined ? undefined : world.place(door);
  return door !== undefined && at ? { at: up(at, ABOVE_OBJECT), door } : undefined;
}

/** Where one marker stands, or none. */
function pointOf(marker: QuestMarker, world: MarkerWorld): { at: Vec3; door?: string } | undefined {
  const target = marker.target;
  if ('actor' in target) {
    const actor = world.actor(target.actor);
    if (!actor) return undefined;
    if (actor.space !== world.here) return doorPoint(world, actor.space);
    return actor.at ? { at: up(actor.at, (actor.height ?? 0) + ABOVE_HEAD) } : undefined;
  }
  if (target.space !== world.here) return doorPoint(world, target.space);
  const at = target.object === undefined ? undefined : world.place(target.object);
  return at ? { at: up(at, ABOVE_OBJECT) } : undefined;
}

/** Each marker that has a point, in the order given. */
export function markerPoints(markers: readonly QuestMarker[], world: MarkerWorld): MarkerPoint[] {
  return markers.flatMap((marker) => {
    const point = pointOf(marker, world);
    if (!point) return [];
    const { quest, objective, text } = marker;
    return [{ quest, objective, text, ...point }];
  });
}

/** Degrees held to (-180, 180]. */
export function wrapped(degrees: number): number {
  const d = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
}

/** Degrees from the way a camera at `yaw` faces to the point, seen from `from`: right positive. */
export function bearingOf(from: Vec3, to: Vec3, yaw: number): number {
  const north = (Math.atan2(to[0] - from[0], -(to[2] - from[2])) * 180) / Math.PI;
  return wrapped(north + yaw);
}

/** Metres across the ground. */
export const distanceOf = (from: Vec3, to: Vec3): number => Math.hypot(to[0] - from[0], to[2] - from[2]);

/** Where on the strip a bearing sits, -1 at its left edge to 1 at its right. */
export const stripOffset = (bearing: number): number => Math.max(-1, Math.min(1, bearing / COMPASS_HALF));

/** The four points on the strip at a yaw: each that is within its span, and where. */
export function compassPoints(yaw: number): { readonly label: string; readonly offset: number }[] {
  const points: [string, number][] = [
    ['N', 0],
    ['E', 90],
    ['S', 180],
    ['W', 270],
  ];
  return points.flatMap(([label, north]) => {
    const bearing = wrapped(north + yaw);
    return Math.abs(bearing) <= COMPASS_HALF ? [{ label, offset: bearing / COMPASS_HALF }] : [];
  });
}
