/**
 * Foliage (M5.6, D68, docs/specs/foliage.md#checks): the engine's foliage records and E074 for
 * their ranges out of order; a terrain's foliage list as E058 and E073; its density file as E067
 * and W144 from its header alone; and the space as a use of each foliage record.
 */
import { FOLIAGE_DEFAULTS, FOLIAGE_PRESETS, FOLIAGE_TYPE_FILE } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { pngOf } from '../test/png.ts';
import { compileProject } from './compile.ts';
import { memorySource } from './source.ts';
import { checkSpaceParts } from './spaceParts.ts';
import { readSpaces } from './spaces.ts';

const json = (value: unknown) => JSON.stringify(value);
const TERRAIN = { size: 65, spacing: 1, low: -5, high: 20, layers: [{ name: 'Grass', color: '#5f8f3e' }] };
const PLAIN = {
  'spaces/glade.heights.png': pngOf(65, 65, 16, 0),
  'spaces/glade.paint.png': pngOf(65, 65, 8, 6),
};
const DENSITY = pngOf(65, 65, 8, 6);

function source(files: Record<string, unknown>) {
  return memorySource({
    'project.json': '{ "format": 1, "id": "glade", "name": "Glade", "version": "0.1.0" }',
    'assets/assets.json': json({ files: {} }),
    'records/model/pine.json': json({ file: 'models/pine.glb' }),
    'records/foliage/pines.json': json({ model: 'pine', density: 2 }),
    'records/foliage/meadow.json': json({ name: 'Meadow', model: 'pine', density: 150, lean: 1 }),
    ...Object.fromEntries(
      Object.entries(files).map(([path, value]) => [path, value instanceof Uint8Array ? value : json(value)]),
    ),
  });
}

/** The problems found, but for the model's missing file, which this test doesn't give. */
async function problems(files: Record<string, unknown>): Promise<string[]> {
  const result = await compileProject(source(files), []);
  return result.diagnostics
    .filter((d) => d.file !== 'records/model/pine.json')
    .map((d) => `${d.code} ${d.file} ${d.path} ${d.message}`);
}

const glade = (foliage?: unknown) => ({ name: 'Glade', terrain: { ...TERRAIN, foliage }, objects: [] });

describe('foliage records', () => {
  it('pass with only a model, and give every other field but the name and the heights a value', async () => {
    expect(await problems({ 'records/foliage/plain.json': { model: 'pine' } })).toEqual([]);
    const given = Object.keys(FOLIAGE_DEFAULTS).sort();
    const fields = Object.keys(FOLIAGE_TYPE_FILE.fields).filter(
      (f) => !['name', 'model', 'lowest', 'highest'].includes(f),
    );
    expect(given).toEqual(fields.sort());
  });

  it('are E074 for a size range or heights out of order, at the field set', async () => {
    expect(
      await problems({
        'records/foliage/big.json': { model: 'pine', smallest: 2, largest: 1 },
        'records/foliage/tall.json': { model: 'pine', smallest: 1.5 },
        'records/foliage/even.json': { model: 'pine', smallest: 1, largest: 1, lowest: 10, highest: 10 },
      }),
    ).toEqual([
      'E074 records/foliage/big.json /smallest The smallest, 2, is above the largest, 1',
      'E074 records/foliage/even.json /lowest The lowest, 10 m, isn’t below the highest, 10 m',
      'E074 records/foliage/tall.json /smallest The smallest, 1.5, is above the largest, 1.2',
    ]);
  });

  it('are E005 for a model that isn’t a model record, and E001 out of bounds', async () => {
    const found = await problems({ 'records/foliage/odd.json': { model: 'oak', density: 500, lean: 2 } });
    expect(found.map((line) => line.split(' ').slice(0, 3).join(' '))).toEqual([
      'E001 records/foliage/odd.json /density',
      'E001 records/foliage/odd.json /lean',
      'E005 records/foliage/odd.json /model',
    ]);
  });

  it('have presets that are themselves sound foliage', async () => {
    const files = Object.fromEntries(
      FOLIAGE_PRESETS.map((p) => [`records/foliage/${p.id}.json`, { name: p.name, model: 'pine', ...p.value }]),
    );
    expect(await problems(files)).toEqual([]);
  });
});

