/**
 * The starter character in three (M6.5, D77, docs/specs/animation.md#the-starter-character): its GLB,
 * carried inside walk.js and the editor's own build, decoded once a page, and a copy of it for each
 * figure, on bones of its own, scaled to the figure's height, its clothes, trim and skin in the
 * look's colours and its hair and soles as the file has them. The stock animator and the model
 * record come with it, so a game with no animation of its own plays the engine's.
 */
import type { AnimatorRecord, ModelRecord } from '@eb/schema';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three/webgpu';
import glbUrl from '../../../../starter-character/assets/starter-character/starter-character.glb?url';
import stock from '../../../../starter-character/records/animator/starter-character.json';
import record from '../../../../starter-character/records/model/starter-character.json';
import type { FigureLook } from '../spaces/figureLook.ts';

/** The model key its clips go by in an animator, and the stock animator's. */
export const CHARACTER = 'starter-character';
export const STOCK_ANIMATOR = stock as AnimatorRecord;
export const CHARACTER_MODEL = record as unknown as ModelRecord;

/** The decoded file: its scene at rest, its clips by name, its height and its hips' height, in metres. */
export interface Character {
  readonly scene: THREE.Object3D;
  readonly clips: ReadonlyMap<string, THREE.AnimationClip>;
  readonly height: number;
  readonly hips: number;
}

let loading: Promise<Character> | null = null;
let ready: Character | null = null;

/** Decodes the file once a page: from its own URL, or from `bytes` where there is no fetch to it (Node). */
export function loadCharacter(bytes?: ArrayBuffer): Promise<Character> {
  loading ??= (async () => {
    const buffer = bytes ?? (await (await fetch(glbUrl)).arrayBuffer());
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '');
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene, true);
    const hips = scene.getObjectByName('hips');
    const made: Character = {
      scene,
      clips: new Map(gltf.animations.map((clip) => [clip.name, clip])),
      height: box.max.y,
      hips: hips ? hips.getWorldPosition(new THREE.Vector3()).y : 0.95,
    };
    ready = made;
    return made;
  })();
  return loading;
}

/** The decoded file once loadCharacter has resolved, else null: a figure drawn before then is the old capsule. */
export const characterReady = (): Character | null => ready;

/** The slots a look colours; the rest keep the file's. */
const COLOURED = ['clothes', 'trim', 'skin'] as const;

export function createCharacters() {
  const materials = new Map<string, THREE.Material>();
  const coloured = (slot: string, source: THREE.Material, colour: string) => {
    const key = `${slot}:${colour}`;
    let made = materials.get(key);
    if (!made) {
      made = (source as THREE.MeshStandardMaterial).clone();
      (made as THREE.MeshStandardMaterial).color.set(colour);
      materials.set(key, made);
    }
    return made;
  };

  return {
    /**
     * A copy of the character for one figure, its feet at its origin, facing −z: the group holds
     * the look for the hooks, and its one child, the copy, is what an animator moves.
     */
    character(made: Character, look: FigureLook): THREE.Group {
      const body = clone(made.scene);
      body.scale.setScalar(look.height / made.height);
      body.traverse((node) => {
        const mesh = node as THREE.SkinnedMesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        // Its bounds are its rest pose's: lying down or reaching out, it would be culled while seen.
        mesh.frustumCulled = false;
        const slot = (mesh.material as THREE.Material).name as (typeof COLOURED)[number];
        if (COLOURED.includes(slot)) mesh.material = coloured(slot, mesh.material as THREE.Material, look[slot]);
      });
      body.userData.animated = { model: CHARACTER };
      const group = new THREE.Group();
      group.add(body);
      group.userData.figure = look;
      return group;
    },
    dispose() {
      for (const material of materials.values()) material.dispose();
      materials.clear();
    },
  };
}
