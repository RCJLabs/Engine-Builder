/**
 * Import's packing (M5.5, D67, docs/specs/models.md#import): every model comes out as one .glb with
 * its geometry quantised and packed by Meshopt, Draco gone, drawing the same shape within a tenth of
 * a millimetre a metre, its materials and their names kept, the same bytes each time.
 */
import { describe, expect, it } from 'vitest';
import { crateModel, dracoDecoder, glbOf, gltfOf, gridModel, jsonOf, nodeIO } from '../test/shapes.ts';
import { modelPositions } from './colliders.ts';
import { packModel } from './pack.ts';

const decoders = async () => ({ draco: await dracoDecoder() });

/** The largest distance between two point lists' matching points. */
function farthestApart(a: Float32Array, b: Float32Array): number {
  expect(b.length).toBe(a.length);
  let most = 0;
  for (let i = 0; i < a.length; i += 3) {
    most = Math.max(
      most,
      Math.hypot(
        (a[i] as number) - (b[i] as number),
        (a[i + 1] as number) - (b[i + 1] as number),
        (a[i + 2] as number) - (b[i + 2] as number),
      ),
    );
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

  it('draws the same shape: every vertex within 0.1 mm a metre of where it was', async () => {
    const plain = await glbOf(gridModel());
    const packed = await packModel({ name: 'hills.glb', bytes: plain }, [], await decoders());
    const io = await nodeIO();
    const before = modelPositions(await io.readBinary(plain));
    const after = modelPositions(await io.readBinary(packed));
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
    const draco = await glbOf(gridModel(), true);
    expect(jsonOf(draco).extensionsRequired).toEqual(['KHR_draco_mesh_compression']);
    const packed = await packModel({ name: 'hills.glb', bytes: draco }, [], await decoders());
    expect(JSON.stringify(jsonOf(packed))).not.toContain('KHR_draco_mesh_compression');
    const io = await nodeIO();
    const before = modelPositions(await io.readBinary(await glbOf(gridModel())));
    const after = modelPositions(await io.readBinary(packed));
    expect(after.length).toBe(before.length);
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
