/**
 * Where a terrain's foliage stands (M5.6, D68, docs/specs/foliage.md#the-scatter), worked out and
 * never stored: cells c = 10 / √density metres a side tile the terrain, each with five draws from
 * an integer hash of the foliage's id and the cell, and a plant stands where its first draw is
 * below the density painted there, on ground neither too steep nor too high or low. So painting
 * more only adds plants and painting less only takes them; nothing standing moves. Plants are kept
 * by the terrain chunk they stand in, so a stroke scatters again only the chunks it reached.
 */
import { CHUNK } from '@eb/compiler';
import { fnv1a32 } from '@eb/core';
import { FOLIAGE_DEFAULTS, type FoliageRecord } from '@eb/schema';
import { extentOf, groundAt, type TerrainGrid } from '../terrain/grid.ts';

/** At most this many plants of one type in a space: the scatter stops there. */
export const MOST_PLANTS = 200_000;

/** Floats a plant takes in a chunk's list: x, y, z, its turn in radians, its size, and its upright's x, y, z. */
export const PLANT_FLOATS = 8;

/** What the scatter reads of a foliage type: its record with every field filled, and its model's scale. */
export interface Scatter {
  readonly id: string;
  /** Its channel in the foliage file, 0 to 3. */
  readonly channel: number;
  readonly density: number;
  readonly smallest: number;
  readonly largest: number;
  readonly turn: boolean;
  readonly lean: number;
  /** tan² of the steepest slope a plant stands on: the slope's own gx² + gz² is held to it. */
  readonly steepest2: number;
  readonly lowest: number;
  readonly highest: number;
  readonly scale: number;
  /** How many of the plants painted stand, 0 to 1: a quality tier's share (M5.7, D69). */
  readonly share: number;
}

export function scatterOf(id: string, channel: number, record: FoliageRecord, modelScale = 1, share = 1): Scatter {
  const f = { ...FOLIAGE_DEFAULTS, ...record };
  const tan = f.steepest >= 90 ? Number.POSITIVE_INFINITY : Math.tan((f.steepest * Math.PI) / 180);
  return {
    id,
    channel,
    density: f.density,
    smallest: f.smallest,
    largest: f.largest,
    turn: f.turn,
    lean: f.lean,
    steepest2: tan * tan,
    lowest: f.lowest ?? Number.NEGATIVE_INFINITY,
    highest: f.highest ?? Number.POSITIVE_INFINITY,
    scale: modelScale,
    share,
  };
}

/** A chunk's plants, PLANT_FLOATS floats each. */
export interface ChunkPlants {
  readonly count: number;
  readonly data: Float32Array;
}

/** splitmix32, as @eb/core's rng seeds sfc32 with it: five well-mixed words from one. */
function draws(seed: number, out: Float64Array): void {
  let a = seed | 0;
  for (let n = 0; n < out.length; n++) {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    out[n] = ((t ^ (t >>> 15)) >>> 0) / 0x1_0000_0000;
  }
}

/** A cell's seed: the foliage's hash mixed with its column and row. */
export const cellSeed = (base: number, u: number, v: number) =>
  (base ^ Math.imul(u, 0x9e3779b1) ^ Math.imul(v, 0x85ebca77)) >>> 0;

/** The density at a world point, 0 to 1, read bilinearly from the four vertices around it. */
export function densityAt(g: TerrainGrid, channel: number, x: number, z: number): number {
  const e = extentOf(g);
  const fi = Math.min(g.size - 1, Math.max(0, (x + e) / g.spacing));
  const fj = Math.min(g.size - 1, Math.max(0, (z + e) / g.spacing));
  const i0 = Math.min(Math.floor(fi), g.size - 2);
  const j0 = Math.min(Math.floor(fj), g.size - 2);
  const ti = fi - i0;
  const tj = fj - j0;
  const at = (i: number, j: number) => g.foliage[(j * g.size + i) * 4 + channel] as number;
  const top = at(i0, j0) + (at(i0 + 1, j0) - at(i0, j0)) * ti;
  const bottom = at(i0, j0 + 1) + (at(i0 + 1, j0 + 1) - at(i0, j0 + 1)) * ti;
  return (top + (bottom - top) * tj) / 255;
}

/** Chunks a side, and a chunk's width in metres. */
export const chunksOf = (g: TerrainGrid) => ({ across: (g.size - 1) / CHUNK, width: CHUNK * g.spacing });

