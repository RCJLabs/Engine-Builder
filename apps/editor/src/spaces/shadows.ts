/**
 * The sun's shadows at a quality tier (M5.7, D69, docs/specs/performance.md#the-tiers): none at
 * Low, a map whose side rises with the tier above it. The sun's light shines from where the
 * environment puts it, towards the space's origin; its shadow camera is fitted to a sphere round
 * the origin that holds the terrain and the objects, so nothing outside it is shadowed.
 */
import * as THREE from 'three/webgpu';
import { extentOf, type TerrainGrid } from '../terrain/grid.ts';

/** Shapes and models cast and receive; marks, wires and water neither cast, and water only receives. */
export function castShadows(root: THREE.Object3D): void {
  root.traverse((part) => {
    const mesh = part as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const water = material?.userData.water === true;
    const lit = !(material instanceof THREE.MeshBasicMaterial) && !water;
    mesh.castShadow = lit;
    mesh.receiveShadow = lit || water;
  });
}

/** Shadows on or off for the renderer and the sun, at a map `size` a side (0 for none). */
export function sunShadows(renderer: THREE.WebGPURenderer, sun: THREE.DirectionalLight, size: number): void {
  renderer.shadowMap.enabled = size > 0;
  sun.castShadow = size > 0;
  if (size > 0) sun.shadow.mapSize.set(size, size);
}

/** The sun's shadow camera round everything drawn: the terrain's corners and heights, and the objects. */
export function fitShadowsTo(
  sun: THREE.DirectionalLight,
  grid: TerrainGrid | null,
  objects: THREE.Object3D | undefined,
): void {
  let radius = grid ? Math.hypot(extentOf(grid), extentOf(grid), Math.max(Math.abs(grid.low), Math.abs(grid.high))) : 0;
  const box = objects ? new THREE.Box3().setFromObject(objects) : new THREE.Box3();
  if (!box.isEmpty()) {
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    radius = Math.max(radius, sphere.center.length() + sphere.radius);
  }
  fitSunShadow(sun, radius || 10);
}

/** The sun's shadow camera round a sphere of `radius` metres at the origin, from wherever the sun now is. */
export function fitSunShadow(sun: THREE.DirectionalLight, radius: number): void {
  const camera = sun.shadow.camera;
  const r = Math.max(radius, 1);
  camera.left = -r;
  camera.right = r;
  camera.top = r;
  camera.bottom = -r;
  camera.near = 0.5;
  camera.far = sun.position.length() + 2 * r;
  camera.updateProjectionMatrix();
}
