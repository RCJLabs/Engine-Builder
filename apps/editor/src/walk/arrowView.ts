/**
 * Arrows in flight drawn (M6.4, D76): a thin shaft along each one's velocity, from a pool that grows
 * to the most ever in flight at once. Where they are is arrows.ts's; this only draws it.
 */
import * as THREE from 'three/webgpu';
import type { Vec3 } from '../spaces/vec.ts';

const LENGTH = 0.7;
const ALONG = new THREE.Vector3(0, 0, 1);

export function createArrowView(scene: THREE.Scene) {
  const geometry = new THREE.BoxGeometry(0.03, 0.03, LENGTH);
  const material = new THREE.MeshStandardMaterial({ color: '#8a6a3f', roughness: 0.8 });
  const pool: THREE.Mesh[] = [];
  const dir = new THREE.Vector3();
  return {
    /** Each arrow at its point, turned along its velocity; the rest of the pool hidden. */
    draw(arrows: readonly { readonly at: Vec3; readonly velocity: Vec3 }[]): void {
      while (pool.length < arrows.length) {
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        pool.push(mesh);
      }
      pool.forEach((mesh, i) => {
        const arrow = arrows[i];
        mesh.visible = arrow !== undefined;
        if (!arrow) return;
        mesh.position.set(...arrow.at);
        if (dir.set(...arrow.velocity).lengthSq() > 0) mesh.quaternion.setFromUnitVectors(ALONG, dir.normalize());
      });
    },
    dispose(): void {
      for (const mesh of pool) scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