describe('a terrain’s foliage', () => {
  it('passes with its records there and its density file of its kind and size, each record used by the space', async () => {
    const files = { 'spaces/glade.json': glade(['pines', 'meadow']), ...PLAIN, 'spaces/glade.foliage.png': DENSITY };
    expect(await problems(files)).toEqual([]);
    const read = await readSpaces(source(files));
    const has = (type: string, id: string) => type === 'foliage' && ['pines', 'meadow'].includes(id);
    const found = checkSpaceParts(read.files, {
      types: new Map(),
      records: { has, ids: () => [] } as never,
      value: () => undefined,
      known: {} as never,
      kinds: new Map(),
      uncheckedKinds: new Set(),
    });
    expect(found).toEqual({
      diagnostics: [],
      uses: [
        { key: 'foliage:pines', file: 'spaces/glade.json', object: '', path: '/terrain/foliage/0' },
        { key: 'foliage:meadow', file: 'spaces/glade.json', object: '', path: '/terrain/foliage/1' },
      ],
    });
  });

  it('is E073 for a foliage record there isn’t, and E058 for one listed twice or more than four', async () => {
    expect(
      await problems({ 'spaces/glade.json': glade(['pines', 'ferns']), ...PLAIN, 'spaces/glade.foliage.png': DENSITY }),
    ).toEqual(['E073 spaces/glade.json /terrain/foliage/1 No foliage record "ferns"']);
    expect(await problems({ 'spaces/glade.json': glade(['pines', 'pines']), ...PLAIN })).toEqual([
      'E058 spaces/glade.json /terrain/foliage A foliage type is listed once',
    ]);
    expect(await problems({ 'spaces/glade.json': glade(['a', 'b', 'c', 'd', 'e']), ...PLAIN })).toEqual([
      'E058 spaces/glade.json /terrain/foliage A terrain has 4 foliage types at most',
    ]);
  });

  it('is E067 without its density file, or with one not of its kind and size', async () => {
    expect(await problems({ 'spaces/glade.json': glade(['pines']), ...PLAIN })).toEqual([
      'E067 spaces/glade.json /terrain No spaces/glade.foliage.png: a terrain’s foliage’s density sits beside its space',
    ]);
    expect(
      await problems({
        'spaces/glade.json': glade(['pines']),
        ...PLAIN,
        'spaces/glade.foliage.png': pngOf(65, 65, 16, 0),
      }),
    ).toEqual(['E067 spaces/glade.foliage.png  The foliage’s density is a 8-bit RGBA PNG']);
    expect(
      await problems({
        'spaces/glade.json': glade(['pines']),
        ...PLAIN,
        'spaces/glade.foliage.png': pngOf(33, 33, 8, 6),
      }),
    ).toEqual(['E067 spaces/glade.foliage.png  It is 33×33; the terrain is 65×65']);
  });

  it('is W144 for a density file whose terrain lists no foliage, or whose space has no terrain', async () => {
    expect(
      await problems({ 'spaces/glade.json': glade(undefined), ...PLAIN, 'spaces/glade.foliage.png': DENSITY }),
    ).toEqual(['W144 spaces/glade.foliage.png  Ignored: spaces/glade.json’s terrain lists no foliage']);
    expect(await problems({ 'spaces/glade.json': glade([]), ...PLAIN, 'spaces/glade.foliage.png': DENSITY })).toEqual([
      'W144 spaces/glade.foliage.png  Ignored: spaces/glade.json’s terrain lists no foliage',
    ]);
    expect(
      await problems({
        'spaces/glade.json': { name: 'Glade', objects: [] },
        'spaces/glade.foliage.png': DENSITY,
      }),
    ).toEqual(['W144 spaces/glade.foliage.png  Ignored: spaces/glade.json has no terrain']);
  });
});
