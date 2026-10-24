/**
 * Each primitive's triangles and vertices put in the order a GPU's vertex cache and Meshopt's
 * coder both like (M5.5, D67, docs/specs/models.md#import), with meshoptimizer's reorderMesh, as
 * gltfpack and gltf-transform's reorder() do. Vertices no triangle uses are dropped. A primitive
 * that shares an accessor with another, isn't triangles, or has no indices stays as it is: moving
 * its vertices would move another's.
 */
import { type Accessor, type Document, Primitive, Root } from '@gltf-transform/core';
import { MeshoptEncoder } from 'meshoptimizer/encoder';

const UNUSED = 0xffffffff;

/** The primitive's accessors when it alone holds each of them, or null. */
function ownAccessors(primitive: Primitive): Accessor[] | null {
  const indices = primitive.getIndices();
  if (!indices || primitive.getMode() !== Primitive.Mode.TRIANGLES || primitive.listTargets().length > 0) return null;
  const accessors = [indices, ...primitive.listAttributes()];
  const alone = (accessor: Accessor) =>
    new Set(accessor.listParents().filter((parent) => !(parent instanceof Root))).size === 1;
  return accessors.every(alone) && new Set(accessors).size === accessors.length ? accessors : null;
}

/** An attribute's elements moved to where `remap` puts them, `count` of them. */
function remapped(accessor: Accessor, remap: Uint32Array, count: number): void {
  const array = accessor.getArray();
  if (!array) return;
  const size = accessor.getElementSize();
  const out = new (array.constructor as new (length: number) => typeof array)(count * size);
  for (let i = 0; i < remap.length; i++) {
    const to = remap[i] as number;
    if (to === UNUSED) continue;
    for (let k = 0; k < size; k++) out[to * size + k] = array[i * size + k] as number;
  }
  accessor.setArray(out);
}

/** Reorders every primitive it can, in place. */
export async function reorder(doc: Document): Promise<void> {
  await MeshoptEncoder.ready;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const own = ownAccessors(primitive);
      if (!own) continue;
      const [indices, ...attributes] = own as [Accessor, ...Accessor[]];
      const order = Uint32Array.from(indices.getArray() as ArrayLike<number>);
      if (order.length === 0) continue;
      const [remap, unique] = MeshoptEncoder.reorderMesh(order, true, false);
      for (const attribute of attributes) remapped(attribute, remap, unique);
      const type = unique > 65535 ? Uint32Array : Uint16Array;
      indices.setArray(type.from(order));
    }
  }
}
