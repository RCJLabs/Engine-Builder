/**
 * The renderer and the frame loop. three's WebGPURenderer uses WebGPU where the browser has it
 * and its own WebGL2 backend otherwise; `forceWebGL` asks for WebGL2 on purpose, to compare.
 */
import * as THREE from 'three/webgpu';
import { walker } from './character.ts';
import type { Heightmap } from './heightmap.ts';
import { cameraAt, walkerAt } from './motion.ts';
import type { Backend } from './plan.ts';
import type { Placement } from './props.ts';
import { world } from './scene.ts';
import { pixelRatioFor, type Tier } from './tiers.ts';

export interface View {
  /** The backend the renderer runs on, whatever was asked for. */
  readonly backend: Backend;
  /** Device pixels drawn, as width×height. */
  canvasSize(): string;
  /** Draw calls and triangles in the last frame, where the backend counts them. */
  counts(): { readonly calls: number; readonly triangles: number };
  /** Starts drawing; `onFrame` hears each frame's timestamp after it is drawn. */
  start(onFrame: (now: number) => void): void;
}

export async function createView(
  canvas: HTMLCanvasElement,
  input: { readonly map: Heightmap; readonly placements: readonly Placement[]; readonly tier: Tier },
  ask: Backend | 'auto',
): Promise<View> {
  const { map, placements, tier } = input;
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: tier.antialias, forceWebGL: ask === 'webgl' });
  await renderer.init();
  const backend: Backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl';
  renderer.shadowMap.enabled = tier.shadowMap > 0;
  renderer.shadowMap.type = tier.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  const { scene, camera, sun } = world(map, placements, tier, 1);
  const figure = walker();
  scene.add(figure.mesh);

  const resize = () => {
    renderer.setPixelRatio(pixelRatioFor(tier, window.devicePixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  return {
    backend,
    canvasSize: () => `${canvas.width}×${canvas.height}`,
    counts: () => ({ calls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles }),
    start(onFrame) {
      let first: number | null = null;
      renderer.setAnimationLoop((now: number) => {
        first ??= now;
        const seconds = (now - first) / 1000;
        const at = walkerAt(map, seconds);
        figure.mesh.position.set(at.x, at.y, at.z);
        figure.mesh.rotation.y = at.heading;
        figure.pose(seconds);
        const eye = cameraAt(map, seconds, at);
        camera.position.set(eye.x, eye.y, eye.z);
        camera.lookAt(at.x, at.y + 1.4, at.z);
        sun.position.set(at.x + 60, at.y + 110, at.z + 35);
        sun.target.position.set(at.x, at.y, at.z);
        renderer.render(scene, camera);
        onFrame(now);
      });
    },
  };
}
