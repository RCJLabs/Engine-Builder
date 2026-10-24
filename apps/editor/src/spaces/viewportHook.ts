/**
 * What the e2e reads of the Scene panel's view (window.__ebViewport): where to take hold of each
 * handle and each object, in page pixels, and what the terrain, environment, models and foliage
 * draw. Set by the view as it starts and taken away with it.
 */
import type * as THREE from 'three/webgpu';
import type { FrameStats } from '../perf/frames.ts';
import type { TierName } from '../perf/tiers.ts';
import type { EnvironmentSummary } from './environmentView.ts';
import type { FoliageSummary } from './foliageView.ts';
import type { Screen } from './handles.ts';
import type { ModelSummary } from './modelsView.ts';
import type { Orbit } from './orbit.ts';
import type { SkyKind } from './skyView.ts';
import type { TerrainSummary } from './terrainView.ts';

/** The view's tier, its settings as three has them, and its frames (M5.7, D69): the overlay's too. */
export interface PerfSummary {
  readonly tier: TierName;
  readonly backend: 'webgpu' | 'webgl';
  readonly pixelRatio: number;
  readonly antialias: boolean;
  /** The sun's shadow map a side, or 0 for no shadows. */
  readonly shadowMap: number;
  readonly foliageShadows: boolean;
  /** The sky drawn, or null for the editor's own colour. */
  readonly sky: SkyKind | null;
  readonly foliageReach: number;
  readonly foliageShare: number;
  readonly weatherShare: number;
  /** Of the last frames drawn back to back. */
  readonly frames: FrameStats;
  /** Of the last frame drawn. */
  readonly drawCalls: number;
  readonly triangles: number;
}

export interface ViewportHook {
  readonly backend: 'webgpu' | 'webgl';
  readonly frames: number;
  readonly grips: () => { name: string; x: number; y: number; along: Screen }[];
  readonly objectAt: (id: string, underHandles?: boolean) => { x: number; y: number } | null;
  readonly camera: () => Orbit;
  /** The terrain's chunks, their levels and the widest seam (M5.3), or null with none. */
  readonly terrain: () => TerrainSummary | null;
  /** The ground at (x, z) in page pixels, when it is in sight: where to stroke. */
  readonly groundAt: (x: number, z: number) => { x: number; y: number } | null;
  /** The terrain's height and its four paint weights at the vertex nearest (x, z). */
  readonly heightAt: (x: number, z: number) => number | null;
  readonly paintAt: (x: number, z: number) => number[] | null;
  /** The opacity of the water an object draws, or null for none. */
  readonly waterAt: (id: string) => number | null;
  /** The sky, light, fog and weather drawn (M5.4), or null for the editor's own. */
  readonly environment: () => EnvironmentSummary | null;
  /** Each placed object drawn as a model (M5.5): its LOD level, triangles, collider and slots' colours. */
  readonly models: () => (ModelSummary & { readonly object: string })[];
  /** Each foliage type the terrain grows (M5.6): its plants, those drawn, and each chunk's level. */
  readonly foliage: () => FoliageSummary[];
  /** How many plants of a foliage type stand within `radius` metres of (x, z) across the ground. */
  readonly plantsNear: (foliage: string, x: number, z: number, radius: number) => number;
  /** The tier drawn and its frames (M5.7). */
  readonly perf: () => PerfSummary;
}

type Hooked = { __ebViewport?: ViewportHook };
const hooked = () => window as unknown as Hooked;

export const setHook = (hook: ViewportHook) => {
  hooked().__ebViewport = hook;
};

/** Takes the hook away, unless another view has set its own since. */
export const clearHook = (hook: ViewportHook) => {
  if (hooked().__ebViewport === hook) delete hooked().__ebViewport;
};

/** The opacity of the water an object draws, or null for none. */
export function waterOpacity(object: THREE.Object3D | undefined): number | null {
  let opacity: number | null = null;
  object?.traverse((part) => {
    const material = (part as THREE.Mesh).material;
    if (material && !Array.isArray(material) && material.userData.water) opacity = material.opacity;
  });
  return opacity;
}
