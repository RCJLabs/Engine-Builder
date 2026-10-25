/**
 * The walk's fog (M5.10, D72, docs/specs/streaming.md#building): it closes at the tier's view
 * distance, so the far objects' edge is never seen, unless the space's environment has its own fog
 * that closes nearer, which is kept as it is.
 */
import * as THREE from 'three/webgpu';

/** A game's sky when its space names no environment: daylight, not the editor's dark. */
export const DAYLIGHT = '#a9c6db';
/** Where the view's own fog starts, as a share of the view distance. */
export const FOG_FROM = 0.6;

export function closeFog(scene: THREE.Scene, distance: number): void {
  const own = scene.fog instanceof THREE.Fog ? scene.fog : null;
  if (own && own.far <= distance) return;
  const sky = scene.background instanceof THREE.Color ? scene.background : new THREE.Color(DAYLIGHT);
  const color = own ? own.color : sky;
  scene.fog = new THREE.Fog(color, Math.min(own?.near ?? Number.POSITIVE_INFINITY, distance * FOG_FROM), distance);
}
