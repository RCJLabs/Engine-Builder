/**
 * The starter character's file decoded (M6.5, D77): its GLB, carried inside walk.js and the
 * editor's own build, read once a page with three's GLTFLoader and Meshopt's decoder. Apart from
 * character.ts, so the Scene view's start carries none of the loader: it is fetched with the first
 * figure drawn.
 */
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three/webgpu';
import glbUrl from '../../../../starter-character/assets/starter-character/starter-character.glb?url';
import { type Character, characterReady, setCharacter } from './character.ts';

let loading: Promise<Character> | null = null;

/** Decodes the file once a page: from its own URL, or from `bytes` where nothing serves it (Node). */
export function loadCharacter(bytes?: ArrayBuffer): Promise<Character> {
  const ready = characterReady();
  if (ready) return Promise.resolve(ready);
  loading ??= (async () => {
    const buffer = bytes ?? (await (await fetch(glbUrl)).arrayBuffer());
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '');
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene, true);
    const hips = scene.getObjectByName('hips');
    return setCharacter({
      scene,
      clips: new Map(gltf.animations.map((clip) => [clip.name, clip])),
      height: box.max.y,
      hips: hips ? hips.getWorldPosition(new THREE.Vector3()).y : 0.95,
    });
  })();
  return loading;
}
