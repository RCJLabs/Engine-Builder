/**
 * Models made in code for @eb/models' tests (M5.5): a grid with hills, its material named, under a
 * node moved off the origin; a crate of two parts; and the same written plain, with Draco, or as a
 * .gltf with its .bin beside it.
 */
import { Document, type Node, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { MeshoptEncoder } from 'meshoptimizer/encoder';

/** A grid of `n` by `n` vertices 0.1 m apart, with hills, UVs from 0 to 1 and normals. */
export function gridArrays(n = 33) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      positions.push(i * 0.1, Math.sin(i * 0.4) * Math.cos(j * 0.3) * 0.5, j * 0.1);
      const v = [Math.sin(i * 0.4) * 0.3, 1, Math.cos(j * 0.3) * 0.2];
      const l = Math.hypot(v[0] as number, v[1] as number, v[2] as number);
      normals.push((v[0] as number) / l, (v[1] as number) / l, (v[2] as number) / l);
      uvs.push(i / (n - 1), j / (n - 1));
    }
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      indices.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

/** A box's 8 corners and 12 triangles, `size` across, centred on `at`. */
function boxArrays(size: number, at: [number, number, number]) {
  const h = size / 2;
  const positions: number[] = [];
  for (const x of [-h, h])
    for (const y of [-h, h]) for (const z of [-h, h]) positions.push(at[0] + x, at[1] + y, at[2] + z);
  const indices = [
    0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3,
  ];
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** The grid model: a mesh "hills" with the material "turf", under a node at (5, 0, -2), turned and scaled. */
export function gridModel(): Document {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const { positions, normals, uvs, indices } = gridArrays();
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uvs).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
    .setMaterial(doc.createMaterial('turf').setBaseColorFactor([0.3, 0.6, 0.2, 1]));
  const node = doc
    .createNode('hills')
    .setMesh(doc.createMesh('hills').addPrimitive(primitive))
    .setTranslation([5, 0, -2])
    .setRotation([0, Math.SQRT1_2, 0, Math.SQRT1_2])
    .setScale([2, 2, 2]);
  doc.createScene('scene').addChild(node);
  return doc;
}

/** A crate: a wooden box and a smaller metal one on top, two materials, the second unnamed. */
export function crateModel(): Document {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const part = (size: number, at: [number, number, number], name: string): Node => {
    const { positions, indices } = boxArrays(size, at);
    const primitive = doc
      .createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer))
      .setMaterial(doc.createMaterial(name));
    return doc.createNode(name || 'lid').setMesh(doc.createMesh(name || 'lid').addPrimitive(primitive));
  };
  doc
    .createScene('scene')
    .addChild(part(1, [0, 0.5, 0], 'wood'))
    .addChild(part(0.5, [0, 1.25, 0], ''));
  return doc;
}

/** A Node reader and writer with every extension and every coder. */
export async function nodeIO(): Promise<NodeIO> {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
}

/** The Draco decoder module, as the editor's worker makes from three's copy. */
export const dracoDecoder = (): Promise<unknown> => draco3d.createDecoderModule();

/** A model written as a .glb, plain or with its geometry in Draco. */
export async function glbOf(doc: Document, draco = false): Promise<Uint8Array> {
  if (draco) doc.createExtension(KHRDracoMeshCompression).setRequired(true);
  return (await nodeIO()).writeBinary(doc);
}

/** A model written as a .gltf and the files beside it, by name. */
export async function gltfOf(
  doc: Document,
  bin = 'model.bin',
): Promise<{ gltf: Uint8Array; files: Map<string, Uint8Array> }> {
  for (const buffer of doc.getRoot().listBuffers()) buffer.setURI(bin);
  const { json, resources } = await (await nodeIO()).writeJSON(doc);
  return {
    gltf: new TextEncoder().encode(JSON.stringify(json)),
    files: new Map(Object.entries(resources).map(([name, bytes]) => [name, new Uint8Array(bytes)])),
  };
}

/** A .glb's JSON chunk. */
export function jsonOf(glb: Uint8Array): Record<string, unknown> {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + view.getUint32(12, true))));
}
