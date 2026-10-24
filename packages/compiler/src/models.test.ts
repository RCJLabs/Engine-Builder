/**
 * Models and materials (M5.5, D67, docs/specs/models.md#the-checks): the engine's two record types,
 * a model's file read as far as its glTF JSON (E070, W146), its LOD levels in order (E071), its
 * collider's numbers (E072), and the field checks every record gets (E001, E005, E018).
 */
import { COLLIDER_NEEDS, MATERIAL_DEFAULTS, MATERIAL_PRESETS, MATERIAL_TYPE_FILE, MODEL_TYPE_FILE } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { glb } from '../test/glb.ts';
import { compileProject } from './compile.ts';
import { memorySource } from './source.ts';

const json = (value: unknown) => JSON.stringify(value);

const CRATE = {
  asset: { version: '2.0' },
  extensionsUsed: ['EXT_meshopt_compression'],
  extensionsRequired: ['EXT_meshopt_compression'],
  materials: [{ name: 'wood' }, { name: 'metal' }, {}],
};

const LOG = {
  files: Object.fromEntries(
    ['models/crate.glb', 'models/old.glb', 'models/splat.glb', 'models/broken.glb', 'models/loose.gltf'].map((f) => [
      f,
      { licence: 'own', source: 'Made for the test', date: '2026-10-24' },
    ]),
  ),
};

function project(records: Record<string, unknown>) {
  return memorySource({
    'project.json': '{ "format": 1, "id": "yard", "name": "Yard", "version": "0.1.0" }',
    'assets/assets.json': json(LOG),
    'assets/models/crate.glb': glb(CRATE),
    'assets/models/old.glb': glb({ asset: { version: '1.0' } }),
    'assets/models/splat.glb': glb({ asset: { version: '2.0' }, extensionsRequired: ['KHR_gaussian_splatting'] }),
    'assets/models/broken.glb': 'not a model',
    'assets/models/loose.gltf': json({ asset: { version: '2.0' }, buffers: [{ uri: 'loose.bin' }] }),
    'records/material/oak.json': json({ name: 'Oak', color: '#8a5a35' }),
    ...Object.fromEntries(Object.entries(records).map(([path, value]) => [path, json(value)])),
  });
}

async function problems(records: Record<string, unknown>): Promise<string[]> {
  const result = await compileProject(project(records), []);
  return result.diagnostics.map((d) => `${d.code} ${d.file} ${d.path} ${d.message}`);
}

describe('material records', () => {
  it('pass with every field set, or none, and every preset passes', async () => {
    const presets = Object.fromEntries(MATERIAL_PRESETS.map((p) => [`records/material/${p.id}.json`, p.value]));
    expect(await problems({ 'records/material/plain.json': {}, ...presets })).toEqual([]);
  });

  it('give each field left out but the name a value', () => {
    const fields = Object.keys(MATERIAL_TYPE_FILE.fields).filter((f) => f !== 'name');
    expect(Object.keys(MATERIAL_DEFAULTS).sort()).toEqual(fields.sort());
    for (const def of Object.values(MATERIAL_TYPE_FILE.fields)) expect(def.optional).toBe(true);
  });

  it('has eight presets of their own ids', () => {
    expect(MATERIAL_PRESETS.map((p) => p.id)).toEqual([
      'wood',
      'stone',
      'metal',
      'painted',
      'plastic',
      'glass',
      'glow',
      'ground',
    ]);
  });

  it('are E001 out of their bounds or of a colour that isn’t one', async () => {
    const found = await problems({ 'records/material/odd.json': { roughness: 2, opacity: -1, color: 'red' } });
    expect(found.map((line) => line.split(' ').slice(0, 3).join(' '))).toEqual([
      'E001 records/material/odd.json /color',
      'E001 records/material/odd.json /opacity',
      'E001 records/material/odd.json /roughness',
    ]);
  });
});

