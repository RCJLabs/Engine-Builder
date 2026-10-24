/**
 * The parts of a model drawn in the Scene panel (M5.5, D67, docs/specs/models.md#placing-and-drawing),
 * with three: a material record as three's material, its slots laid on a model's meshes, LOD levels
 * cut by meshoptimizer's simplifier, and the collider as a wire. Geometry and materials made here
 * are kept by what they are made from, so each placement of a model shares them.
 */
import { simplifyIndices } from '@eb/models/lod';
import { MATERIAL_DEFAULTS, type MaterialRecord, type ModelCollider, type ModelRecord } from '@eb/schema';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import * as THREE from 'three/webgpu';
import { meshesOf } from './meshes.ts';

/** The collider's wire, in the collider mark's colour (build.ts). */
const WIRE = '#3ecf8e';

/** A material record as three draws it. */
export function materialOf(record: MaterialRecord): THREE.MeshStandardMaterial {
  const m = { ...MATERIAL_DEFAULTS, ...record };
  const made = new THREE.MeshStandardMaterial({
    color: m.color,
    roughness: m.roughness,
    metalness: m.metalness,
    emissive: m.emissive,
    emissiveIntensity: m['emissive-strength'],
    opacity: m.opacity,
    transparent: m.opacity < 1,
  });
  made.name = record.name ?? '';
  return made;
}

/** A mesh's materials, one or many, as a list. */
export const materialsOf = (mesh: THREE.Mesh): THREE.Material[] =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material];

/**
 * Each mesh's material swapped for the one its slot is given, where it is given one. Each mesh
 * keeps its materials' slots in userData.slots, in order, so what is drawn can be read back by slot.
 */
export function laySlots(
  root: THREE.Object3D,
  slotOf: (material: THREE.Material) => string | undefined,
  given: (slot: string) => THREE.Material | undefined,
): void {
  for (const mesh of meshesOf(root)) {
    const slots = materialsOf(mesh).map(slotOf);
    const swapped = materialsOf(mesh).map((material, i) => {
      const slot = slots[i];
      return (slot === undefined ? undefined : given(slot)) ?? material;
    });
    mesh.material = Array.isArray(mesh.material) ? swapped : (swapped[0] as THREE.Material);
    mesh.userData.slots = slots;
  }
}

/** Positions as floats, read through three so quantised and interleaved ones come back as their values. */
function floatsOf(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Float32Array {
  const out = new Float32Array(attribute.count * 3);
  for (let i = 0; i < attribute.count; i++) {
    out[i * 3] = attribute.getX(i);
    out[i * 3 + 1] = attribute.getY(i);
    out[i * 3 + 2] = attribute.getZ(i);
  }
  return out;
}

/** A geometry's triangles cut to `ratio`, its vertices shared with the whole one. */
export function simplified(geometry: THREE.BufferGeometry, ratio: number): THREE.BufferGeometry {
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const indices = index
    ? Uint32Array.from(index.array as ArrayLike<number>)
    : Uint32Array.from({ length: positions.count }, (_, i) => i);
  const kept = simplifyIndices(indices, floatsOf(positions), 3, ratio);
  const made = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) made.setAttribute(name, attribute);
  made.setIndex(new THREE.BufferAttribute(kept, 1));
  made.boundingBox = geometry.boundingBox;
  made.boundingSphere = geometry.boundingSphere;
  return made;
}

/** Triangles a part of a model draws. */
export function trianglesOf(root: THREE.Object3D): number {
  let count = 0;
  for (const mesh of meshesOf(root)) {
    const index = mesh.geometry.getIndex();
    count += Math.floor((index ? index.count : mesh.geometry.getAttribute('position').count) / 3);
  }
  return count;
}

/**
 * The model's scene, or its LOD levels: each a copy of the scene with every geometry cut to the
 * level's ratio, drawn from its `from` metres. `cut` makes and keeps those geometries.
 */
export function withLevels(
  scene: THREE.Object3D,
  lod: ModelRecord['lod'],
  cut: (geometry: THREE.BufferGeometry, ratio: number) => THREE.BufferGeometry,
): THREE.Object3D {
  const whole = scene.clone(true);
  if (!lod || lod.length === 0) return whole;
  const levels = new THREE.LOD();
  levels.addLevel(whole, 0);
  for (const { ratio, from } of lod) {
    const level = scene.clone(true);
    for (const mesh of meshesOf(level)) mesh.geometry = cut(mesh.geometry, ratio);
    levels.addLevel(level, from);
  }
  return levels;
}

const vec = (v: readonly number[] | undefined, fallback: number) =>
  new THREE.Vector3(v?.[0] ?? fallback, v?.[1] ?? fallback, v?.[2] ?? fallback);

/** The collider's shape as a geometry around its centre, or null when its numbers can't make one (E072). */
export function colliderGeometry(collider: ModelCollider): THREE.BufferGeometry | null {
  const r = collider.radius ?? 0;
  if (collider.shape === 'box') {
    const size = vec(collider.size, 0);
    return size.x > 0 && size.y > 0 && size.z > 0 ? new THREE.BoxGeometry(size.x, size.y, size.z) : null;
  }
  if (collider.shape === 'sphere') return r > 0 ? new THREE.SphereGeometry(r, 16, 8) : null;
  if (collider.shape === 'capsule') {
    const h = collider.height ?? 0;
    return r > 0 && h >= 2 * r ? new THREE.CapsuleGeometry(r, h - 2 * r, 4, 12) : null;
  }
  const points = (collider.points ?? []).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  return points.length >= 4 ? new ConvexGeometry(points) : null;
}

/** The collider drawn as a wire where the model has it; never picked, so a click finds the model. */
export function colliderWire(collider: ModelCollider): THREE.Mesh | null {
  const geometry = colliderGeometry(collider);
  if (!geometry) return null;
  const wire = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: WIRE, wireframe: true }));
  if (collider.shape !== 'hull') wire.position.copy(vec(collider.center, 0));
  wire.raycast = () => {};
  wire.userData.colliderWire = true;
  return wire;
}
