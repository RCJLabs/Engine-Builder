/**
 * Where the character and the camera are at a given time: pure functions of the seconds since
 * the page started drawing, so every tier and every device draws the same frames.
 */
import { type Heightmap, heightAt } from './heightmap.ts';

const WALK_RADIUS = 36;
/** World units a second along the circle. */
const WALK_SPEED = 1.6;
const ORBIT_RADIUS = 13;
const ORBIT_SPEED = 0.18;

export interface Spot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The character walks a circle round the middle, on the ground, facing the way it goes. */
export function walkerAt(map: Heightmap, seconds: number): Spot & { readonly heading: number } {
  const angle = (seconds * WALK_SPEED) / WALK_RADIUS;
  const x = Math.cos(angle) * WALK_RADIUS;
  const z = Math.sin(angle) * WALK_RADIUS;
  // Moving anticlockwise round +y: the tangent is (−sin, cos), and a heading of 0 faces +z.
  const heading = Math.atan2(-Math.sin(angle), Math.cos(angle));
  return { x, y: heightAt(map, x, z), z, heading };
}

/** The camera circles the character, above it and never below the ground under the camera. */
export function cameraAt(map: Heightmap, seconds: number, target: Spot): Spot {
  const angle = seconds * ORBIT_SPEED;
  const x = target.x + Math.cos(angle) * ORBIT_RADIUS;
  const z = target.z + Math.sin(angle) * ORBIT_RADIUS;
  return { x, y: Math.max(target.y + 6, heightAt(map, x, z) + 2.5), z };
}
