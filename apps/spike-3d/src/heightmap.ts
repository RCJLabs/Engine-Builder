/**
 * The spike's terrain: a square heightmap of seeded value noise, centred on the origin. Five
 * octaves of lattice values from @eb/core's hash, blended with smoothstep, then squared so the
 * low ground spreads into valleys. Arithmetic only, so a seed gives the same terrain everywhere.
 */
import { hashParts } from '@eb/core';

export interface Heightmap {
  /** Vertices per side. */
  readonly size: number;
  /** World units between neighbouring vertices. */
  readonly spacing: number;
  /** Row by row: the height at column x of row z is `heights[z * size + x]`. */
  readonly heights: Float32Array;
}

/** The highest the terrain reaches, in world units. */
export const PEAK = 40;
const OCTAVES = [4, 8, 16, 32, 64];

export function makeHeightmap(seed: string, size = 256, spacing = 2): Heightmap {
  if (!Number.isSafeInteger(size) || size < 2)
    throw new RangeError('makeHeightmap(): size is a whole number, at least 2');
  const heights = new Float32Array(size * size);
  let amplitude = 1;
  let total = 0;
  for (const [octave, cells] of OCTAVES.entries()) {
    const lattice = latticeOf(seed, octave, cells);
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const i = z * size + x;
        heights[i] = (heights[i] as number) + amplitude * sample(lattice, cells, x / (size - 1), z / (size - 1));
      }
    }
    total += amplitude;
    amplitude /= 2;
  }
  for (let i = 0; i < heights.length; i++) {
    const n = (heights[i] as number) / total;
    heights[i] = n * n * PEAK;
  }
  return { size, spacing, heights };
}

/** Half the terrain's width: it spans from −extent to +extent on x and z. */
export const extentOf = (map: Heightmap) => ((map.size - 1) * map.spacing) / 2;

/**
 * The height of the drawn ground under a world position. scene.ts splits each cell into two
 * triangles on the diagonal from (x, z + 1) to (x + 1, z), and Rapier's heightfield splits it the
 * same way, so this is the plane of whichever triangle holds the point. Outside the terrain,
 * the nearest edge.
 */
export function heightAt(map: Heightmap, x: number, z: number): number {
  const extent = extentOf(map);
  const fx = clamp((x + extent) / map.spacing, 0, map.size - 1);
  const fz = clamp((z + extent) / map.spacing, 0, map.size - 1);
  const x0 = Math.min(Math.floor(fx), map.size - 2);
  const z0 = Math.min(Math.floor(fz), map.size - 2);
  const tx = fx - x0;
  const tz = fz - z0;
  const at = (dx: number, dz: number) => map.heights[(z0 + dz) * map.size + x0 + dx] as number;
  if (tx + tz <= 1) return at(0, 0) + (at(1, 0) - at(0, 0)) * tx + (at(0, 1) - at(0, 0)) * tz;
  return at(1, 1) + (at(0, 1) - at(1, 1)) * (1 - tx) + (at(1, 0) - at(1, 1)) * (1 - tz);
}

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));

// Values in [0, 1) at each lattice point of one octave, (cells + 1) per side.
function latticeOf(seed: string, octave: number, cells: number): Float64Array {
  const lattice = new Float64Array((cells + 1) * (cells + 1));
  for (let j = 0; j <= cells; j++) {
    for (let i = 0; i <= cells; i++) lattice[j * (cells + 1) + i] = hashParts(seed, octave, i, j) / 0x100000000;
  }
  return lattice;
}

function sample(lattice: Float64Array, cells: number, u: number, v: number): number {
  const fx = u * cells;
  const fz = v * cells;
  const i = Math.min(Math.floor(fx), cells - 1);
  const j = Math.min(Math.floor(fz), cells - 1);
  const sx = smooth(fx - i);
  const sz = smooth(fz - j);
  const at = (di: number, dj: number) => lattice[(j + dj) * (cells + 1) + i + di] as number;
  const near = at(0, 0) + (at(1, 0) - at(0, 0)) * sx;
  const far = at(0, 1) + (at(1, 1) - at(0, 1)) * sx;
  return near + (far - near) * sz;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
