/**
 * Tap to move's ring (M6.2, D74, docs/specs/navigation.md#the-stage): where a tap sends the player,
 * flat on the navmesh, until they get there or something else moves them. And the ray a tap on the
 * view makes, from the camera through the point tapped.
 */
import * as THREE from 'three/webgpu';
import type { Vec3 } from '../spaces/vec.ts';

const LIFT = 0.03;

export function createTapMarker(scene: THREE.Scene) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.4, 32),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  ring.renderOrder = 1;
  scene.add(ring);
  return {
    show(at: Vec3 | null): void {
      ring.visible = at !== null;
      if (at) ring.position.set(at[0], at[1] + LIFT, at[2]);
    },
    shown: (): Vec3 | null => (ring.visible ? [ring.position.x, ring.position.y - LIFT, ring.position.z] : null),
  };
}

/** The ray from the camera through a point of the view, in CSS pixels from its top left. */
export function rayFrom(camera: THREE.PerspectiveCamera, x: number, y: number, w: number, h: number) {
  const caster = new THREE.Raycaster();
  caster.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), camera);
  const { origin, direction } = caster.ray;
  return { from: [origin.x, origin.y, origin.z] as Vec3, dir: [direction.x, direction.y, direction.z] as Vec3 };
}
