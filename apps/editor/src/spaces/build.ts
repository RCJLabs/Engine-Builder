/**
 * A space or prefab as three objects (M5.1): one per object of the file, each standing where its
 * file puts it, a placed prefab a group of the prefab's own objects, as its placement's overrides
 * change them (M5.2). A placed record is a marker with its name above it; each component a small
 * mark of its kind, a light a light as well, and water (M5.3) a see-through surface of its colour.
 * Geometry is shared by shape and materials by colour, so building a space again after an edit
 * costs little.
 */
import { type Fields, isFields, overridden, passedOn, placedObjects } from '@eb/compiler';
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
  /** Each placed record's name, and the marker it stands over. */
  readonly labels: readonly { readonly text: string; readonly at: THREE.Object3D }[];
  dispose(): void;
}

/** What a record's name is, by "type:id": the record's name field, when its type has one. */
export type NameOf = (key: string) => string | undefined;

/** Water left without its fields (docs/specs/terrain.md#water). */
const WATER = { color: '#3a6d8c', clarity: 0.6 } as const;

/** The marks' colours: one a kind, each light enough to read on the view's dark ground. */
const MARKS: Readonly<Record<string, string>> = {
  record: '#e0a030',
  light: '#ffd166',
  collider: '#3ecf8e',
  trigger: '#b07cff',
  spawn: '#4cc9f0',
  sound: '#ff8fab',
};

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
  const waters = new Map<string, THREE.Material>();
  /** Water's surface: clearer water is fainter, its opacity clarity's complement. */
  const water = (fields: Fields) => {
    const color = typeof fields.color === 'string' ? fields.color : WATER.color;
    const clarity = typeof fields.clarity === 'number' ? Math.min(1, Math.max(0, fields.clarity)) : WATER.clarity;
    const key = `${color}:${clarity}`;
    let made = waters.get(key);
    if (!made) {
      made = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.15,
        transparent: true,
        opacity: 1 - clarity,
        // So the ground under it is drawn through it, whatever order the two are drawn in.
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      // So the view's hook can tell water's surface from a shape's own colour.
      made.userData.water = true;
      waters.set(key, made);
    }
    return made;
  };
  const fieldsOf = (value: unknown): Fields => (isFields(value) ? value : {});
  const marks = markGeometry();
  const markMaterials = new Map(
    Object.entries(MARKS).map(([kind, color]) => [
      kind,
      new THREE.MeshBasicMaterial({ color, wireframe: kind !== 'record' }),
    ]),
  );
  const markOf = (kind: string, geometry: THREE.BufferGeometry) =>
    new THREE.Mesh(geometry, markMaterials.get(kind) as THREE.Material);

  /** The marks of an object's components, as children of its own node. */
  const withComponents = (node: THREE.Object3D, object: SpaceObject) => {
    const components = object.components ?? {};
    const centre = object.shape !== undefined && object.shape !== 'plane' ? 0.5 : 0;
    for (const [kind, fields] of Object.entries(components)) {
      const f = fieldsOf(fields);
      if (kind === 'light') {
        const light = new THREE.PointLight(
          typeof f.color === 'string' ? f.color : '#ffffff',
          typeof f.intensity === 'number' ? f.intensity * 4 : 4,
          typeof f.range === 'number' ? f.range : 10,
        );
        light.position.y = centre;
        node.add(light);
        const bulb = markOf('light', marks.bulb);
        bulb.position.y = centre;
        node.add(bulb);
      } else if (kind === 'collider') {
        node.add(
          markOf('collider', f.shape === 'sphere' ? marks.sphere : f.shape === 'capsule' ? marks.capsule : marks.box),
        );
      } else if (kind === 'water' && object.shape === undefined) {
        // A placement has no surface of its own: water on it is W145, drawn as a metre's plane.
        node.add(new THREE.Mesh(geometry.plane, water(f)));
      } else if (kind === 'trigger') node.add(markOf('trigger', marks.box));
      else if (kind === 'spawn') node.add(markOf('spawn', marks.arrow));
      else if (kind === 'sound') {
        const ring = markOf('sound', marks.ring);
        ring.position.y = centre;
        node.add(ring);
      }
    }
    return node;
  };

  const objectOf = (
    object: SpaceObject,
    prefabs: ReadonlyMap<string, SpaceJson>,
    depth: number,
    layers: readonly unknown[],
    names: NameOf,
    labels: { text: string; at: THREE.Object3D }[],
  ): THREE.Object3D => {
    const seen = overridden(object, layers);
    if (seen.shape !== undefined) {
      const wet = seen.components?.water;
      const mesh = new THREE.Mesh(
        geometry[seen.shape],
        wet !== undefined ? water(fieldsOf(wet)) : material(seen.color ?? GREY, seen.shape === 'plane'),
      );
      setTransform(mesh, transformOf(seen));
      return withComponents(mesh, seen);
    }
    const group = new THREE.Group();
    setTransform(group, transformOf(seen));
    if (seen.record !== undefined) {
      const marker = markOf('record', marks.record);
      group.add(marker);
      labels.push({ text: names(seen.record) ?? seen.name ?? seen.record, at: marker });
      return withComponents(group, seen);
    }
    const prefab = seen.prefab === undefined ? undefined : prefabs.get(seen.prefab);
    if (!prefab) group.add(new THREE.Mesh(missing, wire));
    else if (depth < DEEPEST) {
      for (const inner of placedObjects(prefab, passedOn(object, layers))) {
        group.add(objectOf(inner.object, prefabs, depth + 1, inner.layers, names, labels));
      }
    }
    return withComponents(group, seen);
  };

  return {
    build(space: SpaceJson, prefabs: ReadonlyMap<string, SpaceJson>, names: NameOf = () => undefined): Built {
      const root = new THREE.Group();
      const byId = new Map<string, THREE.Object3D>();
      const labels: { text: string; at: THREE.Object3D }[] = [];
      for (const object of space.objects) {
        const made = objectOf(object, prefabs, 0, [], names, labels);
        made.userData.objectId = object.id;
        root.add(made);
        if (!byId.has(object.id)) byId.set(object.id, made);
      }
      // Lights are made a build at a time: three keeps none of them once they leave the scene.
      return { root, byId, labels, dispose: () => root.clear() };
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
      for (const each of Object.values(marks)) each.dispose();
      missing.dispose();
      for (const each of materials.values()) each.dispose();
      for (const each of markMaterials.values()) each.dispose();
      for (const each of waters.values()) each.dispose();
      wire.dispose();
    },
  };
}

/** The marks' shapes, each standing on its object's origin as the shapes do: a record's diamond, a bulb, a zone's box, an arrow, a ring. */
function markGeometry() {
  return {
    record: new THREE.OctahedronGeometry(0.35).translate(0, 0.6, 0),
    bulb: new THREE.SphereGeometry(0.12, 12, 8),
    box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    sphere: new THREE.SphereGeometry(0.5, 16, 8).translate(0, 0.5, 0),
    capsule: new THREE.CapsuleGeometry(0.3, 0.4, 4, 12).translate(0, 0.5, 0),
    // Pointing the way the object faces, along -z, as three's camera and its objects look.
    arrow: new THREE.ConeGeometry(0.18, 0.5, 12).rotateX(-Math.PI / 2).translate(0, 0.05, -0.25),
    ring: new THREE.TorusGeometry(0.3, 0.03, 8, 24).rotateX(Math.PI / 2),
  };
}
