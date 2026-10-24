/**
 * The terrain in chunks (M5.3, D65, docs/specs/terrain.md#chunks-and-detail): 32 × 32 squares each,
 * drawn at a level of detail chosen by distance. At level l a chunk uses every 2^l-th vertex. Along
 * an edge shared with a coarser neighbour, a chunk lays its edge vertices on the neighbour's coarser
 * line, so the two surfaces meet with no crack. Normals come from the full heightmap, so shading
 * holds as detail changes. Plain functions: the view puts what they return into buffers.
 */
import { CHUNK } from '@eb/compiler';
import { extentOf, heightOf, type TerrainGrid } from './grid.ts';

/** The coarsest level: a chunk of 4 × 4 squares. */
export const COARSEST = 3;

export const chunksPerSide = (g: Pick<TerrainGrid, 'size'>) => (g.size - 1) / CHUNK;

/** The level for a chunk whose centre is `distance` metres off: 0 within twice its width, then one more each doubling. */
export function lodFor(distance: number, chunkWidth: number): number {
  const near = 2 * chunkWidth;
  if (distance < near) return 0;
  return Math.min(COARSEST, Math.floor(Math.log2(distance / near)) + 1);
}

/** Each neighbour's level, or undefined at the terrain's edge. */
export interface Neighbours {
  readonly west?: number;
  readonly east?: number;
  readonly north?: number;
  readonly south?: number;
}

export interface ChunkMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint32Array;
}

