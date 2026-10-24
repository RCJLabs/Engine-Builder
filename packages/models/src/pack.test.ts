/**
 * Import's packing (M5.5, D67, docs/specs/models.md#import): every model comes out as one .glb with
 * its geometry quantised and packed by Meshopt, Draco gone, drawing the same shape within a tenth of
 * a millimetre a metre, its materials and their names kept, the same bytes each time.
 */
import type { Document } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { crateModel, dracoDecoder, glbOf, gltfOf, gridModel, jsonOf, nodeIO } from '../test/shapes.ts';
import { packModel } from './pack.ts';

const decoders = async () => ({ draco: await dracoDecoder() });

const n = (list: ArrayLike<number>, i: number) => list[i] as number;

/** Every triangle the default scene draws, as its three corners in the model's metres. */
function trianglesOf(doc: Document): number[][] {
  const root = doc.getRoot();
  const out: number[][] = [];
  const v = [0, 0, 0];
  (root.getDefaultScene() ?? root.listScenes()[0])?.traverse((node) => {
    const m = node.getWorldMatrix();
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const positions = primitive.getAttribute('POSITION');
      const indices = primitive.getIndices();
      if (!positions || !indices) continue;
      const at = (i: number) => {
        positions.getElement(indices.getScalar(i), v);
        const [x, y, z] = v as [number, number, number];
        return [0, 1, 2].map((r) => n(m, r) * x + n(m, r + 4) * y + n(m, r + 8) * z + n(m, r + 12));
      };
      for (let t = 0; t < indices.getCount(); t += 3) out.push([...at(t), ...at(t + 1), ...at(t + 2)]);
    }
  });
  return out;
}

/** How far apart two triangles' corners are, at most, turned to match best with their winding kept. */
function triangleGap(a: number[], b: number[]): number {
  let best = Infinity;
  for (let turn = 0; turn < 9; turn += 3) {
    let most = 0;
    for (let i = 0; i < 9; i += 3) {
      const j = (i + turn) % 9;
      most = Math.max(most, Math.hypot(n(a, i) - n(b, j), n(a, i + 1) - n(b, j + 1), n(a, i + 2) - n(b, j + 2)));
    }
    best = Math.min(best, most);
  }
  return best;
}

/**
 * The largest gap between a triangle of `a` and the nearest of `b`, the same number of each: the
 * shape compared whatever order packing put vertices and triangles in. Triangles are looked for
 * among those whose middles are within a cell of 10 cm.
 */
function farthestApart(a: number[][], b: number[][]): number {
  expect(a.length).toBeGreaterThan(0);
  expect(b.length).toBe(a.length);
  const cell = (t: number[]) => [0, 1, 2].map((c) => Math.floor((n(t, c) + n(t, c + 3) + n(t, c + 6)) / 3 / 0.1));
  const cells = new Map<string, number[][]>();
  for (const t of b) {
    const key = cell(t).join();
    cells.set(key, [...(cells.get(key) ?? []), t]);
  }
  let most = 0;
  for (const t of a) {
    const [x, y, z] = cell(t) as [number, number, number];
    let nearest = Infinity;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (const u of cells.get([x + dx, y + dy, z + dz].join()) ?? [])
            nearest = Math.min(nearest, triangleGap(t, u));
    most = Math.max(most, nearest);
  }
  return most;
}

