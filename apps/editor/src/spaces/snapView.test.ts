/**
 * An object's box as bounds snap measures it (M5.10, D72, docs/specs/streaming.md#snapping): its
 * shapes' and models' meshes, with the editor's marks (a collider's wire, a component's marker),
 * what is hidden and a model's coarser LOD levels left out.
 */
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { boxesOf, boxOf } from './snapView.ts';

const cube = (size: number, material: THREE.Material = new THREE.MeshStandardMaterial()) =>
  new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material);

describe('boxOf', () => {
  it('measures what is drawn, at its place, and leaves out the marks and what is hidden', () => {
    const node = new THREE.Group();
    node.position.set(10, 0, 0);
    node.add(cube(2));
    // A collider's wire and a trigger's marker, wider than the piece.
    node.add(cube(6, new THREE.MeshBasicMaterial({ wireframe: true })));
    const hidden = cube(8);
    hidden.visible = false;
    node.add(hidden);
    expect(boxOf(node)).toEqual({ min: [9, -1, -1], max: [11, 1, 1] });
  });

  it('measures a model with LOD by its whole level only', () => {
    const lod = new THREE.LOD();
    lod.addLevel(cube(2), 0);
    // A coarser level that bulges past the whole one, as a simplifier's can.
    lod.addLevel(cube(3), 60);
    const node = new THREE.Group();
    node.add(lod);
    expect(boxOf(node)).toEqual({ min: [-1, -1, -1], max: [1, 1, 1] });
  });

  it('has no box for an object drawn only as marks, and lists only the objects with one', () => {
    const marks = new THREE.Group();
    marks.add(cube(1, new THREE.MeshBasicMaterial()));
    expect(boxOf(marks)).toBeNull();
    const piece = new THREE.Group();
    piece.add(cube(2));
    expect(
      boxesOf(
        new Map([
          ['marks', marks],
          ['piece', piece],
        ]),
      ),
    ).toEqual([{ id: 'piece', box: { min: [-1, -1, -1], max: [1, 1, 1] } }]);
  });
});