describe('model records', () => {
  const crate = (more: Record<string, unknown> = {}) => ({ file: 'models/crate.glb', ...more });

  it('pass with only a file, or with every field set', async () => {
    expect(
      await problems({
        'records/model/crate.json': crate(),
        'records/model/full.json': crate({
          name: 'Crate',
          scale: 2,
          materials: [
            { slot: 'wood', material: 'oak' },
            { slot: '#2', material: 'oak' },
          ],
          lod: [
            { ratio: 0.5, from: 15 },
            { ratio: 0.25, from: 30 },
            { ratio: 0.1, from: 60 },
          ],
          collider: { shape: 'box', center: [0, 0.5, 0], size: [1, 1, 1] },
        }),
      }),
    ).toEqual([]);
  });

  it('need a file, and only the file is required', async () => {
    const required = Object.entries(MODEL_TYPE_FILE.fields).filter(([, def]) => !def.optional);
    expect(required.map(([name]) => name)).toEqual(['file']);
    expect((await problems({ 'records/model/none.json': {} })).map((l) => l.split(' ').slice(0, 3).join(' '))).toEqual([
      'E001 records/model/none.json /file',
    ]);
  });

  it('are E018 for a file that isn’t there, and E001 for one that isn’t a model', async () => {
    const found = await problems({
      'records/model/gone.json': { file: 'models/gone.glb' },
      'records/model/flat.json': { file: 'portraits/face.png' },
    });
    expect(found.map((l) => l.split(' ').slice(0, 3).join(' '))).toEqual([
      'E001 records/model/flat.json /file',
      'E018 records/model/gone.json /file',
    ]);
  });

  it('are E070 for a file the engine can’t draw, with why', async () => {
    expect(
      await problems({
        'records/model/old.json': { file: 'models/old.glb' },
        'records/model/splat.json': { file: 'models/splat.glb' },
        'records/model/broken.json': { file: 'models/broken.glb' },
        'records/model/loose.json': { file: 'models/loose.gltf' },
      }),
    ).toEqual([
      'E070 records/model/broken.json /file Not a .glb file: it doesn’t start with glTF',
      'E070 records/model/loose.json /file It names assets/models/loose.bin, which isn’t there',
      'E070 records/model/old.json /file It is glTF 1.0: the engine reads glTF 2.0',
      'E070 records/model/splat.json /file It needs KHR_gaussian_splatting, which the engine doesn’t read',
    ]);
  });

  it('are W146 at a slot the file has no material of, and E005 at a material there isn’t', async () => {
    expect(
      await problems({
        'records/model/crate.json': crate({
          materials: [
            { slot: 'wood', material: 'oak' },
            { slot: 'glass', material: 'oak' },
            { slot: '#3', material: 'oak' },
            { slot: 'metal', material: 'steel' },
          ],
        }),
      }),
    ).toEqual([
      'W146 records/model/crate.json /materials/1/slot The file has no material “glass”: it has “wood”, “metal”, “#2”',
      'W146 records/model/crate.json /materials/2/slot The file has no material “#3”: it has “wood”, “metal”, “#2”',
      'E005 records/model/crate.json /materials/3/material No record material:steel',
    ]);
  });

  it('are E071 where a LOD level keeps no fewer triangles, or starts no farther', async () => {
    expect(
      await problems({
        'records/model/crate.json': crate({
          lod: [
            { ratio: 0.5, from: 20 },
            { ratio: 0.5, from: 20 },
            { ratio: 0.6, from: 10 },
          ],
        }),
      }),
    ).toEqual([
      'E071 records/model/crate.json /lod/1/from Level 2 starts at 20 m, not beyond level 1’s 20 m',
      'E071 records/model/crate.json /lod/1/ratio Level 2 keeps 0.5, not fewer than level 1’s 0.5',
      'E071 records/model/crate.json /lod/2/from Level 3 starts at 10 m, not beyond level 2’s 20 m',
      'E071 records/model/crate.json /lod/2/ratio Level 3 keeps 0.6, not fewer than level 2’s 0.5',
    ]);
  });

  it('are E001 for more than three LOD levels or a ratio out of its bounds', async () => {
    const four = [0.8, 0.6, 0.4, 0.2].map((ratio, i) => ({ ratio, from: (i + 1) * 10 }));
    const found = await problems({
      'records/model/four.json': crate({ lod: four }),
      'records/model/whole.json': crate({ lod: [{ ratio: 1, from: 10 }] }),
    });
    expect(found.map((l) => l.split(' ').slice(0, 3).join(' '))).toEqual([
      'E001 records/model/four.json /lod',
      'E001 records/model/whole.json /lod/0/ratio',
    ]);
  });

  it('are E072 for a collider missing its shape’s numbers or holding another’s', async () => {
    expect(
      await problems({
        'records/model/a.json': crate({ collider: { shape: 'box', center: [0, 0, 0] } }),
        'records/model/b.json': crate({ collider: { shape: 'sphere', center: [0, 0, 0], radius: 1, size: [1, 1, 1] } }),
        'records/model/c.json': crate({ collider: { shape: 'hull', center: [0, 0, 0] } }),
      }),
    ).toEqual([
      'E072 records/model/a.json /collider/size A box needs its size',
      'E072 records/model/b.json /collider/size A sphere has no size: take it out',
      'E072 records/model/c.json /collider/center A hull has no center: take it out',
      'E072 records/model/c.json /collider/points A hull needs its points',
    ]);
  });

  it('are E072 for a size, radius or height that can’t be, and pass each shape whole', async () => {
    expect(
      await problems({
        'records/model/flat.json': crate({ collider: { shape: 'box', center: [0, 0, 0], size: [1, 0, 1] } }),
        'records/model/dot.json': crate({ collider: { shape: 'sphere', center: [0, 0, 0], radius: 0 } }),
        'records/model/stub.json': crate({ collider: { shape: 'capsule', center: [0, 0, 0], radius: 1, height: 1.5 } }),
        'records/model/pill.json': crate({ collider: { shape: 'capsule', center: [0, 1, 0], radius: 0.5, height: 2 } }),
        'records/model/hull.json': crate({
          collider: {
            shape: 'hull',
            points: [
              [0, 0, 0],
              [1, 0, 0],
              [0, 1, 0],
              [0, 0, 1],
            ],
          },
        }),
      }),
    ).toEqual([
      'E072 records/model/dot.json /collider/radius Its radius is above 0 m',
      'E072 records/model/flat.json /collider/size Each of a box’s sides is above 0 m',
      'E072 records/model/stub.json /collider/height A capsule is at least as long as it is wide, 2 m',
    ]);
  });

  it('are E001 for a hull of fewer than 4 points or a point that isn’t three numbers', async () => {
    const found = await problems({
      'records/model/thin.json': crate({
        collider: {
          shape: 'hull',
          points: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0],
          ],
        },
      }),
      'records/model/bent.json': crate({
        collider: {
          shape: 'hull',
          points: [
            [0, 0],
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
        },
      }),
    });
    expect(found.map((l) => l.split(' ').slice(0, 3).join(' '))).toEqual([
      'E001 records/model/bent.json /collider/points/0',
      'E001 records/model/thin.json /collider/points',
    ]);
  });

  it('says what each collider shape needs', () => {
    expect(COLLIDER_NEEDS).toEqual({
      box: ['center', 'size'],
      sphere: ['center', 'radius'],
      capsule: ['center', 'radius', 'height'],
      hull: ['points'],
    });
  });
});
