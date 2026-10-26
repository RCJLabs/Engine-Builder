/**
 * The clips an animator's preview plays from the project's own models (M6.5, D77): the models it
 * names, and each one's file read from the project and decoded with three's GLTFLoader, its clips
 * by name and its hips' height. An import packs a model as one GLB, so nothing beside it is read; a
 * file that doesn't decode plays nothing, and the model's form says why.
 */
import { ASSETS_DIR } from '@eb/compiler';
import type { AnimatorRecord } from '@eb/schema';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three/webgpu';
import type { OpenProject } from '../projects/opened.ts';

export interface ModelClips {
  readonly clips: ReadonlyMap<string, THREE.AnimationClip>;
  readonly hips: number;
}

/** The models whose clips the animator's states play: its own, and each state's other. */
export function modelsNamed(record: AnimatorRecord): string[] {
  const named = new Set([record.clips]);
  for (const layer of [record.base, record.upper])
    for (const state of layer?.states ?? []) if (state.from) named.add(state.from);
  return [...named];
}

export async function decodeClips(project: OpenProject, id: string): Promise<ModelClips | null> {
  const record = project.index?.records.get(`model:${id}`)?.value as { file?: unknown } | undefined;
  if (typeof record?.file !== 'string') return null;
  const bytes = await project.source.read(`${ASSETS_DIR}/${record.file}`);
  if (!bytes) return null;
  try {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '');
    gltf.scene.updateMatrixWorld(true);
    const hips = gltf.scene.getObjectByName('hips');
    return {
      clips: new Map(gltf.animations.map((clip) => [clip.name, clip])),
      hips: hips ? hips.getWorldPosition(new THREE.Vector3()).y : 0,
    };
  } catch {
    return null;
  }
}
