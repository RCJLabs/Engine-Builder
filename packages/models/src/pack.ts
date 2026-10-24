/**
 * A model as import brings it in (M5.5, D67, docs/specs/models.md#import): a .glb, or a .gltf with
 * the files it names, read with its Draco, Meshopt and KTX2, and written as one .glb with its
 * geometry reordered for the vertex cache, quantised and packed by Meshopt. Draco is gone from what it writes. Textures go through
 * as they came: a KTX2 stays one, and a PNG or JPG isn't turned into one.
 */
import type { Document, JSONDocument } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { type Decoders, modelIO } from './io.ts';
import { quantize } from './quantize.ts';
import { reorder } from './reorder.ts';

export interface ModelFile {
  /** Its name as picked: `ship.gltf`, `ship.bin`, `textures/hull.png`. */
  readonly name: string;
  readonly bytes: Uint8Array;
}

const DRACO = 'KHR_draco_mesh_compression';
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

const uris = (json: JSONDocument['json']): string[] =>
  [...(json.buffers ?? []), ...(json.images ?? [])]
    .map((item) => item.uri)
    .filter((uri): uri is string => typeof uri === 'string' && !uri.startsWith('data:'));

/** The model `main` read, a .gltf's files found among `beside` by their path or their name alone. */
export async function readModel(main: ModelFile, beside: readonly ModelFile[], decoders: Decoders): Promise<Document> {
  const io = await modelIO(decoders);
  if (main.name.toLowerCase().endsWith('.glb')) return io.readBinary(main.bytes);
  const json = JSON.parse(new TextDecoder().decode(main.bytes)) as JSONDocument['json'];
  const byName = new Map(beside.map((file) => [file.name, file.bytes]));
  const byBase = new Map(beside.map((file) => [baseName(file.name), file.bytes]));
  const resources: Record<string, Uint8Array> = {};
  for (const uri of uris(json)) {
    const path = decodeURIComponent(uri);
    const bytes = byName.get(path) ?? byBase.get(baseName(path));
    if (!bytes) throw new Error(`${main.name} needs ${path} beside it: pick it with the model`);
    resources[uri] = bytes;
  }
  return io.readJSON({ json, resources: resources as JSONDocument['resources'] });
}

/** The model packed: reordered, quantised, compressed with Meshopt, one .glb. */
export async function packModel(
  main: ModelFile,
  beside: readonly ModelFile[],
  decoders: Decoders,
): Promise<Uint8Array> {
  const doc = await readModel(main, beside, decoders);
  for (const extension of doc.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === DRACO) extension.dispose();
  }
  await reorder(doc);
  quantize(doc);
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  return (await modelIO(decoders)).writeBinary(doc);
}
