/**
 * The scene a tier draws: the terrain mesh, 5,000 instanced trees, a sun with shadows, sky and
 * fog. Everything is made in code from the heightmap and the placements, so the spike ships
 * no asset files and nothing to licence.
 */
import * as THREE from 'three/webgpu';
import { extentOf, type Heightmap, PEAK } from './heightmap.ts';
import type { Placement } from './props.ts';
import type { Tier } from './tiers.ts';

const SKY = 0x9fc4e8;

export function terrainMesh(map: Heightmap): THREE.Mesh {
  const { size, spacing, heights } = map;
  const extent = extentOf(map);
  const positions = new Float32Array(size * size * 3);
  const colors = new Float32Array(size * size * 3);
  const color = new THREE.Color();
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = z * size + x;
      const h = heights[i] as number;
      positions.set([x * spacing - extent, h, z * spacing - extent], i * 3);
      groundColor(h / PEAK, color);
      colors.set([color.r, color.g, color.b], i * 3);
    }
  }
  const index: number[] = [];
  for (let z = 0; z < size - 1; z++) {
    for (let x = 0; x < size - 1; x++) {
      const a = z * size + x;
      // Counter-clockwise seen from above, so the faces point up.
      index.push(a, a + size, a + 1, a + 1, a + size, a + size + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.receiveShadow = true;
  return mesh;
}

// Sand, grass, rock and snow, blended by height.
const BANDS: readonly [number, number][] = [
  [0, 0xc8b88a],
  [0.06, 0x5b8a3c],
  [0.45, 0x47702f],
  [0.65, 0x7d746b],
  [0.85, 0xf2f2f2],
];

function groundColor(t: number, out: THREE.Color): void {
  const upper = BANDS.findIndex(([at]) => at > t);
  if (upper <= 0) {
    out.setHex((upper === 0 ? BANDS[0] : BANDS[BANDS.length - 1])?.[1] ?? 0);
    return;
  }
  const [lowAt, lowHex] = BANDS[upper - 1] as [number, number];
  const [highAt, highHex] = BANDS[upper] as [number, number];
  out.setHex(lowHex).lerp(new THREE.Color(highHex), (t - lowAt) / (highAt - lowAt));
}

/** One tree as one geometry, trunk and crown, coloured per vertex so all 5,000 share a material. */
export function treeGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6).translate(0, 0.7, 0);
  const crown = new THREE.ConeGeometry(1.1, 3, 7).translate(0, 2.7, 0);
  return mergeColoured([
    [trunk, 0x6b4a2b],
    [crown, 0x2f6b34],
  ]);
}

function mergeColoured(parts: readonly [THREE.BufferGeometry, number][]): THREE.BufferGeometry {
  const flat = parts.map(([geometry, hex]) => [geometry.toNonIndexed(), new THREE.Color(hex)] as const);
  const count = flat.reduce((sum, [g]) => sum + g.getAttribute('position').count, 0);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let offset = 0;
  for (const [geometry, color] of flat) {
    const position = geometry.getAttribute('position');
    positions.set(position.array as Float32Array, offset * 3);
    normals.set(geometry.getAttribute('normal').array as Float32Array, offset * 3);
    for (let i = 0; i < position.count; i++) colors.set([color.r, color.g, color.b], (offset + i) * 3);
    offset += position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return merged;
}

export function forest(placements: readonly Placement[]): THREE.InstancedMesh {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const mesh = new THREE.InstancedMesh(treeGeometry(), material, placements.length);
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [i, p] of placements.entries()) {
    turn.setFromAxisAngle(up, p.turn);
    matrix.compose(new THREE.Vector3(p.x, p.y, p.z), turn, new THREE.Vector3(p.scale, p.scale, p.scale));
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  // Culled as one: the bounds of every instance, so the forest isn't dropped when its centre is behind the camera.
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface World {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
}

export function world(map: Heightmap, placements: readonly Placement[], tier: Tier, aspect: number): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 90, 380);
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x4a4030, 0.9));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.castShadow = tier.shadowMap > 0;
  if (sun.castShadow) {
    sun.shadow.mapSize.set(tier.shadowMap, tier.shadowMap);
    // A box that follows the character: shadows where the camera looks, at a texel size the map can afford.
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 320 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
  }
  scene.add(sun, sun.target);
  scene.add(terrainMesh(map), forest(placements));
  const camera = new THREE.PerspectiveCamera(55, aspect, 0.5, 420);
  return { scene, camera, sun };
}
