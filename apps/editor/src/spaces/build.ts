/**
 * A space or prefab as three objects (M5.1): one per object of the file, each standing where its
 * file puts it, a placed prefab a group of the prefab's own objects. Geometry is shared by shape
 * and materials by colour, so building a space again after an edit costs little.
 */
import * as THREE from 'three/webgpu';
import type { Transform } from './gizmoMath.ts';
import { GREY, type SpaceJson, type SpaceObject, transformOf } from './spaceFile.ts';

/** How deep placements inside placements are drawn: a loop (E061) stops here. */
const DEEPEST = 8;
/** What a placement of a prefab prefabs/ lacks draws as: a red frame a metre across. */
const MISSING = '#e5484d';

const RAD = Math.PI / 180;

export interface Built {
  /** The file's objects, in order, each with its id in userData.objectId. */
  readonly root: THREE.Group;
  readonly byId: ReadonlyMap<string, THREE.Object3D>;
  dispose(): void;
}

function shapes(): Record<'box' | 'sphere' | 'cylinder' | 'plane', THREE.BufferGeometry> {
  return {
    box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    sphere: new THREE.SphereGeometry(0.5, 32, 16).translate(0, 0.5, 0),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 32).translate(0, 0.5, 0),
    plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  };
}

/** Sets an object's place, turn and scale as its file gives them. */
export function setTransform(target: THREE.Object3D, t: Transform): void {
  target.position.set(t.at[0], t.at[1], t.at[2]);
  target.rotation.set(t.turn[0] * RAD, t.turn[1] * RAD, t.turn[2] * RAD, 'YXZ');
  target.scale.set(t.scale[0], t.scale[1], t.scale[2]);
}

export function createBuilder() {
  const geometry = shapes();
  const missing = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const materials = new Map<string, THREE.Material>();
  const material = (color: string, plane: boolean) => {
    const key = `${color}${plane ? ':both' : ''}`;
    let made = materials.get(key);
    if (!made) {
      made = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        side: plane ? THREE.DoubleSide : THREE.FrontSide,
      });
      materials.set(key, made);
    }
    return made;
  };
  const wire = new THREE.MeshBasicMaterial({ color: MISSING, wireframe: true });

  const objectOf = (object: SpaceObject, prefabs: ReadonlyMap<string, SpaceJson>, depth: number): THREE.Object3D => {
    if (object.shape !== undefined) {
      const mesh = new THREE.Mesh(geometry[object.shape], material(object.color ?? GREY, object.shape === 'plane'));
      setTransform(mesh, transformOf(object));
      return mesh;
    }
    const group = new THREE.Group();
    setTransform(group, transformOf(object));
    const prefab = object.prefab === undefined ? undefined : prefabs.get(object.prefab);
    if (!prefab) group.add(new THREE.Mesh(missing, wire));
    else if (depth < DEEPEST) for (const inner of prefab.objects) group.add(objectOf(inner, prefabs, depth + 1));
    return group;
  };

  return {
    build(space: SpaceJson, prefabs: ReadonlyMap<string, SpaceJson>): Built {
      const root = new THREE.Group();
      const byId = new Map<string, THREE.Object3D>();
      for (const object of space.objects) {
        const made = objectOf(object, prefabs, 0);
        made.userData.objectId = object.id;
        root.add(made);
        if (!byId.has(object.id)) byId.set(object.id, made);
      }
      return { root, byId, dispose: () => root.clear() };
    },
    /** The id of the file's object a picked mesh belongs to. */
    idOf(hit: THREE.Object3D | null): string | null {
      for (let at: THREE.Object3D | null = hit; at; at = at.parent) {
        if (typeof at.userData.objectId === 'string') return at.userData.objectId;
      }
      return null;
    },
    dispose() {
      for (const each of Object.values(geometry)) each.dispose();
      missing.dispose();
      for (const each of materials.values()) each.dispose();
      wire.dispose();
    },
  };
}
