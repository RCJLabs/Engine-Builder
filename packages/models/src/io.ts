/**
 * gltf-transform's reader and writer with every extension it knows (M5.5, D67) and the decoders a
 * model can need: Meshopt's and its encoder, which meshoptimizer carries in any engine, and Draco's,
 * which the caller brings: draco3d's module in Node, three's own copy in the editor's worker.
 */
import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { MeshoptEncoder } from 'meshoptimizer/encoder';

export interface Decoders {
  /** An Emscripten Draco decoder module, as `draco3d.createDecoderModule()` makes one. */
  readonly draco?: unknown;
}

/** A reader and writer for every extension, its decoders ready. */
export async function modelIO(decoders: Decoders = {}): Promise<WebIO> {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  return new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
    ...(decoders.draco !== undefined ? { 'draco3d.decoder': decoders.draco } : {}),
  });
}
