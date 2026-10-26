/**
 * The starter character in three (M6.5, D77, docs/specs/animation.md#the-starter-character): a
 * copy of it for each figure, on bones of its own, scaled to the figure's height, its clothes, trim
 * and skin in the look's colours and its hair and soles as the file has them, standing in the
 * idle's first frame until an animator moves it. The stock animator and the model record come
 * with it, so a game with no animation of its own plays the engine's. characterLoad.ts decodes the
 * file; until it has, a figure draws as M6.1's capsule.
 */
import type { AnimatorRecord, ModelRecord } from '@eb/schema';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three/webgpu';
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

let ready: Character | null = null;

/** The decoded file once characterLoad.ts has read it, else null. */
export const characterReady = (): Character | null => ready;

export function setCharacter(made: Character): Character {
  ready = made;
  return made;
}

/** The slots a look colours; the rest keep the file's. */
const COLOURED = ['clothes', 'trim', 'skin'] as const;
type Coloured = (typeof COLOURED)[number];
const isColoured = (slot: string): slot is Coloured => (COLOURED as readonly string[]).includes(slot);

/** `body` in the first frame of `clip`, bound and let go again. */
function posed(body: THREE.Object3D, clip: THREE.AnimationClip | undefined): void {
  if (!clip) return;
  const mixer = new THREE.AnimationMixer(body);
  mixer.clipAction(clip).play();
  mixer.update(0);
  mixer.stopAllAction();
  mixer.uncacheRoot(body);
}

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
        const slot = (mesh.material as THREE.Material).name;
        if (isColoured(slot)) mesh.material = coloured(slot, mesh.material as THREE.Material, look[slot]);
      });
      posed(body, made.clips.get('idle'));
      body.userData.animated = { model: CHARACTER, hips: made.hips };
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
