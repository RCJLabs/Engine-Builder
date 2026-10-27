/**
 * Kaldvík's shore as code (M6.10, D82, docs/specs/kaldvik.md#the-place): a terrain 256 m on a side,
 * 129 vertices 2 m apart. The fjord's water along the west, a shingle beach, land rising east into
 * pine woods, the knoll in the south-east, and flat pads where the steading, Gudrun's booth, the
 * wreck, the two camps and the howe's door stand, each at a height the spaces' objects are placed
 * at by hand. `pnpm make:kaldvik` writes the heights, the paint and the foliage density beside
 * games/kaldvik/spaces/shore.json, and shore.test.ts holds the committed files to what this makes.
 *
 * Every number is integer arithmetic or a polynomial, never Math.random or a transcendental, so it
 * makes the same bytes on any machine (as the moor's, tools/cli/test/fixtures/moor.ts).
 */
import { encodeGray16, encodePng } from '@eb/export';

export const SIZE = 129;
export const SPACING = 2;
export const LOW = -6;
export const HIGH = 26;
/** The fjord's water, as the space's water plane stands. */
export const WATER = 0;
const HALF = ((SIZE - 1) / 2) * SPACING;

/** A flat place: its centre, the radius kept level, and its height. */
export interface Pad {
  readonly id: string;
  readonly at: readonly [number, number];
  readonly r: number;
  readonly h: number;
}

/** Where the spaces stand their things: shore.json's objects on these are at `h`. */
export const PADS: readonly Pad[] = [
  { id: 'steading', at: [0, 0], r: 30, h: 6 },
  { id: 'booth', at: [-50, 12], r: 7, h: 2.5 },
  { id: 'wreck', at: [-62, 100], r: 8, h: 0.8 },
  { id: 'camp-north', at: [14, -86], r: 9, h: 8 },
  { id: 'camp-east', at: [92, -14], r: 9, h: 9.5 },
  { id: 'howe-door', at: [60, 60], r: 5, h: 7 },
];
/** Metres over which a pad's level gives way to the land around it. */
const FALLOFF = 10;
/** The knoll the howe is dug into: its top's centre, its radius and its height over the land. */
const KNOLL = { at: [76, 76], r: 18, h: 12 } as const;

