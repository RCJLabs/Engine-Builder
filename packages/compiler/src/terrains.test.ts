/**
 * A space's terrain and water (M5.3, D65): the terrain's settings as E058, its heights and paint
 * PNGs as E067 and W144 from their headers alone, and water off a plane as W145.
 */
import { describe, expect, it } from 'vitest';
import { pngOf } from '../test/png.ts';
import { compileProject } from './compile.ts';
import { memorySource } from './source.ts';
import { pngHeader } from './terrains.ts';

const json = (value: unknown) => JSON.stringify(value);
const TERRAIN = { size: 65, spacing: 1, low: -5, high: 20, layers: [{ name: 'Grass', color: '#5f8f3e' }] };
const HEIGHTS = pngOf(65, 65, 16, 0);
const PAINT = pngOf(65, 65, 8, 6);

async function problems(files: Record<string, unknown>): Promise<string[]> {
  const source = memorySource({
    'project.json': '{ "format": 1, "id": "fell", "name": "Fell", "version": "0.1.0" }',
    ...Object.fromEntries(
      Object.entries(files).map(([path, value]) => [path, value instanceof Uint8Array ? value : json(value)]),
    ),
  });
  const result = await compileProject(source, []);
  return result.diagnostics.map((d) => `${d.code} ${d.file} ${d.path} ${d.message}`);
}

const fell = (terrain: unknown, objects: unknown[] = []) => ({ name: 'Fell', terrain, objects });

describe('pngHeader', () => {
  it('reads a PNG’s size, depth and colour type, and refuses what isn’t one', () => {
    expect(pngHeader(HEIGHTS)).toEqual({ width: 65, height: 65, bitDepth: 16, colorType: 0 });
    expect(pngHeader(new TextEncoder().encode('not a png at all, but long enough to read'))).toBeNull();
    expect(pngHeader(HEIGHTS.subarray(0, 20))).toBeNull();
  });
});

describe('a terrain', () => {
  it('passes with its settings in range and both files of its kind and size', async () => {
    const files = {
      'spaces/fell.json': fell(TERRAIN),
      'spaces/fell.heights.png': HEIGHTS,
      'spaces/fell.paint.png': PAINT,
    };
    expect(await problems(files)).toEqual([]);
  });

  it('is E058 for settings that don’t fit, and in a prefab', async () => {
    const bad = { size: 100, spacing: 0.1, low: 5, high: 5, layers: [] };
    const found = await problems({
      'spaces/fell.json': fell(bad),
      'prefabs/hill.json': { name: 'Hill', terrain: TERRAIN, objects: [] },
    });
    expect(found).toEqual([
      'E058 prefabs/hill.json /terrain Only a space has a terrain: a prefab is placed in one',
      'E058 spaces/fell.json /terrain/high High is above low',
      'E058 spaces/fell.json /terrain/layers A terrain has a layer at least',
      'E058 spaces/fell.json /terrain/size A size is 65, 129, 257 or 513',
      'E058 spaces/fell.json /terrain/spacing At least 0.25 m',
    ]);
  });

  it('is E067 for a file missing, not a PNG, of the wrong kind or size', async () => {
    const found = await problems({
      'spaces/fell.json': fell(TERRAIN),
      'spaces/fell.heights.png': pngOf(65, 65, 8, 0),
      'spaces/moor.json': fell(TERRAIN),
      'spaces/moor.heights.png': pngOf(129, 129, 16, 0),
      'spaces/moor.paint.png': new TextEncoder().encode('{ "not": "a png", "but": "long enough to be read" }'),
      // Of the right size one way only, and of the right depth in the wrong colours.
      'spaces/bog.json': fell(TERRAIN),
      'spaces/bog.heights.png': pngOf(65, 129, 16, 0),
      'spaces/bog.paint.png': pngOf(65, 65, 8, 0),
    });
    expect(found).toEqual([
      'E067 spaces/bog.heights.png  It is 65×129; the terrain is 65×65',
      'E067 spaces/bog.paint.png  The paint are a 8-bit RGBA PNG',
      'E067 spaces/fell.heights.png  The heights are a 16-bit greyscale PNG',
      'E067 spaces/fell.json /terrain No spaces/fell.paint.png: a terrain’s paint sit beside its space',
      'E067 spaces/moor.heights.png  It is 129×129; the terrain is 65×65',
      'E067 spaces/moor.paint.png  It isn’t a PNG',
    ]);
  });

  it('is W144 for files whose space has no terrain or isn’t there, and W141 for one misnamed', async () => {
    const found = await problems({
      'spaces/fell.json': fell(undefined),
      'spaces/fell.heights.png': HEIGHTS,
      'spaces/gone.paint.png': PAINT,
      'spaces/Fell.heights.png': HEIGHTS,
      // A part misspelt is no terrain's file: ignored as any other file there is, and a terrain missing it is E067.
      'spaces/fell.height.png': HEIGHTS,
    });
    expect(found).toEqual([
      'W141 spaces/Fell.heights.png  "Fell" isn’t a space\'s id: its terrain\'s files carry it',
      'W144 spaces/fell.heights.png  Ignored: spaces/fell.json has no terrain',
      'W144 spaces/gone.paint.png  Ignored: there is no spaces/gone.json',
    ]);
  });
});

describe('water', () => {
  it('passes on a plane, and is W145 on any other shape, its own or one an override gives it', async () => {
    const water = { water: { clarity: 0.4 } };
    const found = await problems({
      'prefabs/pond.json': {
        name: 'Pond',
        objects: [
          { id: 'surface', shape: 'plane', components: water },
          { id: 'well', shape: 'box', components: water },
        ],
      },
      'spaces/fell.json': {
        name: 'Fell',
        objects: [
          { id: 'lake', shape: 'plane', components: { water: {} } },
          { id: 'tank', shape: 'box', components: { water: { color: '#224466' } } },
          { id: 'pond', prefab: 'pond', overrides: { surface: { shape: 'sphere' } } },
        ],
      },
    });
    expect(found).toEqual([
      "W145 prefabs/pond.json /objects/1 Water off a plane: only a plane's top is a water surface",
      "W145 spaces/fell.json /objects/1 Water off a plane: only a plane's top is a water surface",
      "W145 spaces/fell.json /objects/2 Water off a plane (pond › surface): only a plane's top is a water surface",
    ]);
  });

  it('is E063 for a clarity out of range', async () => {
    const found = await problems({
      'spaces/fell.json': {
        name: 'Fell',
        objects: [{ id: 'lake', shape: 'plane', components: { water: { clarity: 2 } } }],
      },
    });
    expect(found).toEqual(['E063 spaces/fell.json /objects/0/components/water/clarity At most 1']);
  });
});
