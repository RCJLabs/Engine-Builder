/**
 * The model worker (M5.5, D67): packs a model as import brings it in, and fits a collider to a
 * model's file, off the page's thread. Since M6.5 (D77) a skinned model is put on the engine's rig
 * as it is packed, its clips in place. Draco's decoder is three's own copy, made as three's
 * DRACOLoader makes it, from its wrapper and its wasm in the editor's files, never fetched from
 * elsewhere; it is made only when a file needs it.
 */
import { gltfSummary } from '@eb/compiler';
import { fitBox, fitCapsule, fitSphere, modelPositions } from '@eb/models/colliders';
import { fitHull } from '@eb/models/hull';
import { packModel, readModel } from '@eb/models/pack';
import { rigModel } from '@eb/models/rig';
import type { ColliderShape, ModelCollider } from '@eb/schema';
import dracoWasm from 'three/examples/jsm/libs/draco/draco_decoder.wasm?url';
import dracoWrapper from 'three/examples/jsm/libs/draco/draco_wasm_wrapper.js?raw';
import type { ModelReply, ModelRequest, PickedFile } from './protocol.ts';

let draco: Promise<unknown> | null = null;

/** The Draco decoder, made once. Its module is a thenable that resolves to itself, so it comes back inside an object. */
function dracoDecoder(): Promise<unknown> {
  draco ??= (async () => {
    const wasmBinary = await (await fetch(dracoWasm)).arrayBuffer();
    // Three's own Draco wrapper, from the editor's files, run as DRACOLoader runs it.
    const factory = new Function(`${dracoWrapper}\nreturn DracoDecoderModule;`)() as (config: object) => void;
    const made = await new Promise<{ module: unknown }>((resolve) =>
      factory({ wasmBinary, onModuleLoaded: (module: unknown) => resolve({ module }) }),
    );
    return made.module;
  })();
  return draco;
}

const usesDraco = (file: PickedFile) =>
  new TextDecoder()
    .decode(file.bytes.subarray(0, Math.min(file.bytes.length, 1 << 20)))
    .includes('KHR_draco_mesh_compression');

const FITS: Record<ColliderShape, (points: Float32Array) => ModelCollider> = {
  box: fitBox,
  sphere: fitSphere,
  capsule: fitCapsule,
  hull: fitHull,
};

/** The decoders a model's files need: Draco's only when one of them uses it. */
const decodersFor = async (files: readonly PickedFile[]) =>
  files.some(usesDraco) ? { draco: await dracoDecoder() } : {};

async function fit(main: PickedFile, beside: readonly PickedFile[], shape: ColliderShape): Promise<ModelCollider> {
  const doc = await readModel(main, beside, await decodersFor([main, ...beside]));
  return FITS[shape](modelPositions(doc));
}

async function answer(request: ModelRequest): Promise<ModelReply> {
  const { id, main, beside } = request;
  if (request.kind === 'fit') return { id, ok: true, collider: await fit(main, beside, request.shape) };
  const start = performance.now();
  // Put on the rig as it is read, before it is packed: its clips go in in place (M6.5).
  let rigged: ReturnType<typeof rigModel> = null;
  const glb = await packModel(main, beside, await decodersFor([main, ...beside]), (doc) => {
    rigged = rigModel(doc);
  });
  const rig = rigged as ReturnType<typeof rigModel>;
  const summary = gltfSummary('model.glb', glb, new Set());
  if (typeof summary === 'string') throw new Error(summary);
  const collider = await fit({ name: 'model.glb', bytes: glb }, [], 'box');
  const ms = Math.round(performance.now() - start);
  return {
    id,
    ok: true,
    packed: {
      glb,
      triangles: summary.triangles,
      slots: summary.slots,
      collider,
      ms,
      rig: rig
        ? { rigged: rig.rigged, bones: rig.bones as Record<string, string>, missing: rig.missing, clips: rig.clips }
        : null,
    },
  };
}

self.onmessage = async ({ data }: MessageEvent<ModelRequest>) => {
  let reply: ModelReply;
  try {
    reply = await answer(data);
  } catch (error) {
    reply = { id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const glb = reply.ok && 'packed' in reply ? [reply.packed.glb.buffer as ArrayBuffer] : [];
  (self as unknown as Worker).postMessage(reply, glb);
};
