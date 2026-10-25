/**
 * The moor (M5.10's gate, D72, docs/specs/streaming.md#the-gate), as code: a terrain 1,024 m
 * across, 257 vertices 4 m apart, with cottages, fences, rocks, pines and lamp posts from the
 * starter kit spread over it, a road north from the spawn, a cairn whose zone sets a flag 150 m
 * along it and a chest to take on the road beyond it. `pnpm make:moor` writes it to fixtures/moor/, and
 * moor.test.ts holds the committed files to what this makes, byte for byte.
 *
 * Every number is integer arithmetic or a polynomial, never Math.random or a transcendental, so it
 * makes the same bytes on any machine.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodeGray16, encodePng } from '@eb/export';

const KIT = resolve(import.meta.dirname, '../../../../starter-kit');

export const SIZE = 257;
export const SPACING = 4;
const LOW = 0;
const HIGH = 40;
/** The road runs north (−z) along this x, from the spawn's z to its end. */
export const ROAD_X = 32;
const ROAD_FROM = 48;
const ROAD_TO = -460;
export const SPAWN: readonly [number, number] = [ROAD_X, 40];
export const CAIRN_Z = -118;
/** On the road, so a walk north stops against it, facing it. */
export const CHEST: readonly [number, number] = [ROAD_X, -128];
const HALF = ((SIZE - 1) / 2) * SPACING;

export interface MoorFile {
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

/** Value noise on a lattice `cell` metres apart, 0 to 1, smooth between its points. */
function noise(x: number, z: number, cell: number, seed: number): number {
  const [fx, fz] = [x / cell, z / cell];
  const [i, j] = [Math.floor(fx), Math.floor(fz)];
  const [u, v] = [smooth(fx - i), smooth(fz - j)];
  const a = hash(i, j, seed) + (hash(i + 1, j, seed) - hash(i, j, seed)) * u;
  const b = hash(i, j + 1, seed) + (hash(i + 1, j + 1, seed) - hash(i, j + 1, seed)) * u;
  return a + (b - a) * v;
}

const hills = (x: number, z: number) => 4 + 18 * noise(x, z, 256, 1) + 6 * noise(x, z, 64, 2) + noise(x, z, 16, 3);

/** How much of the road is under a point: 1 on it, falling to 0 six metres off. */
function onRoad(x: number, z: number): number {
  if (z > ROAD_FROM + 6 || z < ROAD_TO - 6) return 0;
  return Math.max(0, 1 - Math.max(0, Math.abs(x - ROAD_X) - 3) / 6);
}

/** The ground's height before it is kept in the file: the hills, levelled across the road. */
function shaped(x: number, z: number): number {
  const road = onRoad(x, z);
  return hills(x, z) + (hills(ROAD_X, z) - hills(x, z)) * road;
}

/** The heights as the file keeps them, 0 to 65535, row by row along z. */
function heightsGrid(): Uint16Array {
  const out = new Uint16Array(SIZE * SIZE);
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      const h = shaped(i * SPACING - HALF, j * SPACING - HALF);
      out[j * SIZE + i] = Math.round(((h - LOW) / (HIGH - LOW)) * 65535);
    }
  }
  return out;
}

/** The height at a point on the triangles the terrain draws: each square split from (i+1, j) to (i, j+1). */
function groundAt(grid: Uint16Array, x: number, z: number): number {
  const [gx, gz] = [(x + HALF) / SPACING, (z + HALF) / SPACING];
  const [i, j] = [Math.min(SIZE - 2, Math.floor(gx)), Math.min(SIZE - 2, Math.floor(gz))];
  const [u, v] = [gx - i, gz - j];
  const at = (a: number, b: number) => LOW + ((grid[b * SIZE + a] as number) / 65535) * (HIGH - LOW);
  const [h00, h10, h01, h11] = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
  if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
  return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

/** Grass everywhere, heather where the noise says, the track on the road. */
function paintGrid(): Uint8Array {
  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      const [x, z] = [i * SPACING - HALF, j * SPACING - HALF];
      const track = Math.round(255 * Math.min(1, onRoad(x, z) * 1.5));
      const heather = Math.round((255 - track) * Math.max(0, noise(x, z, 48, 4) - 0.5) * 2);
      const at = (j * SIZE + i) * 4;
      out[at] = 255 - track - heather;
      out[at + 1] = heather;
      out[at + 2] = track;
      out[at + 3] = 0;
    }
  }
  return out;
}

