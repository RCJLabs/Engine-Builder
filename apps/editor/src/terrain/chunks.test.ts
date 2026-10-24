/**
 * The terrain's chunks (M5.3, D65): detail by distance, the triangles a level draws, and no crack
 * at a seam between any two levels. The ray onto the ground lands on what they draw.
 */
import { describe, expect, it } from 'vitest';
import { chunkMesh, chunksOf, chunksPerSide, edgeLine, lodFor, seamGap } from './chunks.ts';
import { heightAt, newGrid, type TerrainGrid } from './grid.ts';
import { groundHit } from './ray.ts';

const SETTINGS = { size: 129, spacing: 1, low: -20, high: 20, layers: [{ name: 'Grass', color: '#5f8f3e' }] };
const GREEN: [number, number, number][] = [[0.37, 0.56, 0.24]];

/** A rough terrain: every vertex different, so a crack anywhere shows as a height that doesn't match. */
function rough(): TerrainGrid {
  const g = newGrid(SETTINGS);
  for (let v = 0; v < g.heights.length; v++) g.heights[v] = ((v * 7919) % 4001) / 100 - 20;
  return g;
}

describe('detail by distance', () => {
  it('is level 0 within twice a chunk’s width, then one more each doubling, at most 3', () => {
    expect([0, 63.9, 64, 127.9, 128, 256, 1000].map((d) => lodFor(d, 32))).toEqual([0, 0, 1, 1, 2, 3, 3]);
  });

  it('draws 2 triangles a square: 2048 a chunk at level 0, 32 at level 3', () => {
    const g = rough();
    expect(chunksPerSide(g)).toBe(4);
    expect(chunkMesh(g, 0, 0, 0, {}, GREEN).indices.length / 3).toBe(2048);
    expect(chunkMesh(g, 0, 0, 3, {}, GREEN).indices.length / 3).toBe(32);
  });
});

/** The height a chunk's mesh gives along its edge at a grid vertex, read off the line between its own edge vertices. */
function edgeAt(positions: Float32Array, along: 'x' | 'z', fixed: number, at: number): number {
  const points: [number, number][] = [];
  for (let v = 0; v < positions.length / 3; v++) {
    const x = positions[v * 3] as number;
    const y = positions[v * 3 + 1] as number;
    const z = positions[v * 3 + 2] as number;
    if (Math.abs((along === 'z' ? x : z) - fixed) < 1e-6) points.push([along === 'z' ? z : x, y]);
  }
  points.sort((a, b) => a[0] - b[0]);
  for (let k = 0; k + 1 < points.length; k++) {
    const [p0, h0] = points[k] as [number, number];
    const [p1, h1] = points[k + 1] as [number, number];
    if (at >= p0 - 1e-6 && at <= p1 + 1e-6) return h0 + ((h1 - h0) * (at - p0)) / (p1 - p0);
  }
  throw new Error(`No edge at ${at}`);
}

