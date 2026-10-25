/**
 * What draws far (M5.10, D72, docs/specs/streaming.md#the-rings): the models of objects not near,
 * at their coarsest level, as instanced meshes, one for each mesh of each model and material set in
 * use, so a kit's pieces repeated across a moor cost a few draws; and far water, built whole, as a
 * lake off in the distance is part of the land. Nothing here is solid.
 */
import * as THREE from 'three/webgpu';
import type { createBuilder, DrawModel } from '../spaces/build.ts';
import { meshesOf } from '../spaces/meshes.ts';
import { castShadows } from '../spaces/shadows.ts';
import type { SpaceJson } from '../spaces/spaceFile.ts';
import type { Placement } from './footprints.ts';

/** A placed model's coarsest level: the last of its LOD's, or the model itself without one. */
export function coarsestOf(holder: THREE.Object3D): THREE.Object3D | undefined {
  const body = holder.children.find((child) => !child.userData.colliderWire);
  if (body instanceof THREE.LOD) return body.levels[body.levels.length - 1]?.object;
  return body;
}

const matrixOf = (p: Placement) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(...p.frame.at),
    new THREE.Quaternion(...p.frame.turn),
    new THREE.Vector3(...p.frame.scale),
  );

export interface FarModels {
  readonly root: THREE.Group;
  /** Draws these objects far: their placements' models and, of those that are water, the water. */
  show(placements: readonly Placement[], water: readonly string[]): void;
  /** How many models are drawn far, and in how many instanced meshes. */
  summary(): { readonly models: number; readonly meshes: number; readonly levels: readonly number[] };
  dispose(): void;
}

export function createFarModels(
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  builder: ReturnType<typeof createBuilder>,
  draw: () => DrawModel,
  shadows: boolean,
): FarModels {
  const root = new THREE.Group();
  let instanced: THREE.InstancedMesh[] = [];
  let models = 0;
  /** Each instanced batch's level: which of its model's LOD levels it draws, 0 the whole. */
  let levels: number[] = [];

  const clear = () => {
    for (const mesh of instanced) mesh.dispose();
    instanced = [];
    root.clear();
    models = 0;
    levels = [];
  };

  return {
    root,
    show(placements, water) {
      clear();
      const drawing = draw();
      const groups = new Map<string, Placement[]>();
      for (const p of placements) {
        const key = `${p.key}\n${JSON.stringify(p.passed)}`;
        const list = groups.get(key);
        if (list) list.push(p);
        else groups.set(key, [p]);
      }
      for (const group of groups.values()) {
        const first = group[0] as Placement;
        const holder = drawing(first.key, first.passed);
        const level = holder ? coarsestOf(holder) : undefined;
        if (!holder || !level) continue;
        holder.updateMatrixWorld(true);
        const body = holder.children.find((child) => !child.userData.colliderWire);
        // The level drawn, read back from the LOD, so the hook says what is on screen.
        const depth = body instanceof THREE.LOD ? body.levels.findIndex((l) => l.object === level) : 0;
        const at = group.map(matrixOf);
        for (const mesh of meshesOf(level)) {
          const batch = new THREE.InstancedMesh(mesh.geometry, mesh.material, at.length);
          at.forEach((m, i) => {
            batch.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(m, mesh.matrixWorld));
          });
          batch.instanceMatrix.needsUpdate = true;
          batch.computeBoundingSphere();
          instanced.push(batch);
          levels.push(depth);
          root.add(batch);
        }
        models += group.length;
      }
      const objects = space.objects.filter((o) => water.includes(o.id));
      if (objects.length > 0) {
        const lakes = builder.build({ ...space, objects }, prefabs, undefined, () => null, true);
        for (const lake of [...lakes.root.children]) root.add(lake);
      }
      if (shadows) castShadows(root);
      root.updateMatrixWorld(true);
    },
    summary: () => ({ models, meshes: instanced.length, levels: [...levels] }),
    dispose: clear,
  };
}