type Fields = Record<string, unknown>;
const r2 = (n: number) => Math.round(n * 100) / 100 + 0;

/** One object a line, its fields in the order the editor writes them (spaceFile.ts). */
const ORDER = ['id', 'name', 'shape', 'prefab', 'at', 'turn', 'scale', 'color'];
function objectLine(object: Fields): string {
  const keys = [...ORDER.filter((key) => key in object), ...Object.keys(object).filter((key) => !ORDER.includes(key))];
  const fields = keys.map((key) => {
    const value = object[key];
    const text = Array.isArray(value) ? `[${value.map((v) => JSON.stringify(v)).join(', ')}]` : JSON.stringify(value);
    return `${JSON.stringify(key)}: ${text}`;
  });
  return `{ ${fields.join(', ')} }`;
}

const COTTAGE = {
  name: 'Cottage',
  objects: [
    { id: 'floor', record: 'model:kit-floor' },
    { id: 'north', record: 'model:kit-wall', at: [0, 0.1, -0.9] },
    { id: 'door', record: 'model:kit-doorway', at: [0, 0.1, 0.9] },
    { id: 'east', record: 'model:kit-wall', at: [0.9, 0.1, 0], turn: [0, 90, 0] },
    { id: 'west', record: 'model:kit-wall', at: [-0.9, 0.1, 0], turn: [0, 90, 0] },
    { id: 'roof', record: 'model:kit-floor', at: [0, 2.6, 0] },
  ],
};

/** Every cell's scattered things: none on the road or near the spawn, the cairn and the chest. */
function spread(grid: Uint16Array): Fields[] {
  const objects: Fields[] = [];
  const kept = (x: number, z: number, clear: number) =>
    Math.abs(x - ROAD_X) > clear &&
    Math.hypot(x - SPAWN[0], z - SPAWN[1]) > 20 &&
    Math.abs(x) < HALF - 8 &&
    Math.abs(z) < HALF - 8;
  const place = (id: string, record: string, x: number, z: number, turn: number, more: Fields = {}) =>
    objects.push({
      id,
      at: [r2(x), r2(groundAt(grid, x, z)), r2(z)],
      ...(turn ? { turn: [0, turn, 0] } : {}),
      record,
      ...more,
    });
  for (let ci = -8; ci < 8; ci++) {
    for (let cj = -8; cj < 8; cj++) {
      const [x0, z0] = [ci * 64, cj * 64];
      const name = `${ci + 8}-${cj + 8}`;
      if ((ci * 7 + cj * 3 + 99) % 3 === 0) {
        const [x, z] = [x0 + 16 + hash(ci, cj, 5) * 32, z0 + 16 + hash(ci, cj, 6) * 32];
        if (kept(x, z, 12)) {
          const y = r2(groundAt(grid, x, z));
          objects.push({
            id: `cottage-${name}`,
            prefab: 'cottage',
            at: [r2(x), y, r2(z)],
            turn: [0, 90 * Math.floor(hash(ci, cj, 7) * 4), 0],
          });
        }
      }
      for (let k = 0; k < 2; k++) {
        const [x, z] = [x0 + hash(ci, cj, 10 + k) * 64, z0 + hash(ci, cj, 20 + k) * 64];
        if (kept(x, z, 8))
          place(
            `rock-${name}-${k}`,
            k === 0 ? 'model:kit-rock-large' : 'model:kit-rock-small',
            x,
            z,
            Math.floor(hash(ci, cj, 30 + k) * 24) * 15,
          );
      }
      for (let k = 0; k < 3; k++) {
        const [x, z] = [x0 + hash(ci, cj, 40 + k) * 64, z0 + hash(ci, cj, 50 + k) * 64];
        if (kept(x, z, 8)) place(`pine-${name}-${k}`, 'model:kit-pine', x, z, 0);
      }
    }
  }
  return objects;
}

