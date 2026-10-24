/**
 * How foliage is drawn, as plain functions (M5.6, D68, docs/specs/foliage.md#drawing): the model's
 * LOD level a chunk draws a type at for its distance, or none beyond the type's distance, and the
 * plants of a type within a radius of a point, for the hook.
 */
import { type ChunkPlants, PLANT_FLOATS } from './scatter.ts';

/**
 * The level drawn at `distance` metres: −1 beyond `drawnTo`, else the last of the model's levels
 * whose start (`froms`, the whole model's 0 first) the distance has reached.
 */
export function levelFor(distance: number, drawnTo: number, froms: readonly number[]): number {
  if (distance > drawnTo) return -1;
  let level = 0;
  froms.forEach((from, i) => {
    if (distance >= from) level = i;
  });
  return level;
}

/** How many of `chunks`' plants stand within `radius` metres of (x, z), across the ground. */
export function plantsNear(chunks: Iterable<ChunkPlants>, x: number, z: number, radius: number): number {
  let n = 0;
  for (const plants of chunks) {
    for (let k = 0; k < plants.count; k++) {
      const dx = (plants.data[k * PLANT_FLOATS] as number) - x;
      const dz = (plants.data[k * PLANT_FLOATS + 2] as number) - z;
      if (dx * dx + dz * dz <= radius * radius) n++;
    }
  }
  return n;
}