describe('packing a model', () => {
  it('writes one .glb packed by Meshopt and quantised, needing both', async () => {
    const packed = await packModel({ name: 'hills.glb', bytes: await glbOf(gridModel()) }, [], await decoders());
    const json = jsonOf(packed);
    expect(json.extensionsRequired).toEqual(['EXT_meshopt_compression', 'KHR_mesh_quantization']);
    expect(json.extensionsUsed).toEqual(['EXT_meshopt_compression', 'KHR_mesh_quantization']);
  });

  it('draws the same triangles: every corner within 0.1 mm a metre of where it was', async () => {
    const plain = await glbOf(gridModel());
    const packed = await packModel({ name: 'hills.glb', bytes: plain }, [], await decoders());
    const io = await nodeIO();
    const before = trianglesOf(await io.readBinary(plain));
    const after = trianglesOf(await io.readBinary(packed));
    // The grid spans 3.2 m, doubled by its node: 6.4 m, so 0.1 mm a metre is 0.64 mm.
    expect(farthestApart(before, after)).toBeLessThan(6.4e-4);
    expect(farthestApart(before, after)).toBeGreaterThan(0);
  });

  it('is smaller than the plain file by more than three times', async () => {
    const plain = await glbOf(gridModel());
    const packed = await packModel({ name: 'hills.glb', bytes: plain }, [], await decoders());
    expect(packed.byteLength * 3).toBeLessThan(plain.byteLength);
  });

  it('keeps each material and its name, and each mesh’s triangles', async () => {
    const packed = await packModel({ name: 'crate.glb', bytes: await glbOf(crateModel()) }, [], await decoders());
    const back = await (await nodeIO()).readBinary(packed);
    expect(
      back
        .getRoot()
        .listMaterials()
        .map((m) => m.getName()),
    ).toEqual(['wood', '']);
    expect(
      back
        .getRoot()
        .listMeshes()
        .map((m) => m.listPrimitives()[0]?.getIndices()?.getCount()),
    ).toEqual([36, 36]);
  });

  it('reads Draco and writes none of it', async () => {
    const draco = await glbOf(gridModel(), 'draco');
    expect(jsonOf(draco).extensionsRequired).toEqual(['KHR_draco_mesh_compression']);
    const packed = await packModel({ name: 'hills.glb', bytes: draco }, [], await decoders());
    expect(JSON.stringify(jsonOf(packed))).not.toContain('KHR_draco_mesh_compression');
    const io = await nodeIO();
    const before = trianglesOf(await io.readBinary(await glbOf(gridModel())));
    const after = trianglesOf(await io.readBinary(packed));
    // Draco's own 14 bits a position come first: about 0.4 mm over the grid's 6.4 m.
    expect(farthestApart(before, after)).toBeLessThan(1e-3);
  });

  it('brings a .gltf’s files inside, found by their path or their name alone', async () => {
    const { gltf, files } = await gltfOf(gridModel(), 'parts/hills.bin');
    const beside = [...files].map(([name, bytes]) => ({ name: name.replace('parts/', 'picked/'), bytes }));
    const packed = await packModel({ name: 'hills.gltf', bytes: gltf }, beside, await decoders());
    const json = jsonOf(packed);
    expect((json.buffers as { uri?: string }[]).every((b) => b.uri === undefined)).toBe(true);
  });

  it('says which file a .gltf needs that wasn’t picked with it', async () => {
    const { gltf } = await gltfOf(gridModel(), 'hills.bin');
    await expect(packModel({ name: 'hills.gltf', bytes: gltf }, [], await decoders())).rejects.toThrow(
      'hills.gltf needs hills.bin beside it: pick it with the model',
    );
  });

  it('gives the same bytes for the same file', async () => {
    const plain = await glbOf(gridModel());
    const once = await packModel({ name: 'a.glb', bytes: plain }, [], await decoders());
    const twice = await packModel({ name: 'b.glb', bytes: plain }, [], await decoders());
    expect(twice).toEqual(once);
  });

  it('keeps an image as it came, a KTX2 one included', async () => {
    const doc = crateModel();
    const bytes = new TextEncoder().encode('a ktx2 file, as far as the packer cares');
    const texture = doc.createTexture('bark').setImage(bytes).setMimeType('image/ktx2');
    doc.getRoot().listMaterials()[0]?.setBaseColorTexture(texture);
    const packed = await packModel({ name: 'crate.glb', bytes: await glbOf(doc) }, [], await decoders());
    const back = await (await nodeIO()).readBinary(packed);
    const [kept] = back.getRoot().listTextures();
    expect(kept?.getMimeType()).toBe('image/ktx2');
    expect(kept?.getImage()).toEqual(bytes);
  });
});