export interface ShoreFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** A number from 0 up to 1 for each whole point and seed, the same on every machine. */
function hash(i: number, j: number, seed: number): number {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Value noise on a lattice `cell` metres apart, 0 to 1, smooth between its points. */
function noise(x: number, z: number, cell: number, seed: number): number {
  const [fx, fz] = [x / cell, z / cell];
  const [i, j] = [Math.floor(fx), Math.floor(fz)];
  const [u, v] = [smooth(fx - i), smooth(fz - j)];
  const a = hash(i, j, seed) + (hash(i + 1, j, seed) - hash(i, j, seed)) * u;
  const b = hash(i, j + 1, seed) + (hash(i + 1, j + 1, seed) - hash(i, j + 1, seed)) * u;
  return a + (b - a) * v;
}

/** The land from west to east: under the fjord, up the beach, then rising slowly inland. */
function coast(x: number): number {
  if (x <= -96) return -5;
  if (x <= -64) return lerp(-5, 0.5, (x + 96) / 32);
  if (x <= -40) return lerp(0.5, 2.5, (x + 64) / 24);
  return 2.5 + (x + 40) * 0.05;
}

/** How inland a point is: 0 on the beach and under the water, 1 from 20 m up from it. */
const inland = (x: number) => clamp01((x + 50) / 30);
const across = (x: number, z: number, at: readonly [number, number]) => Math.hypot(x - at[0], z - at[1]);

/** How much a pad holds a point level: 1 within its radius, 0 past its falloff. */
function held(pad: Pad, x: number, z: number): number {
  return smooth(clamp01(1 - (across(x, z, pad.at) - pad.r) / FALLOFF));
}

function knoll(x: number, z: number): number {
  return KNOLL.h * smooth(clamp01(1 - across(x, z, KNOLL.at) / KNOLL.r));
}

/** The ground's height before it is kept in the file. */
export function shaped(x: number, z: number): number {
  const rough = (3 * noise(x, z, 64, 1) + noise(x, z, 16, 2) - 1.5) * inland(x);
  let h = coast(x) + rough + knoll(x, z);
  for (const pad of PADS) h = lerp(h, pad.h, held(pad, x, z));
  return h;
}

const vertex = (n: number) => n * SPACING - HALF;

/** The heights as the file keeps them, 0 to 65535, row by row along z. */
export function heightsGrid(): Uint16Array {
  const out = new Uint16Array(SIZE * SIZE);
  for (let j = 0; j < SIZE; j++)
    for (let i = 0; i < SIZE; i++)
      out[j * SIZE + i] = Math.round(((shaped(vertex(i), vertex(j)) - LOW) / (HIGH - LOW)) * 65535);
  return out;
}

/** The height on the triangles the terrain draws, each square split from (i+1, j) to (i, j+1). */
export function groundAt(grid: Uint16Array, x: number, z: number): number {
  const [gx, gz] = [(x + HALF) / SPACING, (z + HALF) / SPACING];
  const [i, j] = [Math.min(SIZE - 2, Math.floor(gx)), Math.min(SIZE - 2, Math.floor(gz))];
  const [u, v] = [gx - i, gz - j];
  const at = (a: number, b: number) => LOW + ((grid[b * SIZE + a] as number) / 65535) * (HIGH - LOW);
  const [h00, h10, h01, h11] = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
  if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
  return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

/** How much of the trodden earth is under a point: the pads but the wreck's, and the beach's. */
function trodden(x: number, z: number): number {
  return Math.max(...PADS.filter((pad) => pad.id !== 'wreck').map((pad) => held(pad, x, z)));
}

/** Grass inland, shingle down the beach, earth on the pads. */
function paintGrid(): Uint8Array {
  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      const [x, z] = [vertex(i), vertex(j)];
      const earth = Math.round(255 * trodden(x, z));
      const shingle = Math.round((255 - earth) * (1 - clamp01((x + 44) / 10)));
      const at = (j * SIZE + i) * 4;
      out[at] = 255 - earth - shingle;
      out[at + 1] = shingle;
      out[at + 2] = earth;
      out[at + 3] = 0;
    }
  }
  return out;
}

/** Woods to the north and the east, thinning to their edges; not on the pads or the knoll's top. */
function woods(x: number, z: number): number {
  const north = clamp01((-36 - z) / 16);
  const east = clamp01((x - 36) / 16);
  const kept = 1 - Math.max(trodden(x, z), clamp01(1 - across(x, z, KNOLL.at) / (KNOLL.r + 4)));
  return Math.max(north, east) * kept * inland(x);
}

/** Pines in the woods (red), scrub on the grass inland (green), the rest left bare. */
function foliageGrid(): Uint8Array {
  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      const [x, z] = [vertex(i), vertex(j)];
      const pines = woods(x, z) * (0.6 + 0.4 * noise(x, z, 24, 5));
      const scrub = (1 - trodden(x, z)) * inland(x) * Math.max(0, noise(x, z, 32, 6) - 0.4) * 1.6;
      const at = (j * SIZE + i) * 4;
      out[at] = Math.round(255 * clamp01(pines));
      out[at + 1] = Math.round(255 * clamp01(scrub));
    }
  }
  return out;
}

/** The three files beside spaces/shore.json, by their path in games/kaldvik/. */
export function makeShore(): ShoreFile[] {
  return [
    { path: 'spaces/shore.foliage.png', bytes: encodePng({ width: SIZE, height: SIZE, data: foliageGrid() }) },
    { path: 'spaces/shore.heights.png', bytes: encodeGray16({ width: SIZE, height: SIZE, data: heightsGrid() }) },
    { path: 'spaces/shore.paint.png', bytes: encodePng({ width: SIZE, height: SIZE, data: paintGrid() }) },
  ];
}
