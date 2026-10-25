/**
 * Show navigation (M6.2, D74, docs/specs/navigation.md#the-editor): the navmesh drawn over the
 * Scene view as a see-through green skin with its edges, a little above the ground so it isn't lost
 * in it. What it draws, the hook reads back from three.
 */
import * as THREE from 'three/webgpu';
import type { NavLook } from '../nav/protocol.ts';

const LIFT = 0.05;

export function createNavOverlay(scene: THREE.Scene, draw: () => void) {
  const root = new THREE.Group();
  root.position.y = LIFT;
  root.renderOrder = 2;
  scene.add(root);
  let drawn: { tiles: number; polygons: number } | null = null;
  const clear = () => {
    for (const child of [...root.children]) {
      root.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  };
  return {
    show(look: NavLook | null): void {
      clear();
      drawn = null;
      if (look && look.indices.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(look.positions, 3));
        geometry.setIndex(look.indices);
        const skin = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({ color: '#2fbf71', transparent: true, opacity: 0.35, depthWrite: false }),
        );
        const edges = new THREE.LineSegments(
          new THREE.WireframeGeometry(geometry),
          new THREE.LineBasicMaterial({ color: '#1b7a47' }),
        );
        root.add(skin, edges);
        drawn = { tiles: look.tiles, polygons: look.polygons };
      }
      draw();
    },
    /** What three draws now: the skin's triangles and the navmesh's counts, or null. */
    summary(): { triangles: number; tiles: number; polygons: number } | null {
      const skin = root.children[0] as THREE.Mesh | undefined;
      if (!skin || !drawn) return null;
      return { triangles: (skin.geometry.index?.count ?? 0) / 3, ...drawn };
    },
    dispose: clear,
  };
}
