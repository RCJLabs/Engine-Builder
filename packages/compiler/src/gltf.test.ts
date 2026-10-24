/**
 * A model's glTF JSON, read without decoding (M2.7, here since M5.5): its counts, slots, extensions
 * and the files it names beside itself, and why the engine can't draw one (E070's messages).
 */
import { describe, expect, it } from 'vitest';
import { glb } from '../test/glb.ts';
import { gltfProblems, gltfSummary, READ_EXTENSIONS } from './gltf.ts';

const encode = (text: string) => new TextEncoder().encode(text);

const SHIP = {
  asset: { version: '2.0' },
  accessors: [{ count: 36 }, { count: 24 }, { count: 10 }],
  meshes: [
    {
      primitives: [
        { attributes: { POSITION: 1 }, indices: 0 },
        { attributes: { POSITION: 2 }, mode: 5 },
      ],
    },
    { primitives: [{ attributes: { POSITION: 1 } }, { attributes: { POSITION: 1 }, mode: 1 }] },
  ],
  materials: [{ name: 'hull' }, {}, { name: '' }],
  textures: [{}],
  animations: [{}],
  nodes: [{}, {}, {}],
  extensionsUsed: ['EXT_meshopt_compression', 'KHR_materials_variants'],
  extensionsRequired: ['EXT_meshopt_compression'],
  buffers: [{ uri: 'ship.bin' }, { uri: 'data:application/octet-stream;base64,AAAA' }],
  images: [{ uri: '../textures/hull%20plate.png' }, { uri: '../../outside.png' }],
};

describe('model summaries', () => {
  it('counts what a .glb holds, triangles over every kind of primitive', () => {
    expect(gltfSummary('models/ship.glb', glb(SHIP), new Set())).toMatchObject({
      format: 'glb',
      version: '2.0',
      meshes: 2,
      // 36 indices (12), a strip of 10 (8), 24 positions (8); lines draw none.
      triangles: 28,
      materials: 3,
      textures: 1,
      animations: 1,
      nodes: 3,
    });
  });

  it('names each material’s slot: its name, or # and its place for one without', () => {
    const summary = gltfSummary('models/ship.glb', glb(SHIP), new Set());
    expect(typeof summary === 'string' ? summary : summary.slots).toEqual(['hull', '#1', '#2']);
  });

  it('lists the extensions used and those required', () => {
    const summary = gltfSummary('models/ship.glb', glb(SHIP), new Set());
    expect(typeof summary === 'string' ? summary : [summary.extensionsUsed, summary.extensionsRequired]).toEqual([
      ['EXT_meshopt_compression', 'KHR_materials_variants'],
      ['EXT_meshopt_compression'],
    ]);
  });

  it('names the files a .gltf needs beside it, and which are there', () => {
    const summary = gltfSummary('models/ship.gltf', encode(JSON.stringify(SHIP)), new Set(['models/ship.bin']));
    expect(typeof summary === 'string' ? summary : summary.external).toEqual([
      { path: 'models/ship.bin', found: true },
      { path: 'textures/hull plate.png', found: false },
      { path: '../../outside.png', found: false },
    ]);
  });

  it('says why a model can’t be read', () => {
    expect(gltfSummary('a.glb', encode('not a model at all'), new Set())).toBe(
      'Not a .glb file: it doesn’t start with glTF',
    );
    expect(gltfSummary('a.gltf', encode('{'), new Set())).toBe('Its JSON can’t be read');
    expect(gltfSummary('a.gltf', encode('[]'), new Set())).toBe('Its JSON isn’t a glTF object');
    const binFirst = glb(SHIP);
    new DataView(binFirst.buffer).setUint32(16, 0x004e4942, true);
    expect(gltfSummary('a.glb', binFirst, new Set())).toBe('Its JSON chunk is missing');
    const cut = glb(SHIP).subarray(0, 40);
    expect(gltfSummary('a.glb', cut, new Set())).toBe('Its JSON chunk is missing');
  });
});

describe('what the engine can draw', () => {
  const problems = (json: unknown, assets: string[] = []) =>
    gltfProblems(gltfSummary('models/m.glb', glb(json), new Set(assets)));

  it('is glTF 2 needing only extensions it reads, with every file it names there', () => {
    const fine = { asset: { version: '2.0' }, extensionsUsed: ['KHR_materials_variants'] };
    expect(problems(fine)).toEqual([]);
    expect(
      problems({ ...fine, extensionsRequired: [...READ_EXTENSIONS], buffers: [{ uri: 'm.bin' }] }, ['models/m.bin']),
    ).toEqual([]);
  });

  it('is not glTF 1, a model of no version, one needing what it can’t read, or one missing its files', () => {
    expect(problems({ asset: { version: '1.0' } })).toEqual(['It is glTF 1.0: the engine reads glTF 2.0']);
    expect(problems({})).toEqual(['It is glTF of no version: the engine reads glTF 2.0']);
    expect(
      problems({
        asset: { version: '2.0' },
        extensionsRequired: ['KHR_draco_mesh_compression', 'KHR_gaussian_splatting'],
      }),
    ).toEqual(['It needs KHR_gaussian_splatting, which the engine doesn’t read']);
    expect(problems({ asset: { version: '2.0' }, images: [{ uri: 'bark.ktx2' }] })).toEqual([
      'It names assets/models/bark.ktx2, which isn’t there',
    ]);
  });

  it('passes on why the file can’t be read at all', () => {
    expect(gltfProblems('Its JSON can’t be read')).toEqual(['Its JSON can’t be read']);
  });
});
