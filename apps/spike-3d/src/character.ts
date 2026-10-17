/**
 * One skinned character, made in code: a body of cylinders and a head, bound to a skeleton of
 * eleven bones and walked by sine waves. Ugly on purpose; what the spike measures is the GPU
 * skinning, which a real character from a glTF file would cost the same way.
 */
import * as THREE from 'three/webgpu';

/** Bones by name, each with its parent and its offset from it in the bind pose. */
const BONES: readonly [name: string, parent: string | null, x: number, y: number][] = [
  ['root', null, 0, 0],
  ['hips', 'root', 0, 1],
  ['spine', 'hips', 0, 0.3],
  ['chest', 'spine', 0, 0.35],
  ['head', 'chest', 0, 0.35],
  ['thigh-l', 'hips', -0.15, 0],
  ['shin-l', 'thigh-l', 0, -0.5],
  ['thigh-r', 'hips', 0.15, 0],
  ['shin-r', 'thigh-r', 0, -0.5],
  // Shoulders at the chest's height, 1.6, where the arms hang from.
  ['arm-l', 'chest', -0.36, -0.05],
  ['arm-r', 'chest', 0.36, -0.05],
];

export const BONE_NAMES = BONES.map(([name]) => name);

/** A body part: its geometry in bind-pose world space, and the bones it bends between. */
export interface Part {
  readonly geometry: THREE.BufferGeometry;
  /** The lower bone, the upper one, and the height where the bend between them is centred. */
  readonly lower: string;
  readonly upper: string;
  readonly bendAt: number;
}

const cylinder = (radius: number, from: number, to: number, x: number) =>
  new THREE.CylinderGeometry(radius, radius, to - from, 8, 6).translate(x, (from + to) / 2, 0);

export const PARTS: readonly Part[] = [
  { geometry: cylinder(0.24, 1, 1.72, 0), lower: 'spine', upper: 'chest', bendAt: 1.35 },
  { geometry: new THREE.SphereGeometry(0.17, 10, 8).translate(0, 1.92, 0), lower: 'head', upper: 'head', bendAt: 0 },
  { geometry: cylinder(0.09, 0, 1, -0.15), lower: 'shin-l', upper: 'thigh-l', bendAt: 0.5 },
  { geometry: cylinder(0.09, 0, 1, 0.15), lower: 'shin-r', upper: 'thigh-r', bendAt: 0.5 },
  { geometry: cylinder(0.065, 1.05, 1.6, -0.36), lower: 'arm-l', upper: 'arm-l', bendAt: 0 },
  { geometry: cylinder(0.065, 1.05, 1.6, 0.36), lower: 'arm-r', upper: 'arm-r', bendAt: 0 },
];

export interface Walker {
  readonly mesh: THREE.SkinnedMesh;
  /** Poses the skeleton for `seconds` into the walk. */
  pose(seconds: number): void;
}

export function walker(): Walker {
  const bones = new Map<string, THREE.Bone>();
  for (const [name, parent, x, y] of BONES) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(x, y, 0);
    bones.set(name, bone);
    if (parent) bones.get(parent)?.add(bone);
  }
  const order = BONE_NAMES;
  const geometry = skinnedGeometry(order);
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color: 0xd9643a, roughness: 0.6 }));
  const root = bones.get('root') as THREE.Bone;
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(order.map((name) => bones.get(name) as THREE.Bone)));
  mesh.castShadow = true;
  // The skinned bounds move every frame; one test against a fixed box is cheaper than refitting it.
  mesh.frustumCulled = false;
  const bone = (name: string) => bones.get(name) as THREE.Bone;
  return {
    mesh,
    pose(seconds) {
      const phase = seconds * Math.PI * 2 * 1.1;
      const swing = Math.sin(phase);
      bone('thigh-l').rotation.x = swing * 0.55;
      bone('thigh-r').rotation.x = -swing * 0.55;
      bone('shin-l').rotation.x = -Math.max(0, swing) * 0.9;
      bone('shin-r').rotation.x = -Math.max(0, -swing) * 0.9;
      bone('arm-l').rotation.x = -swing * 0.45;
      bone('arm-r').rotation.x = swing * 0.45;
      bone('hips').position.y = 1 + Math.abs(Math.cos(phase)) * 0.05;
    },
  };
}

function skinnedGeometry(order: readonly string[]): THREE.BufferGeometry {
  const flat = PARTS.map((part) => ({ part, geometry: part.geometry.toNonIndexed() }));
  const count = flat.reduce((sum, { geometry }) => sum + geometry.getAttribute('position').count, 0);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  let offset = 0;
  for (const { part, geometry } of flat) {
    const position = geometry.getAttribute('position');
    positions.set(position.array as Float32Array, offset * 3);
    normals.set(geometry.getAttribute('normal').array as Float32Array, offset * 3);
    for (let i = 0; i < position.count; i++) {
      const [lower, upper, w] = weightsOf(part, position.getY(i), order);
      skinIndex.set([lower, upper, 0, 0], (offset + i) * 4);
      skinWeight.set([1 - w, w, 0, 0], (offset + i) * 4);
    }
    offset += position.count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  return geometry;
}

/** The two bones a vertex follows and how much of the upper one, blended over 0.2 around the bend. */
export function weightsOf(part: Part, y: number, order: readonly string[]): [number, number, number] {
  const lower = order.indexOf(part.lower);
  const upper = order.indexOf(part.upper);
  if (lower < 0 || upper < 0) throw new Error(`No bone for ${part.lower} or ${part.upper}`);
  if (lower === upper) return [lower, upper, 0];
  const t = Math.min(1, Math.max(0, (y - (part.bendAt - 0.1)) / 0.2));
  return [lower, upper, t * t * (3 - 2 * t)];
}
