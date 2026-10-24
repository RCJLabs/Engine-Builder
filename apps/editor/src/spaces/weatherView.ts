/**
 * Rain and snow in the view (M5.4, D66): rain as streaks, one line each, and snow as small flakes,
 * one mesh drawn many times, each placed where weather.ts says it is at the moment drawn. Both
 * are fogged, as anything far off is.
 */
import * as THREE from 'three/webgpu';
import type { Look, Vec3 } from '../environment/look.ts';
import { MOST } from '../environment/look.ts';
import { dropAt, type Falling, STREAK, seedDrops } from '../environment/weather.ts';

const FLAKE = 0.05;

export interface WeatherView {
  readonly root: THREE.Group;
  show(look: Look | null): void;
  /** Every drop where it is at `seconds`, around `centre`. */
  place(seconds: number, centre: Vec3): void;
  /** What falls, and how many, as the meshes hold them. */
  falling(): { readonly kind: Falling | null; readonly count: number };
  dispose(): void;
}

/** `share` of an environment's drops fall: a quality tier's (M5.7, D69), the first of the same seeded list. */
export function createWeatherView(share = 1): WeatherView {
  const root = new THREE.Group();
  const seeds = seedDrops(Math.max(MOST.rain, MOST.snow));
  const lines = new THREE.BufferGeometry();
  const ends = new Float32Array(MOST.rain * 6);
  lines.setAttribute('position', new THREE.BufferAttribute(ends, 3));
  const rainMaterial = new THREE.LineBasicMaterial({ color: '#b9c6d3', transparent: true, opacity: 0.55 });
  const rain = new THREE.LineSegments(lines, rainMaterial);
  const flake = new THREE.OctahedronGeometry(FLAKE, 0);
  const snowMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const snow = new THREE.InstancedMesh(flake, snowMaterial, MOST.snow);
  for (const mesh of [rain, snow]) {
    mesh.frustumCulled = false;
    mesh.visible = false;
    root.add(mesh);
  }
  let kind: Falling | null = null;
  let count = 0;
  const matrix = new THREE.Matrix4();

  return {
    root,
    show(look) {
      kind = look && look.weather !== 'none' ? look.weather : null;
      count = kind ? Math.floor((look?.particles ?? 0) * share) : 0;
      rain.visible = kind === 'rain' && count > 0;
      snow.visible = kind === 'snow' && count > 0;
      lines.setDrawRange(0, kind === 'rain' ? count * 2 : 0);
      snow.count = kind === 'snow' ? count : 0;
    },
    place(seconds, centre) {
      if (kind === 'rain') {
        for (let i = 0; i < count; i++) {
          const [x, y, z] = dropAt(seeds, i, 'rain', seconds, centre);
          ends.set([x, y, z, x, y - STREAK, z], i * 6);
        }
        (lines.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      } else if (kind === 'snow') {
        for (let i = 0; i < count; i++) {
          const [x, y, z] = dropAt(seeds, i, 'snow', seconds, centre);
          snow.setMatrixAt(i, matrix.makeTranslation(x, y, z));
        }
        snow.instanceMatrix.needsUpdate = true;
      }
    },
    falling: () => ({
      kind: rain.visible ? 'rain' : snow.visible ? 'snow' : null,
      count: rain.visible ? (lines.drawRange.count as number) / 2 : snow.visible ? snow.count : 0,
    }),
    dispose() {
      lines.dispose();
      rainMaterial.dispose();
      flake.dispose();
      snowMaterial.dispose();
      snow.dispose();
      root.clear();
    },
  };
}
