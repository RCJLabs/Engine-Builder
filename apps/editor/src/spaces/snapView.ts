/**
 * Bounds snap in the view (M5.10, D72, docs/specs/streaming.md#snapping): each of the open file's
 * objects' boxes along the world's axes, as three draws them with the editor's marks, wires and
 * labels left out, and the box a drag has latched onto drawn as a wire in the accent colour.
 */
import * as THREE from 'three/webgpu';
import type { Box, Boxed, Latch } from './bounds.ts';

/** An object's box as drawn: its shapes' and models' meshes, not the marks (MeshBasicMaterial) or lights. */
export function boxOf(node: THREE.Object3D): Box | null {
  node.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  node.traverse((part) => {
    const mesh = part as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (material instanceof THREE.MeshBasicMaterial) return;
    // A model's levels sit one inside the other: the whole one is enough.
    if (mesh.parent instanceof THREE.LOD && mesh.parent.levels[0]?.object !== mesh) return;
    box.expandByObject(mesh);
  });
  if (box.isEmpty()) return null;
  const tidy = (v: number) => Math.round(v * 1e4) / 1e4 + 0;
  return {
    min: [tidy(box.min.x), tidy(box.min.y), tidy(box.min.z)],
    max: [tidy(box.max.x), tidy(box.max.y), tidy(box.max.z)],
  };
}

export function boxesOf(byId: ReadonlyMap<string, THREE.Object3D>): Boxed[] {
  return [...byId].flatMap(([id, node]) => {
    const box = boxOf(node);
    return box ? [{ id, box }] : [];
  });
}

/** The boxes a drag has latched onto, drawn as wires while it holds. */
export function createLatchWires(scene: THREE.Scene, color: string) {
  const group = new THREE.Group();
  scene.add(group);
  let shown: readonly Latch[] = [];
  const clear = () => {
    for (const child of [...group.children]) {
      group.remove(child);
      (child as THREE.Box3Helper).dispose();
    }
  };
  return {
    show(latches: readonly Latch[], boxes: readonly Boxed[]): void {
      clear();
      shown = latches;
      for (const id of new Set(latches.map((l) => l.to))) {
        const found = boxes.find((b) => b.id === id)?.box;
        if (!found) continue;
        const box = new THREE.Box3(new THREE.Vector3(...found.min), new THREE.Vector3(...found.max));
        group.add(new THREE.Box3Helper(box, new THREE.Color(color)));
      }
    },
    latched: () => shown,
    dispose() {
      clear();
      scene.remove(group);
    },
  };
}