/** A layer's colour as linear-ish 0–1 floats, as three's vertex colours take them. */
export function rgbOf(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/**
 * A vertex's height on a chunk's edge: its own when the neighbour across that edge is as fine or
 * finer, else on the neighbour's line, between the two coarse vertices either side of it.
 */
function edgeHeight(g: TerrainGrid, i: number, j: number, along: 'i' | 'j', start: number, coarse: number): number {
  const at = along === 'i' ? i : j;
  const lo = start + Math.floor((at - start) / coarse) * coarse;
  const t = (at - lo) / coarse;
  if (t === 0) return heightOf(g, i, j);
  const a = along === 'i' ? heightOf(g, lo, j) : heightOf(g, i, lo);
  const b = along === 'i' ? heightOf(g, lo + coarse, j) : heightOf(g, i, lo + coarse);
  return a + (b - a) * t;
}

/** The height a chunk at `lod` gives the grid vertex (i, j) of its own lattice. */
function heightIn(
  g: TerrainGrid,
  i: number,
  j: number,
  box: { i0: number; j0: number },
  lod: number,
  n: Neighbours,
): number {
  const coarser = (level: number | undefined) => (level !== undefined && level > lod ? 2 ** level : 0);
  const west = i === box.i0 ? coarser(n.west) : 0;
  const east = i === box.i0 + CHUNK ? coarser(n.east) : 0;
  const north = j === box.j0 ? coarser(n.north) : 0;
  const south = j === box.j0 + CHUNK ? coarser(n.south) : 0;
  if (west || east) return edgeHeight(g, i, j, 'j', box.j0, west || east);
  if (north || south) return edgeHeight(g, i, j, 'i', box.i0, north || south);
  return heightOf(g, i, j);
}

/** Chunk (cx, cz) at `lod`, its edges laid on its coarser neighbours', coloured by `layers`. */
export function chunkMesh(
  g: TerrainGrid,
  cx: number,
  cz: number,
  lod: number,
  neighbours: Neighbours,
  layers: readonly (readonly [number, number, number])[],
): ChunkMesh {
  const step = 2 ** lod;
  const n = CHUNK / step;
  const box = { i0: cx * CHUNK, j0: cz * CHUNK };
  const e = extentOf(g);
  const count = (n + 1) * (n + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let b = 0; b <= n; b++) {
    for (let a = 0; a <= n; a++) {
      const i = box.i0 + a * step;
      const j = box.j0 + b * step;
      const v = b * (n + 1) + a;
      positions.set([i * g.spacing - e, heightIn(g, i, j, box, lod, neighbours), j * g.spacing - e], v * 3);
      const nx = heightOf(g, i - 1, j) - heightOf(g, i + 1, j);
      const nz = heightOf(g, i, j - 1) - heightOf(g, i, j + 1);
      const ny = 2 * g.spacing;
      const length = Math.hypot(nx, ny, nz);
      normals.set([nx / length, ny / length, nz / length], v * 3);
      colors.set(colourAt(g, i, j, layers), v * 3);
    }
  }
  const indices = new Uint32Array(n * n * 6);
  let k = 0;
  for (let b = 0; b < n; b++) {
    for (let a = 0; a < n; a++) {
      const v00 = b * (n + 1) + a;
      const v10 = v00 + 1;
      const v01 = v00 + n + 1;
      const v11 = v01 + 1;
      // Split from (a + 1, b) to (a, b + 1), as grid.ts's heightAt reads it; wound to face up.
      indices.set([v00, v01, v10, v10, v01, v11], k);
      k += 6;
    }
  }
  return { positions, normals, colors, indices };
}

/** A vertex's colour: its layers' colours by their weights, all of layer 1 where they sum to 0. */
function colourAt(g: TerrainGrid, i: number, j: number, layers: readonly (readonly [number, number, number])[]) {
  const at = (j * g.size + i) * 4;
  let sum = 0;
  const rgb = [0, 0, 0];
  for (let k = 0; k < layers.length; k++) {
    const w = g.paint[at + k] as number;
    sum += w;
    for (let c = 0; c < 3; c++) rgb[c] = (rgb[c] as number) + w * ((layers[k] as readonly number[])[c] as number);
  }
  return sum === 0 ? [...(layers[0] ?? [0.5, 0.5, 0.5])] : rgb.map((c) => c / sum);
}

/** The chunks an area of vertices reaches, a vertex on a seam reaching both sides. */
export function chunksOf(g: TerrainGrid, area: { i0: number; i1: number; j0: number; j1: number }): [number, number][] {
  const last = chunksPerSide(g) - 1;
  const from = (v: number) => Math.max(0, Math.floor((v - 1) / CHUNK));
  const to = (v: number) => Math.min(last, Math.floor(v / CHUNK));
  const out: [number, number][] = [];
  for (let cz = from(area.j0); cz <= to(area.j1); cz++) {
    for (let cx = from(area.i0); cx <= to(area.i1); cx++) out.push([cx, cz]);
  }
  return out;
}

export type Side = 'west' | 'east' | 'north' | 'south';

/**
 * The heights a chunk's mesh draws along one side, at each of the side's grid vertices, read off
 * the mesh's own vertices between them: what the view's seam check measures, from its buffers.
 */
export function edgeLine(positions: Float32Array, side: Side): Float32Array {
  const n = Math.round(Math.sqrt(positions.length / 3)) - 1;
  const step = CHUNK / n;
  const y = (k: number) => {
    const [a, b] = side === 'west' ? [0, k] : side === 'east' ? [n, k] : side === 'north' ? [k, 0] : [k, n];
    return positions[(b * (n + 1) + a) * 3 + 1] as number;
  };
  const out = new Float32Array(CHUNK + 1);
  for (let k = 0; k <= CHUNK; k++) {
    const lo = Math.min(n - 1, Math.floor(k / step));
    out[k] = y(lo) + (y(lo + 1) - y(lo)) * (k / step - lo);
  }
  return out;
}

/** The widest gap, in metres, between two lines of heights along the seam two chunks share. */
export function seamGap(a: Float32Array, b: Float32Array): number {
  let widest = 0;
  for (let k = 0; k < a.length; k++) widest = Math.max(widest, Math.abs((a[k] as number) - (b[k] as number)));
  return widest;
}
