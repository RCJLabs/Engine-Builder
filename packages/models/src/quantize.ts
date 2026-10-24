/**
 * Quantising a model's geometry before Meshopt packs it (M5.5, D67, docs/specs/models.md#import),
 * as KHR_mesh_quantization allows: each mesh's positions as 16-bit integers inside its bounds, its
 * texture coordinates as 16-bit when they stay within 0 to 1. Normals are left to Meshopt's
 * octahedral filter. A mesh's bounds come back through a node of its own beneath each node that
 * draws it, its translation the bounds' centre and its scale their largest half, so no other
 * node's transform changes (as gltfpack does). Skinned meshes and meshes with morph targets stay
 * as they are: a skin ignores the node's transform, and a target is relative to the base.
 */
import { Accessor, type Document, type Mesh, type Node } from '@gltf-transform/core';

const Q16 = 32767;
const U16 = 65535;

/** The bounds of every position a mesh draws, or null when one isn't of floats. */
function boundsOf(mesh: Mesh): { min: number[]; max: number[] } | null {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const primitive of mesh.listPrimitives()) {
    const positions = primitive.getAttribute('POSITION');
    if (!positions || positions.getComponentType() !== Accessor.ComponentType.FLOAT) return null;
    const array = positions.getArray() as Float32Array;
    for (let i = 0; i < array.length; i++) {
      const c = i % 3;
      if ((array[i] as number) < (min[c] as number)) min[c] = array[i] as number;
      if ((array[i] as number) > (max[c] as number)) max[c] = array[i] as number;
    }
  }
  return min[0] === Infinity ? null : { min, max };
}

/** Whether a mesh can be quantised: no morph targets, and no node that draws it is skinned. */
function quantisable(mesh: Mesh, users: readonly Node[]): boolean {
  if (mesh.listPrimitives().some((p) => p.listTargets().length > 0)) return false;
  return users.every((node) => node.getSkin() === null);
}

/** A float accessor's values as 16-bit integers: `scale` is what 1 becomes, `offset` is taken first. */
function toInt16(doc: Document, from: Accessor, offset: readonly number[], scale: number): Accessor {
  const source = from.getArray() as Float32Array;
  const size = from.getElementSize();
  const out = new Int16Array(source.length);
  for (let i = 0; i < source.length; i++) {
    const value = Math.round((((source[i] as number) - (offset[i % size] as number)) / scale) * Q16);
    out[i] = Math.max(-Q16, Math.min(Q16, value));
  }
  return doc.createAccessor().setType(from.getType()).setArray(out).setNormalized(true).setBuffer(from.getBuffer());
}

function quantiseMesh(doc: Document, mesh: Mesh, users: readonly Node[]): void {
  const bounds = boundsOf(mesh);
  if (!bounds) return;
  const center = [0, 1, 2].map((c) => ((bounds.min[c] as number) + (bounds.max[c] as number)) / 2);
  const half = Math.max(...[0, 1, 2].map((c) => ((bounds.max[c] as number) - (bounds.min[c] as number)) / 2));
  const scale = half > 0 ? half : 1;
  const made = new Map<Accessor, Accessor>();
  for (const primitive of mesh.listPrimitives()) {
    const positions = primitive.getAttribute('POSITION') as Accessor;
    const q = made.get(positions) ?? toInt16(doc, positions, center, scale);
    made.set(positions, q);
    primitive.setAttribute('POSITION', q);
  }
  for (const node of users) {
    const holder = doc
      .createNode(node.getName())
      .setMesh(mesh)
      .setTranslation(center as [number, number, number])
      .setScale([scale, scale, scale]);
    node.setMesh(null).addChild(holder);
  }
}

/** Texture coordinates within 0 to 1 as 16-bit; others stay floats. */
function quantiseCoordinates(doc: Document): void {
  const made = new Map<Accessor, Accessor | null>();
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) {
        if (!semantic.startsWith('TEXCOORD_')) continue;
        const from = primitive.getAttribute(semantic) as Accessor;
        if (!made.has(from)) made.set(from, coordinates(doc, from));
        const to = made.get(from);
        if (to) primitive.setAttribute(semantic, to);
      }
    }
  }
}

function coordinates(doc: Document, from: Accessor): Accessor | null {
  if (from.getComponentType() !== Accessor.ComponentType.FLOAT) return null;
  const source = from.getArray() as Float32Array;
  if (source.some((v) => v < 0 || v > 1)) return null;
  const out = new Uint16Array(source.length);
  for (let i = 0; i < source.length; i++) out[i] = Math.round((source[i] as number) * U16);
  return doc.createAccessor().setType(from.getType()).setArray(out).setNormalized(true).setBuffer(from.getBuffer());
}

/** Quantises every mesh it can, in place. */
export function quantize(doc: Document): void {
  const users = new Map<Mesh, Node[]>();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (mesh) users.set(mesh, [...(users.get(mesh) ?? []), node]);
  }
  for (const [mesh, nodes] of users) if (quantisable(mesh, nodes)) quantiseMesh(doc, mesh, nodes);
  quantiseCoordinates(doc);
  for (const accessor of doc.getRoot().listAccessors()) {
    // Accessors only the root holds: the floats each quantised one replaced.
    if (accessor.listParents().length === 1) accessor.dispose();
  }
}
