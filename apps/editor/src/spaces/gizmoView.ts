/**
 * The gizmo as three draws it (M5.1): arrows and squares to move, rings to turn, blocks to scale,
 * a metre long and scaled to stay one size on screen. Drawn over everything; the hit areas are
 * handles.ts's, measured on screen, so these are only what the eye goes by.
 */
import * as THREE from 'three/webgpu';
import { type Axis, type Handle, handleName, type Mode } from './gizmoMath.ts';
import { SHAPE } from './handles.ts';
import type { Quat, Vec3 } from './vec.ts';

const COLORS = ['#e5484d', '#46a758', '#3e63dd'] as const;
const LIT = '#ffd60a';
const CENTRE = '#d9dde3';
/** A shaft's or a ring's thickness, as a share of the gizmo's size. */
const THICK = 0.016;

/** Turns a shape made along y (a cylinder) or across z (a ring, a square) to lie along or across `axis`. */
function along(mesh: THREE.Object3D, axis: Axis, made: 'y' | 'z'): void {
  if (made === 'y') {
    if (axis === 0) mesh.rotation.z = -Math.PI / 2;
    if (axis === 2) mesh.rotation.x = Math.PI / 2;
    return;
  }
  if (axis === 0) mesh.rotation.y = Math.PI / 2;
  if (axis === 1) mesh.rotation.x = -Math.PI / 2;
}

const unitAxis = (axis: Axis, k: number): [number, number, number] => [
  axis === 0 ? k : 0,
  axis === 1 ? k : 0,
  axis === 2 ? k : 0,
];

export function createGizmo() {
  const group = new THREE.Group();
  const parts = new Map<string, { meshes: THREE.Mesh[]; color: string }>();
  const geometries: THREE.BufferGeometry[] = [];
  let lit: string | null = null;

  const add = (
    handle: Handle,
    geometry: THREE.BufferGeometry,
    color: string,
    at: Vec3,
    axis?: Axis,
    made?: 'y' | 'z',
  ) => {
    geometries.push(geometry);
    const material = new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(at[0], at[1], at[2]);
    if (axis !== undefined && made) along(mesh, axis, made);
    mesh.renderOrder = 10;
    group.add(mesh);
    const name = handleName(handle);
    const part = parts.get(name) ?? { meshes: [], color };
    part.meshes.push(mesh);
    parts.set(name, part);
  };

  const shaft = (handle: Handle, axis: Axis, from: number, to: number) =>
    add(
      handle,
      new THREE.CylinderGeometry(THICK, THICK, to - from, 8),
      COLORS[axis],
      unitAxis(axis, (from + to) / 2),
      axis,
      'y',
    );

  const draw = {
    move() {
      for (const axis of [0, 1, 2] as const) {
        const handle = { kind: 'move', axis } as const;
        shaft(handle, axis, SHAPE.arrowFrom, 0.84);
        add(handle, new THREE.ConeGeometry(0.06, 0.16, 16), COLORS[axis], unitAxis(axis, 0.92), axis, 'y');
        const [u, v] = [(axis + 1) % 3, (axis + 2) % 3] as [Axis, Axis];
        const corner = [0, 0, 0].map((_, i) => (i === u || i === v ? SHAPE.square : 0)) as unknown as Vec3;
        add({ kind: 'plane', axis }, new THREE.PlaneGeometry(0.16, 0.16), COLORS[axis], corner, axis, 'z');
      }
    },
    turn() {
      for (const axis of [0, 1, 2] as const) {
        add(
          { kind: 'turn', axis },
          new THREE.TorusGeometry(SHAPE.ring, THICK, 8, 96),
          COLORS[axis],
          [0, 0, 0],
          axis,
          'z',
        );
      }
    },
    scale() {
      for (const axis of [0, 1, 2] as const) {
        const handle = { kind: 'scale', axis } as const;
        shaft(handle, axis, 0.1, 0.93);
        add(handle, new THREE.BoxGeometry(0.12, 0.12, 0.12), COLORS[axis], unitAxis(axis, 1));
      }
      add({ kind: 'scale-all' }, new THREE.BoxGeometry(0.15, 0.15, 0.15), CENTRE, [0, 0, 0]);
    },
  };

  const clear = () => {
    for (const { meshes } of parts.values()) for (const mesh of meshes) (mesh.material as THREE.Material).dispose();
    for (const geometry of geometries) geometry.dispose();
    geometries.length = 0;
    parts.clear();
    group.clear();
  };

  return {
    group,
    show(mode: Mode): void {
      clear();
      draw[mode]();
      lit = null;
    },
    /** The handle drawn lit: the one under the mouse, or the one being dragged. */
    light(handle: Handle | null): boolean {
      const name = handle ? handleName(handle) : null;
      if (name === lit) return false;
      for (const [each, { meshes, color }] of parts) {
        for (const mesh of meshes) (mesh.material as THREE.MeshBasicMaterial).color.set(each === name ? LIT : color);
      }
      lit = name;
      return true;
    },
    place(pivot: Vec3, size: number, turn: Quat | null): void {
      group.position.set(pivot[0], pivot[1], pivot[2]);
      group.scale.setScalar(size);
      if (turn) group.quaternion.set(turn[0], turn[1], turn[2], turn[3]);
      else group.quaternion.identity();
    },
    dispose: clear,
  };
}
