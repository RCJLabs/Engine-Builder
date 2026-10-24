/**
 * A terrain in memory (M5.3, D65, docs/specs/terrain.md): its heights in metres and its paint
 * weights, read from and written to the two PNGs beside its space. Plain functions, so the brushes,
 * the chunks and the view all read the same numbers.
 */
import type { TerrainJson } from '@eb/compiler';
import type { Gray16, Rgba } from '@eb/export';

export interface TerrainGrid {
  /** Vertices a side. */
  readonly size: number;
  /** Metres between vertices. */
  readonly spacing: number;
  readonly low: number;
  readonly high: number;
  /** Metres, row j (along z) by column i (along x): heights[j * size + i]. */
  readonly heights: Float32Array;
  /** Four weights a vertex, one a layer, 0 to 255: paint[(j * size + i) * 4 + k]. */
  readonly paint: Uint8Array;
}

/** Half the terrain's width: it runs from −extent to extent along x and z. */
export const extentOf = (g: Pick<TerrainGrid, 'size' | 'spacing'>) => ((g.size - 1) * g.spacing) / 2;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A new terrain: flat at 0 m, or at the range's nearest end when 0 is outside it, and all of layer 1. */
export function newGrid(t: TerrainJson): TerrainGrid {
  const count = t.size * t.size;
  const paint = new Uint8Array(count * 4);
  for (let v = 0; v < count; v++) paint[v * 4] = 255;
  const heights = new Float32Array(count).fill(clamp(0, t.low, t.high));
  return { size: t.size, spacing: t.spacing, low: t.low, high: t.high, heights, paint };
}

/** The terrain its settings and files describe; a file of the wrong size is refused, as E067 says. */
export function gridFromFiles(t: TerrainJson, heights: Gray16, paint: Rgba): TerrainGrid {
  for (const [what, file] of [
    ['heights', heights],
    ['paint', paint],
  ] as const) {
    if (file.width !== t.size || file.height !== t.size) {
      throw new Error(`The ${what} are ${file.width}×${file.height}; the terrain is ${t.size}×${t.size}`);
    }
  }
  const range = t.high - t.low;
  const metres = new Float32Array(heights.data.length);
  for (let v = 0; v < metres.length; v++) metres[v] = t.low + ((heights.data[v] as number) / 65535) * range;
  return { size: t.size, spacing: t.spacing, low: t.low, high: t.high, heights: metres, paint: paint.data.slice() };
}

/** The heights file's samples: each height's place in the range, to the nearest 65535th. */
export function heightsFile(g: TerrainGrid): Gray16 {
  const range = g.high - g.low;
  const data = new Uint16Array(g.heights.length);
  for (let v = 0; v < data.length; v++) {
    data[v] = clamp(Math.round((((g.heights[v] as number) - g.low) / range) * 65535), 0, 65535);
  }
  return { width: g.size, height: g.size, data };
}

export const paintFile = (g: TerrainGrid): Rgba => ({ width: g.size, height: g.size, data: g.paint });

/** The grid with a new range: each height kept in metres, clamped to it. */
export function rerange(g: TerrainGrid, low: number, high: number): TerrainGrid {
  return { ...g, low, high, heights: g.heights.map((h) => clamp(h, low, high)) };
}

/** A vertex's height, its row and column held to the grid. */
export const heightOf = (g: TerrainGrid, i: number, j: number): number =>
  g.heights[clamp(j, 0, g.size - 1) * g.size + clamp(i, 0, g.size - 1)] as number;

/** A world point's place in the grid's columns and rows, as fractions. */
export const cellOf = (g: TerrainGrid, x: number, z: number): [number, number] => {
  const e = extentOf(g);
  return [(x + e) / g.spacing, (z + e) / g.spacing];
};

/**
 * The height at a world point, on the triangles the view draws at full detail: each square split
 * from its (i + 1, j) corner to its (i, j + 1) one, as chunks.ts splits it. Outside, the nearest
 * edge's (as the spike's heightAt, M1.10).
 */
export function heightAt(g: TerrainGrid, x: number, z: number): number {
  const [fi, fz] = cellOf(g, x, z);
  const i = clamp(fi, 0, g.size - 1);
  const j = clamp(fz, 0, g.size - 1);
  const i0 = Math.min(Math.floor(i), g.size - 2);
  const j0 = Math.min(Math.floor(j), g.size - 2);
  const ti = i - i0;
  const tj = j - j0;
  const a = heightOf(g, i0, j0);
  const b = heightOf(g, i0 + 1, j0);
  const c = heightOf(g, i0, j0 + 1);
  const d = heightOf(g, i0 + 1, j0 + 1);
  return ti + tj <= 1 ? a + (b - a) * ti + (c - a) * tj : d + (c - d) * (1 - ti) + (b - d) * (1 - tj);
}
