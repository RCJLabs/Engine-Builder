/**
 * Each mesh, and each LOD, under a three object: apart from modelParts.ts so the foliage's view and
 * the view itself, which load with every space, take these alone and not the simplifier and hull
 * modelParts.ts brings (M5.6).
 */
import type * as THREE from 'three/webgpu';

export function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((part) => {
    if ((part as THREE.Mesh).isMesh) meshes.push(part as THREE.Mesh);
  });
  return meshes;
}

export function lodsOf(root: THREE.Object3D): THREE.LOD[] {
  const lods: THREE.LOD[] = [];
  root.traverse((part) => {
    if ((part as THREE.LOD).isLOD) lods.push(part as THREE.LOD);
  });
  return lods;
}
