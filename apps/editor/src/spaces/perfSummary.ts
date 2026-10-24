/**
 * The view's tier read back from three (M5.7, D69): what the overlay and window.__ebViewport.perf()
 * show, each setting as the renderer, the sun and the meshes hold it rather than as the tier asked.
 */
import type * as THREE from 'three/webgpu';
import type { FrameStats } from '../perf/frames.ts';
import type { TierSettings } from '../perf/tiers.ts';
import type { SkyKind } from './skyView.ts';
import type { PerfSummary } from './viewportHook.ts';

export interface PerfParts {
  readonly tier: TierSettings;
  readonly backend: PerfSummary['backend'];
  readonly renderer: THREE.WebGPURenderer;
  readonly sun: THREE.DirectionalLight;
  /** The placed objects, and the terrain's chunks. */
  readonly objects: THREE.Object3D | undefined;
  readonly ground: THREE.Object3D;
  readonly foliageShadows: boolean;
  readonly sky: SkyKind | null;
  readonly frames: FrameStats;
}

/** Whether any mesh under `root` has `has`. */
function anyMesh(root: THREE.Object3D | undefined, has: (mesh: THREE.Mesh) => boolean): boolean {
  let found = false;
  root?.traverse((part) => {
    found ||= (part as THREE.Mesh).isMesh === true && has(part as THREE.Mesh);
  });
  return found;
}

export function perfSummary(parts: PerfParts): PerfSummary {
  const { tier, renderer, sun } = parts;
  const shadows = renderer.shadowMap.enabled && sun.castShadow;
  return {
    tier: tier.name,
    backend: parts.backend,
    pixelRatio: renderer.getPixelRatio(),
    antialias: renderer.samples > 0,
    shadowMap: shadows ? sun.shadow.mapSize.x : 0,
    objectShadows: shadows && anyMesh(parts.objects, (mesh) => mesh.castShadow),
    groundShadows: shadows && anyMesh(parts.ground, (mesh) => mesh.receiveShadow),
    foliageShadows: shadows && parts.foliageShadows,
    shadowReach: shadows ? sun.shadow.camera.right : 0,
    sky: parts.sky,
    foliageReach: tier.foliageReach,
    foliageShare: tier.foliageShare,
    weatherShare: tier.weatherShare,
    frames: parts.frames,
    drawCalls: renderer.info.render.drawCalls,
    triangles: renderer.info.render.triangles,
  };
}
