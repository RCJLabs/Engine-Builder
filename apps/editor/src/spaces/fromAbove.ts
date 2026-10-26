/**
 * A space drawn once from straight above, for Bake map (M6.6, D78, docs/specs/markers.md#baking):
 * an orthographic camera over the shot's ground, north (-z) up, nothing above its height drawn; only
 * the scene's children in `keep` shown (the space, its terrain and foliage, the lights), and no fog.
 * Drawn on the view's own canvas at the map's size, where the renderer turns its colours to sRGB as it
 * does every frame, and copied out in the same task, before the frame is shown; then all is put back.
 */
import * as THREE from 'three/webgpu';
import type { MapShot } from '../spaceMaps/shot.ts';
import type { Vec3 } from './vec.ts';

/** How far below the camera the ground may be, beyond the shot's height. */
const DEPTH = 1000;
/** The eye the terrain's and foliage's levels are picked for: low over the middle, so the near ground is fine. */
const LEVELS_EYE = 30;

export function drawFromAbove(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  keep: ReadonlySet<THREE.Object3D>,
  shot: MapShot,
  levels: (eye: Vec3) => void,
): HTMLCanvasElement {
  const [x0, z0, x1, z1] = shot.bounds;
  const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
  const [halfX, halfZ] = [(x1 - x0) / 2, (z1 - z0) / 2];
  const camera = new THREE.OrthographicCamera(-halfX, halfX, halfZ, -halfZ, 0.01, shot.top + DEPTH);
  camera.position.set(cx, shot.top, cz);
  camera.up.set(0, 0, -1);
  camera.lookAt(cx, shot.top - 1, cz);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const hidden = scene.children.filter((child) => child.visible && !keep.has(child));
  for (const child of hidden) child.visible = false;
  const fog = scene.fog;
  scene.fog = null;
  const size = renderer.getSize(new THREE.Vector2());
  const ratio = renderer.getPixelRatio();
  levels([cx, Math.min(shot.top, LEVELS_EYE), cz]);
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(shot.pixels, shot.pixels, false);
    renderer.render(scene, camera);
    const out = document.createElement('canvas');
    out.width = shot.pixels;
    out.height = shot.pixels;
    out.getContext('2d')?.drawImage(renderer.domElement, 0, 0);
    return out;
  } finally {
    renderer.setPixelRatio(ratio);
    renderer.setSize(size.x, size.y, false);
    for (const child of hidden) child.visible = true;
    scene.fog = fog;
  }
}