/** Along the road: its lamp posts, a fence on its west side, the cairn and its zone, and the chest. */
function road(grid: Uint16Array): Fields[] {
  const g = (x: number, z: number) => r2(groundAt(grid, x, z));
  const objects: Fields[] = [];
  for (let z = 24, n = 0; z > ROAD_TO; z -= 32, n++)
    objects.push({ id: `lamp-${n}`, at: [ROAD_X + 4, g(ROAD_X + 4, z), z], record: 'model:kit-lamp-post' });
  for (let z = 8, n = 0; z > -200; z -= 8, n++)
    objects.push({
      id: `fence-${n}`,
      at: [ROAD_X - 4, g(ROAD_X - 4, z), z],
      turn: [0, 90, 0],
      record: 'model:kit-fence',
    });
  objects.push({
    id: 'cairn',
    name: 'Cairn',
    shape: 'cylinder',
    at: [ROAD_X + 6, g(ROAD_X + 6, CAIRN_Z), CAIRN_Z],
    scale: [1.2, 1.4, 1.2],
    color: '#7d776f',
    components: { collider: {} },
  });
  objects.push({
    id: 'cairn-zone',
    name: 'Cairn zone',
    shape: 'box',
    at: [ROAD_X, g(ROAD_X, CAIRN_Z) - 0.5, CAIRN_Z],
    scale: [14, 4, 4],
    components: { trigger: { effects: [{ effect: 'set-flag', flag: 'cairn-seen', to: true }], once: true } },
  });
  objects.push({
    id: 'chest',
    name: 'Chest',
    at: [CHEST[0], g(CHEST[0], CHEST[1]), CHEST[1]],
    turn: [0, 90, 0],
    record: 'model:kit-chest',
    components: { interact: { label: 'Take', effects: [{ effect: 'give-item', item: 'lantern' }], takes: true } },
  });
  return objects;
}

function spaceText(grid: Uint16Array): string {
  const spawn = {
    id: 'start',
    name: 'Start',
    shape: 'box',
    at: [SPAWN[0], r2(groundAt(grid, SPAWN[0], SPAWN[1])), SPAWN[1]],
    scale: [0.6, 0.1, 0.6],
    color: '#d9d9d9',
    components: { spawn: { start: true } },
  };
  const objects = [spawn, ...road(grid), ...spread(grid)];
  const terrain = {
    size: SIZE,
    spacing: SPACING,
    low: LOW,
    high: HIGH,
    layers: [
      { name: 'Grass', color: '#6f8f4e' },
      { name: 'Heather', color: '#7a5c7a' },
      { name: 'Track', color: '#9a8a6a' },
    ],
  };
  const lines = objects.map((o) => `    ${objectLine(o)}`).join(',\n');
  return `{\n  "name": "The moor",\n  "terrain": ${JSON.stringify(terrain)},\n  "objects": [\n${lines}\n  ]\n}\n`;
}

const json = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
const text = (value: string) => new TextEncoder().encode(value);

/** The kit's models the moor places, and the materials they draw with. */
const MODELS = ['floor', 'wall', 'doorway', 'fence', 'lamp-post', 'rock-large', 'rock-small', 'pine', 'chest'];
const MATERIALS = ['stone', 'wood', 'metal', 'glow', 'leaves', 'painted'];