/** Whether any vertex of chunk (ci, cj), its edges included, has density in the channel. */
function painted(g: TerrainGrid, channel: number, ci: number, cj: number): boolean {
  for (let j = cj * CHUNK; j <= (cj + 1) * CHUNK; j++) {
    for (let i = ci * CHUNK; i <= (ci + 1) * CHUNK; i++) {
      if ((g.foliage[(j * g.size + i) * 4 + channel] as number) > 0) return true;
    }
  }
  return false;
}

/**
 * The plants of `s` standing in chunk (ci, cj), at most `budget` of them. A plant's cell corner can
 * lie up to a cell before the chunk, since its jitter carries it on; it belongs where it stands.
 */
export function scatterChunk(g: TerrainGrid, s: Scatter, ci: number, cj: number, budget = MOST_PLANTS): ChunkPlants {
  if (budget <= 0 || !painted(g, s.channel, ci, cj)) return { count: 0, data: new Float32Array(0) };
  const e = extentOf(g);
  const { across, width } = chunksOf(g);
  const c = 10 / Math.sqrt(s.density);
  const cells = Math.ceil((2 * e) / c);
  const [x0, z0] = [-e + ci * width, -e + cj * width];
  const [x1, z1] = [x0 + width, z0 + width];
  // The last chunk holds the terrain's far edge too.
  const inside = (p: number, lo: number, hi: number, last: boolean) => p >= lo && (p < hi || (last && p <= hi));
  const base = fnv1a32(s.id);
  const r = new Float64Array(5);
  const out: number[] = [];
  const u0 = Math.max(0, Math.floor((x0 + e) / c) - 1);
  const v0 = Math.max(0, Math.floor((z0 + e) / c) - 1);
  const u1 = Math.min(cells - 1, Math.floor((x1 + e) / c));
  const v1 = Math.min(cells - 1, Math.floor((z1 + e) / c));
  for (let v = v0; v <= v1 && out.length < budget * PLANT_FLOATS; v++) {
    for (let u = u0; u <= u1 && out.length < budget * PLANT_FLOATS; u++) {
      draws(cellSeed(base, u, v), r);
      const x = -e + (u + (r[1] as number)) * c;
      const z = -e + (v + (r[2] as number)) * c;
      if (x > e || z > e) continue;
      if (!inside(x, x0, x1, ci === across - 1) || !inside(z, z0, z1, cj === across - 1)) continue;
      // A share below 1 keeps the plants whose first draw is lowest: a subset of the whole, none moved.
      if ((r[0] as number) >= densityAt(g, s.channel, x, z) * s.share) continue;
      const ground = groundAt(g, x, z);
      if (ground.gx * ground.gx + ground.gz * ground.gz > s.steepest2) continue;
      if (ground.height < s.lowest || ground.height > s.highest) continue;
      out.push(x, ground.height, z, ...placement(s, ground.gx, ground.gz, r[3] as number, r[4] as number));
    }
  }
  return { count: out.length / PLANT_FLOATS, data: Float32Array.from(out) };
}

/** A plant's turn, size and upright: the world's up moved `lean` of the way to the ground's normal. */
function placement(s: Scatter, gx: number, gz: number, turn: number, size: number): number[] {
  const n = 1 / Math.sqrt(1 + gx * gx + gz * gz);
  const [ux, uy, uz] = [-gx * n * s.lean, 1 - s.lean + n * s.lean, -gz * n * s.lean];
  const length = Math.sqrt(ux * ux + uy * uy + uz * uz);
  return [
    s.turn ? turn * 2 * Math.PI : 0,
    (s.smallest + size * (s.largest - s.smallest)) * s.scale,
    // + 0 makes an upright plant's −0 a 0.
    ux / length + 0,
    uy / length,
    uz / length + 0,
  ];
}

/** Every chunk's plants of `s`, by "ci,cj", row by row, and whether the scatter stopped at `most`. */
export function scatterAll(
  g: TerrainGrid,
  s: Scatter,
  most = MOST_PLANTS,
): { chunks: Map<string, ChunkPlants>; capped: boolean } {
  const { across } = chunksOf(g);
  const chunks = new Map<string, ChunkPlants>();
  let total = 0;
  let capped = false;
  for (let cj = 0; cj < across; cj++) {
    for (let ci = 0; ci < across; ci++) {
      const plants = scatterChunk(g, s, ci, cj, most - total);
      total += plants.count;
      if (total >= most) capped = true;
      if (plants.count > 0) chunks.set(`${ci},${cj}`, plants);
    }
  }
  return { chunks, capped };
}
