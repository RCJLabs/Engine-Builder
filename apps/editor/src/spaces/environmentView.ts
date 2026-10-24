/**
 * A space's environment in the view (M5.4, D66, docs/specs/environments.md#the-editor): its sky
 * (skyView.ts), the sun's and the sky's light, fog, and rain or snow (weatherView.ts). It takes
 * over the editor's two lights and its background while the space has one, and gives them back as
 * they were when it has none. The numbers are look.ts's; this hands them to three, and reads them
 * back from three for the e2e, so what it reports is what is drawn.
 */
import * as THREE from 'three/webgpu';
import type { Look, Vec3 } from '../environment/look.ts';
import { createSkyView, type SkyKind } from './skyView.ts';
import { createWeatherView } from './weatherView.ts';

/** How far off the sun light is put, along its direction from the space's origin. */
const SUN_AWAY = 50;

export interface EnvironmentSummary {
  readonly sky: SkyKind;
  /** A physical sky's haze, as its shader has it; null for any other sky. */
  readonly turbidity: number | null;
  readonly sun: { readonly direction: Vec3; readonly strength: number; readonly color: string };
  readonly skyLight: { readonly strength: number; readonly color: string };
  readonly fog: { readonly color: string; readonly near: number; readonly far: number } | null;
  readonly weather: 'rain' | 'snow' | 'none';
  readonly particles: number;
  /** Whether the view draws every frame, for falling weather. */
  readonly animating: boolean;
}

export interface EnvironmentView {
  show(look: Look | null): void;
  /** Before each frame: the sky round the camera, the weather where it looks at this moment. */
  frame(camera: THREE.Camera, target: Vec3, now: number): void;
  animating(): boolean;
  summary(): EnvironmentSummary | null;
  dispose(): void;
}

interface Lights {
  readonly sky: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
}

const stillAsked = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
const round = (n: number) => Math.round(n * 1e4) / 1e4;

export function createEnvironmentView(scene: THREE.Scene, lights: Lights): EnvironmentView {
  const editor = {
    background: (scene.background as THREE.Color).clone(),
    sky: { color: lights.sky.color.clone(), ground: lights.sky.groundColor.clone(), strength: lights.sky.intensity },
    sun: { color: lights.sun.color.clone(), strength: lights.sun.intensity, at: lights.sun.position.clone() },
  };
  const sky = createSkyView(scene, editor.background);
  const weather = createWeatherView();
  scene.add(sky.root, weather.root);
  let look: Look | null = null;
  let still = false;
  let since = 0;

  const light = (next: Look | null) => {
    lights.sky.color.copy(next ? new THREE.Color(next.skyLight.color) : editor.sky.color);
    lights.sky.groundColor.copy(next ? new THREE.Color(next.ground) : editor.sky.ground);
    lights.sky.intensity = next ? next.skyLight.strength : editor.sky.strength;
    lights.sun.color.copy(next ? new THREE.Color(next.sun.color) : editor.sun.color);
    lights.sun.intensity = next ? next.sun.strength : editor.sun.strength;
    if (next) lights.sun.position.set(...next.sun.direction).multiplyScalar(SUN_AWAY);
    else lights.sun.position.copy(editor.sun.at);
    lights.sun.visible = lights.sun.intensity > 0;
  };

  return {
    show(next) {
      look = next;
      still = stillAsked();
      since = performance.now();
      sky.show(next);
      weather.show(next);
      light(next);
      scene.fog = next?.fog ? new THREE.Fog(next.fog.color, next.fog.near, next.fog.far) : null;
    },
    frame(camera, target, now) {
      sky.follow(camera);
      weather.place(still ? 0 : (now - since) / 1000, target);
    },
    animating: () => !still && weather.falling().count > 0,
    summary() {
      const kind = sky.kind();
      if (!look || !kind) return null;
      const fog = scene.fog instanceof THREE.Fog ? scene.fog : null;
      const sunAt = lights.sun.position.clone().normalize();
      const falling = weather.falling();
      return {
        sky: kind,
        turbidity: sky.turbidity(),
        sun: {
          direction: [round(sunAt.x), round(sunAt.y), round(sunAt.z)],
          strength: lights.sun.visible ? round(lights.sun.intensity) : 0,
          color: `#${lights.sun.color.getHexString()}`,
        },
        skyLight: { strength: round(lights.sky.intensity), color: `#${lights.sky.color.getHexString()}` },
        fog: fog ? { color: `#${fog.color.getHexString()}`, near: fog.near, far: fog.far } : null,
        weather: falling.kind ?? 'none',
        particles: falling.count,
        animating: !still && falling.count > 0,
      };
    },
    dispose() {
      scene.fog = null;
      sky.dispose();
      weather.dispose();
    },
  };
}
