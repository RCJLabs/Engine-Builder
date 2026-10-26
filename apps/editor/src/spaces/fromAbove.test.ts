/**
 * What Bake map hides (M6.6, D78, docs/specs/markers.md#baking): the scene's children it doesn't
 * keep (the grid, the gizmo), and inside those it keeps the editor's marks, zones and characters, and
 * the roofs: meshes wholly above the shot's height for them, where they stand.
 */
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { OFF_MAP } from './build.ts';
import { leftOut } from './fromAbove.ts';

function room() {
  const scene = new THREE.Scene();
  const grid = new THREE.Group();
  grid.name = 'grid';
  const space = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const wall = new THREE.Mesh(box);
  wall.name = 'wall';
  wall.scale.set(4, 2.5, 0.2);
  wall.position.y = 1.25;
  const roof = new THREE.Mesh(box);
  roof.name = 'roof';
  roof.scale.set(4, 0.2, 4);
  roof.position.y = 2.6;
  const mark = new THREE.Mesh(box);
  mark.name = 'mark';
  mark.userData[OFF_MAP] = true;
  wall.add(mark);
  space.add(wall, roof);
  scene.add(grid, space);
  return { scene, grid, space, wall, roof, mark };
}

const names = (nodes: readonly THREE.Object3D[]) => nodes.map((node) => node.name);

describe('what a bake hides', () => {
  it('the children not kept, the marks, and meshes wholly above the roofs', () => {
    const { scene, space } = room();
    expect(names(leftOut(scene, new Set([space]), 2.4))).toEqual(['grid', 'mark', 'roof']);
  });

  it('no roofs without a height for them, and nothing already hidden', () => {
    const { scene, grid, space } = room();
    grid.visible = false;
    expect(names(leftOut(scene, new Set([space]), undefined))).toEqual(['mark']);
  });

  it('a mesh by where it stands: the roof lowered under the line stays', () => {
    const { scene, space, roof } = room();
    roof.position.y = 2.3;
    expect(names(leftOut(scene, new Set([space]), 2.4))).toEqual(['grid', 'mark']);
  });
});
