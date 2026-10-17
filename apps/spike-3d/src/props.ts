/**
 * Where the spike's 5,000 trees stand: seeded spots on gentle ground below the rock line, each
 * with a turn and a size. Pure, so a seed always plants the same forest.
 */
import { Rng } from '@eb/core';
import { extentOf, type Heightmap, heightAt, PEAK } from './heightmap.ts';

export const PROP_COUNT = 5000;

export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Turn about the vertical axis, in radians. */
  readonly turn: number;
  readonly scale: number;
}

/** Trees grow from just above the lowest ground to 60% of the peak, where it is not too steep. */
export const LOWEST = 0.02 * PEAK;
export const HIGHEST = 0.6 * PEAK;
export const STEEPEST = 0.6;

export function placeProps(map: Heightmap, seed: string, count = PROP_COUNT): Placement[] {
  const rng = Rng.create(seed).fork('props');
  const extent = extentOf(map) * 0.98;
  const placed: Placement[] = [];
  const tries = count * 30;
  for (let attempt = 0; attempt < tries && placed.length < count; attempt++) {
    const x = (rng.int(0, 1_000_000) / 1_000_000) * 2 * extent - extent;
    const z = (rng.int(0, 1_000_000) / 1_000_000) * 2 * extent - extent;
    const y = heightAt(map, x, z);
    if (y < LOWEST || y > HIGHEST || slopeAt(map, x, z) > STEEPEST) continue;
    const turn = (rng.int(0, 359) * Math.PI) / 180;
    const scale = 0.7 + rng.int(0, 60) / 100;
    placed.push({ x, y, z, turn, scale });
  }
  if (placed.length < count) throw new Error(`placeProps(): only ${placed.length} of ${count} spots found`);
  return placed;
}

/** Rise over run across one vertex spacing, the steeper of the two axes. */
export function slopeAt(map: Heightmap, x: number, z: number): number {
  const d = map.spacing;
  const dx = Math.abs(heightAt(map, x + d, z) - heightAt(map, x - d, z)) / (2 * d);
  const dz = Math.abs(heightAt(map, x, z + d) - heightAt(map, x, z - d)) / (2 * d);
  return Math.max(dx, dz);
}