function kitFiles(): MoorFile[] {
  const files: MoorFile[] = [];
  const log = JSON.parse(readFileSync(resolve(KIT, 'assets/assets.json'), 'utf8')) as {
    files: Record<string, unknown>;
  };
  const listed: Record<string, unknown> = {};
  for (const id of MODELS) {
    const file = `starter-kit/${id}.glb`;
    listed[file] = log.files[file];
    files.push({ path: `assets/${file}`, bytes: new Uint8Array(readFileSync(resolve(KIT, 'assets', file))) });
    const record = JSON.parse(readFileSync(resolve(KIT, `records/model/kit-${id}.json`), 'utf8')) as Fields;
    // The moor's pine has a level of half its triangles from 60 m, so its far drawing is seen picking one.
    const own = id === 'pine' ? { ...record, lod: [{ ratio: 0.5, from: 60 }] } : record;
    files.push({ path: `records/model/kit-${id}.json`, bytes: json(own) });
  }
  for (const id of MATERIALS) {
    const path = `records/material/kit-${id}.json`;
    files.push({ path, bytes: new Uint8Array(readFileSync(resolve(KIT, path))) });
  }
  files.push({ path: 'assets/assets.json', bytes: json({ files: listed }) });
  return files;
}

const GAME = `// The moor (M5.10's gate, D72): a kilometre of hills walked, the walk building what is near. Its
// cairn's zone and its chest are data; this game only keeps walking on offer.
import { moor } from './moor';

export const modules = [moor];
export const start = 'out';
`;

const MODULE = `// The moor's one mode: walked, and a rest, so there is always something on offer.
import type { Module } from 'eb';
import { defineModule } from 'eb';

export const moor: Module = defineModule<Record<string, never>>({
  id: 'moor',
  init: () => ({}),
  actions: {
    rest: { run: () => {}, options: () => [{}] },
  },
  modes: { out: { actions: ['world/*', 'moor/rest'] } },
});
`;

const SCREEN = {
  title: 'The moor',
  shows: ['out'],
  top: {
    widget: 'stack',
    children: [
      {
        widget: 'text',
        text: 'Walk the road north to the cairn.',
        style: 'heading',
        'shows-when': 'not flag.on(cairn-seen)',
      },
      { widget: 'text', text: 'The cairn is reached.', style: 'heading', 'shows-when': 'flag.on(cairn-seen)' },
      { widget: 'text', text: 'Lantern {inventory.count(item: lantern)}' },
    ],
  },
  main: { widget: 'space', label: 'The moor' },
  bottom: {
    widget: 'stack',
    direction: 'row',
    justify: 'end',
    children: [{ widget: 'button', label: 'Rest a while', action: { take: 'moor/rest' } }],
  },
};

/** Every file of the moor, sorted by path. */
export function makeMoor(): MoorFile[] {
  const grid = heightsGrid();
  const files: MoorFile[] = [
    {
      path: 'project.json',
      bytes: json({
        format: 1,
        id: 'moor',
        name: 'The moor',
        version: '0.1.0',
        kits: ['inventory'],
        'start-space': 'moor',
      }),
    },
    { path: 'spaces/moor.json', bytes: text(spaceText(grid)) },
    { path: 'spaces/moor.heights.png', bytes: encodeGray16({ width: SIZE, height: SIZE, data: grid }) },
    { path: 'spaces/moor.paint.png', bytes: encodePng({ width: SIZE, height: SIZE, data: paintGrid() }) },
    {
      path: 'prefabs/cottage.json',
      bytes: text(
        `{\n  "name": "Cottage",\n  "objects": [\n${COTTAGE.objects.map((o) => `    ${objectLine(o)}`).join(',\n')}\n  ]\n}\n`,
      ),
    },
    {
      path: 'records/flag/cairn-seen.json',
      bytes: json({
        name: 'The cairn is reached',
        description: "Set by the cairn's zone, the first time the walker comes in.",
      }),
    },
    { path: 'records/item/lantern.json', bytes: json({ name: 'Lantern' }) },
    { path: 'scripts/game.ts', bytes: text(GAME) },
    { path: 'scripts/moor.ts', bytes: text(MODULE) },
    { path: 'ui/moor.json', bytes: json(SCREEN) },
    {
      path: 'ui/shell.json',
      bytes: json({
        title: 'The moor',
        tagline: 'A road, a cairn and a chest',
        'slot-line': 'Lantern {inventory.count(item: lantern)}',
      }),
    },
    ...kitFiles(),
  ];
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
