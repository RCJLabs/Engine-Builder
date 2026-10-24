/**
 * The vertex-cache reorder packing does first (M5.5, D67): vertices come in the order triangles
 * first use them, those no triangle uses are gone, every triangle keeps its corners, and a
 * primitive sharing its vertices with another is left alone.
 */
import { Document, type Primitive } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { gridArrays } from '../test/shapes.ts';
import { reorder } from './reorder.ts';

/** The grid with its triangles shuffled by a fixed walk and one vertex no triangle uses at the end. */
function shuffledGrid(doc: Document): Primitive {
  const { positions, indices } = gridArrays(9);
  const triangles = indices.length / 3;
  const order = Array.from({ length: triangles }, (_, t) => (t * 37) % triangles);
  const shuffled = Uint32Array.from(order.flatMap((t) => [...indices.subarray(t * 3, t * 3 + 3)]));
  const extra = Float32Array.from([...positions, 9, 9, 9]);
  const buffer = doc.createBuffer();
  return doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(extra).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(shuffled).setBuffer(buffer));
}

const corners = (primitive: Primitive): string[] => {
  const positions = primitive.getAttribute('POSITION');
  const indices = primitive.getIndices();
  const v = [0, 0, 0];
  const out: string[] = [];
  for (let i = 0; i < (indices?.getCount() ?? 0); i += 3) {
    const triangle = [0, 1, 2].map((k) => positions?.getElement(indices?.getScalar(i + k) ?? 0, v).join());
    const first = triangle.indexOf([...triangle].sort()[0] as string);
    out.push([0, 1, 2].map((k) => triangle[(first + k) % 3]).join('|'));
  }
  return out.sort();
};

describe('reordering for the vertex cache', () => {
  it('puts vertices in the order triangles first use them, dropping unused ones', async () => {
    const doc = new Document();
    const primitive = shuffledGrid(doc);
    doc.createMesh().addPrimitive(primitive);
    await reorder(doc);
    const seen: number[] = [];
    const indices = primitive.getIndices();
    for (let i = 0; i < (indices?.getCount() ?? 0); i++) {
      const index = indices?.getScalar(i) ?? -1;
      if (!seen.includes(index)) seen.push(index);
    }
    expect(seen).toEqual(seen.map((_, i) => i));
    expect(primitive.getAttribute('POSITION')?.getCount()).toBe(81);
  });

  it('keeps every triangle and its winding', async () => {
    const doc = new Document();
    const primitive = shuffledGrid(doc);
    doc.createMesh().addPrimitive(primitive);
    const before = corners(primitive);
    await reorder(doc);
    expect(corners(primitive)).toEqual(before);
  });

  it('leaves a primitive alone that shares its vertices with another', async () => {
    const doc = new Document();
    const primitive = shuffledGrid(doc);
    const twin = doc.createPrimitive().setAttribute('POSITION', primitive.getAttribute('POSITION'));
    twin.setIndices(primitive.getIndices());
    doc.createMesh().addPrimitive(primitive).addPrimitive(twin);
    const before = [...(primitive.getIndices()?.getArray() ?? [])];
    await reorder(doc);
    expect([...(primitive.getIndices()?.getArray() ?? [])]).toEqual(before);
    expect(primitive.getAttribute('POSITION')?.getCount()).toBe(82);
  });
});
