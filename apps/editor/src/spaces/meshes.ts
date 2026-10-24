/**
 * Each mesh under a three object: apart from modelParts.ts so the foliage's view, which loads with
 * every space, takes this alone and not the simplifier and hull modelParts.ts bring (M5.6).
 */
import type * as THREE from 'three/webgpu';

export function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((part) => {
    if ((part as THREE.Mesh).isMesh) meshes.push(part as THREE.Mesh);
  });
  return meshes;
}
