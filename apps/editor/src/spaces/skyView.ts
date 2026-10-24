/**
 * An environment's sky in the view (M5.4, D66, docs/specs/environments.md#the-sky): three's
 * physical sky (SkyMesh, the Preetham model, for WebGPURenderer), a gradient sphere with the sun's
 * disc, or the view's background in one colour. It is never fogged, and it follows the camera, so
 * it is always the farthest thing drawn.
 */
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { acesFilmicToneMapping, float, type vec3, vec4 } from 'three/tsl';
import * as THREE from 'three/webgpu';
import { type Look, mixColour } from '../environment/look.ts';

/** Inside the camera's far plane (2,000 m), so it is drawn; first, and writing no depth, so behind everything. */
const RADIUS = 1800;
/** The physical sky's light through ACES, at the exposure three's own SkyMesh example gives its renderer. */
const EXPOSURE = 0.5;
/** The sun's disc: about two degrees across, as a sun drawn for a game is, larger than the real one. */
const DISC = RADIUS * 0.018;

export type SkyKind = Look['sky'];

export interface SkyView {
  readonly root: THREE.Group;
  show(look: Look | null): void;
  /** The sky centred on the camera, and the sun's disc turned to face it. */
  follow(camera: THREE.Camera): void;
  /** The sky drawn, or null for the editor's own background. */
  kind(): SkyKind | null;
  dispose(): void;
}

/** A gradient's colour at height `y` (−1 to 1): ground below the horizon, rising to zenith overhead. */
export function gradientAt(look: Pick<Look, 'zenith' | 'horizon' | 'ground'>, y: number): string {
  return y >= 0
    ? mixColour(look.horizon, look.zenith, Math.sqrt(y))
    : mixColour(look.horizon, look.ground, Math.min(1, -y * 6));
}

export function createSkyView(scene: THREE.Scene, editorBackground: THREE.Color): SkyView {
  const root = new THREE.Group();
  let physical: SkyMesh | null = null;
  let shown: SkyKind | null = null;
  const unlit = () =>
    new THREE.MeshBasicMaterial({ fog: false, depthWrite: false, depthTest: false, side: THREE.BackSide });
  const sphere = new THREE.SphereGeometry(RADIUS, 48, 24);
  sphere.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array(sphere.getAttribute('position').count * 3), 3),
  );
  const gradientMaterial = unlit();
  gradientMaterial.vertexColors = true;
  const gradient = new THREE.Mesh(sphere, gradientMaterial);
  const discMaterial = unlit();
  discMaterial.side = THREE.FrontSide;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(DISC, 32), discMaterial);
  let sunAt = new THREE.Vector3(0, 1, 0);
  for (const [mesh, order] of [
    [gradient, -3],
    [disc, -2],
  ] as const) {
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    root.add(mesh);
  }

  const physicalSky = () => {
    if (physical) return physical;
    physical = new SkyMesh();
    physical.scale.setScalar(RADIUS);
    physical.cloudCoverage.value = 0;
    physical.renderOrder = -3;
    physical.frustumCulled = false;
    const raw = physical.material.colorNode as unknown as ReturnType<typeof vec4>;
    const toned = acesFilmicToneMapping(raw.xyz, float(EXPOSURE)) as unknown as ReturnType<typeof vec3>;
    physical.material.colorNode = vec4(toned, float(1));
    root.add(physical);
    return physical;
  };

  const paintGradient = (look: Look) => {
    const at = sphere.attributes.position as THREE.BufferAttribute;
    const colours = sphere.attributes.color as THREE.BufferAttribute;
    const colour = new THREE.Color();
    for (let i = 0; i < at.count; i++) {
      colour.set(gradientAt(look, at.getY(i) / RADIUS));
      colours.setXYZ(i, colour.r, colour.g, colour.b);
    }
    colours.needsUpdate = true;
    discMaterial.color.set(look.sun.color);
  };

  return {
    root,
    show(look) {
      shown = look?.sky ?? null;
      sunAt = new THREE.Vector3(...(look?.sun.direction ?? [0, 1, 0]));
      if (physical) physical.visible = shown === 'physical';
      gradient.visible = shown === 'gradient';
      disc.visible = shown === 'gradient' && look !== null && look.sun.height > 0 && look.sun.strength > 0;
      scene.background = look ? new THREE.Color(shown === 'colour' ? look.zenith : look.horizon) : editorBackground;
      if (!look) return;
      if (shown === 'physical') {
        const sky = physicalSky();
        sky.turbidity.value = look.turbidity;
        sky.sunPosition.value.copy(sunAt);
      }
      if (shown === 'gradient') paintGradient(look);
    },
    follow(camera) {
      physical?.position.copy(camera.position);
      gradient.position.copy(camera.position);
      disc.position.copy(camera.position).addScaledVector(sunAt, RADIUS * 0.95);
      disc.lookAt(camera.position);
    },
    kind: () => shown,
    dispose() {
      physical?.geometry.dispose();
      physical?.material.dispose();
      sphere.dispose();
      gradientMaterial.dispose();
      disc.geometry.dispose();
      discMaterial.dispose();
      root.clear();
    },
  };
}
