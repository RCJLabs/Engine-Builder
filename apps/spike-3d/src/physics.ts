/**
 * Rapier, loaded after the first frame so its 3 MB of WebAssembly never delays the scene. The
 * spike times the import and the start-up, then builds a heightfield of the terrain and casts
 * rays at its vertices, so physics provably stands on the ground that is drawn.
 */
import { extentOf, type Heightmap, heightAt, PEAK } from './heightmap.ts';

/**
 * Rapier's heightfield matrix has rows along z and columns along x, stored column by column; ours
 * is row by row. Seen by casting rays at a grid of distinct heights: each hit named its vertex.
 */
export function rapierHeights(map: Heightmap): Float32Array {
  const { size, heights } = map;
  const out = new Float32Array(size * size);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) out[x * size + z] = heights[z * size + x] as number;
  }
  return out;
}

/**
 * Where to cast rays: inside cells, since a ray straight down a triangle's edge can miss (28 of
 * 64 aimed at vertices did), alternating between a cell's two triangles, and off the grid's
 * diagonal. So a transposed field, or one split on the other diagonal, lands off the drawn ground.
 */
export function probePoints(map: Heightmap, count = 64): { x: number; z: number }[] {
  const extent = extentOf(map);
  const cells = map.size - 1;
  const points: { x: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    // Two strides through the grid, so column and row never step together. On the spike's 255
    // cells a side, column and row would first coincide at i = 80.
    const col = (i * 37 + 23) % cells;
    const row = (i * 101 + 3) % cells;
    const [dx, dz] = i % 2 === 0 ? [0.3, 0.2] : [0.8, 0.7];
    points.push({ x: (col + dx) * map.spacing - extent, z: (row + dz) * map.spacing - extent });
  }
  return points;
}

export interface PhysicsReport {
  readonly importMs: number;
  readonly initMs: number;
  readonly rays: number;
  /** Rays that hit nothing. */
  readonly misses: number;
  /** The largest gap between where a ray hit and the drawn ground's height there. */
  readonly worstError: number;
}

/**
 * How near the drawn ground every ray must land. In Node they land within 7e-6; a field split on
 * the other diagonal is off by up to 0.027 at the probe points, and a transposed one by 19.
 */
export const AGREE = 0.001;

export const agrees = (report: PhysicsReport) => report.misses === 0 && report.worstError <= AGREE;

export async function loadPhysics(map: Heightmap, clock: () => number): Promise<PhysicsReport> {
  const started = clock();
  const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
  const imported = clock();
  await RAPIER.init();
  const ready = clock();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  try {
    const cells = map.size - 1;
    const span = cells * map.spacing;
    world.createCollider(RAPIER.ColliderDesc.heightfield(cells, cells, rapierHeights(map), { x: span, y: 1, z: span }));
    // Rapier builds the structures rays are tested against when the world steps.
    world.step();
    const top = PEAK + 10;
    let worst = 0;
    let misses = 0;
    const points = probePoints(map);
    for (const { x, z } of points) {
      const hit = world.castRay(new RAPIER.Ray({ x, y: top, z }, { x: 0, y: -1, z: 0 }), top + 10, true);
      if (hit) worst = Math.max(worst, Math.abs(top - hit.timeOfImpact - heightAt(map, x, z)));
      else misses++;
    }
    return { importMs: imported - started, initMs: ready - imported, rays: points.length, misses, worstError: worst };
  } finally {
    world.free();
  }
}