describe('a seam', () => {
  it('has no crack between any two levels, east–west and north–south', () => {
    const g = rough();
    for (let a = 0; a <= 3; a++) {
      for (let b = 0; b <= 3; b++) {
        // Chunk (1, 1) at level a beside (2, 1) to its east and (1, 2) to its south, at level b.
        const west = chunkMesh(g, 1, 1, a, { east: b, south: b }, GREEN);
        const east = chunkMesh(g, 2, 1, b, { west: a }, GREEN);
        const south = chunkMesh(g, 1, 2, b, { north: a }, GREEN);
        const seamX = 2 * 32 - 64;
        const seamZ = 2 * 32 - 64;
        for (let k = 0; k <= 32; k++) {
          const z = 32 + k - 64;
          expect(edgeAt(west.positions, 'z', seamX, z)).toBeCloseTo(edgeAt(east.positions, 'z', seamX, z), 4);
          const x = 32 + k - 64;
          expect(edgeAt(west.positions, 'x', seamZ, x)).toBeCloseTo(edgeAt(south.positions, 'x', seamZ, x), 4);
        }
      }
    }
  });

  it('measures the same from the buffers: no gap with the neighbours’ levels, a gap without them', () => {
    const g = rough();
    for (let a = 0; a <= 3; a++) {
      for (let b = a + 1; b <= 3; b++) {
        const fine = chunkMesh(g, 1, 1, a, { east: b }, GREEN);
        const coarse = chunkMesh(g, 2, 1, b, { west: a }, GREEN);
        expect(seamGap(edgeLine(fine.positions, 'east'), edgeLine(coarse.positions, 'west'))).toBeLessThan(1e-5);
        const unstitched = chunkMesh(g, 1, 1, a, {}, GREEN);
        expect(seamGap(edgeLine(unstitched.positions, 'east'), edgeLine(coarse.positions, 'west'))).toBeGreaterThan(
          0.1,
        );
        const below = chunkMesh(g, 1, 2, b, { north: a }, GREEN);
        const above = chunkMesh(g, 1, 1, a, { south: b }, GREEN);
        expect(seamGap(edgeLine(above.positions, 'south'), edgeLine(below.positions, 'north'))).toBeLessThan(1e-5);
      }
    }
  });

  it('draws at full detail the triangles heightAt reads, each square split the same way', () => {
    // No square's corners in a plane, as rough()'s nearly are, so the two ways to split one differ.
    const g = newGrid(SETTINGS);
    for (let v = 0; v < g.heights.length; v++) g.heights[v] = ((Math.imul(v, 2654435761) >>> 0) % 4001) / 100 - 20;
    const { positions, indices } = chunkMesh(g, 1, 1, 0, {}, GREEN);
    const corner = (v: number): [number, number, number] => [
      positions[v * 3] as number,
      positions[v * 3 + 1] as number,
      positions[v * 3 + 2] as number,
    ];
    /** The mesh's height at (x, z): the triangle holding it, read by its corners' weights. */
    const drawnAt = (x: number, z: number) => {
      for (let t = 0; t < indices.length; t += 3) {
        type Corner = ReturnType<typeof corner>;
        const three = [0, 1, 2].map((k) => corner(indices[t + k] as number)) as [Corner, Corner, Corner];
        const [[ax, ay, az], [bx, by, bz], [cx, cy, cz]] = three;
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        const wc = 1 - wa - wb;
        if (wa >= -1e-9 && wb >= -1e-9 && wc >= -1e-9) return wa * ay + wb * by + wc * cy;
      }
      throw new Error(`No triangle at ${x}, ${z}`);
    };
    for (const [x, z] of [
      [-31.8, -31.3],
      [-20.25, -10.7],
      [-0.3, -0.9],
      [-15.6, -25.1],
    ] as [number, number][]) {
      expect(drawnAt(x, z)).toBeCloseTo(heightAt(g, x, z), 4);
    }
  });

  it('keeps a level’s own heights where no neighbour is coarser', () => {
    const g = rough();
    const mesh = chunkMesh(g, 1, 1, 0, { east: 0, west: 0, north: 0, south: 0 }, GREEN);
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      const x = mesh.positions[v * 3] as number;
      const z = mesh.positions[v * 3 + 2] as number;
      expect(mesh.positions[v * 3 + 1]).toBeCloseTo(heightAt(g, x, z), 5);
    }
  });
});

describe('chunks an area reaches', () => {
  it('include both sides of a seam a vertex sits on', () => {
    const g = rough();
    expect(chunksOf(g, { i0: 10, i1: 20, j0: 10, j1: 20 })).toEqual([[0, 0]]);
    expect(chunksOf(g, { i0: 30, i1: 32, j0: 0, j1: 3 })).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(chunksOf(g, { i0: 0, i1: 128, j0: 128, j1: 128 })).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });
});

describe('the ray onto the ground', () => {
  it('lands on the drawn surface, from above and at a slant, and misses beside the terrain', () => {
    const g = rough();
    for (const [x, z] of [
      [0, 0],
      [10.3, -7.8],
      [-40.25, 51.5],
    ] as [number, number][]) {
      const hit = groundHit(g, [x, 100, z], [0, -1, 0]);
      expect(hit?.[1]).toBeCloseTo(heightAt(g, x, z), 3);
    }
    const slant = groundHit(g, [-80, 60, -80], [1, -0.6, 1]);
    expect(slant).not.toBeNull();
    const [x, y, z] = slant as [number, number, number];
    expect(y).toBeCloseTo(heightAt(g, x, z), 2);
    expect(groundHit(g, [200, 50, 0], [0, -1, 0])).toBeNull();
    expect(groundHit(g, [0, 50, 0], [0, 1, 0])).toBeNull();
    // Under the terrain's box all the way across: it never meets the ground.
    expect(groundHit(g, [-200, -50, 0], [1, 0.01, 0])).toBeNull();
  });
});
