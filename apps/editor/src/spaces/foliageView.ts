/**
 * A terrain's foliage in the Scene panel's view (M5.6, D68, docs/specs/foliage.md#drawing): each
 * type scattered over the terrain's grid, and each chunk drawing its plants as one instanced mesh
 * for each mesh of the type's model, at the model's LOD level for the chunk's distance, and not at
 * all beyond the type's distance. The model is drawn as a placed one is (viewModels.ts), so its
 * slots and levels are the same; until its file is decoded, its plants stand undrawn.
 */
import type { FoliageRecord } from '@eb/schema';
import * as THREE from 'three/webgpu';
import { levelFor, plantsNear } from '../foliage/drawing.ts';
import {
  type ChunkPlants,
  chunksOf as chunkGrid,
  MOST_PLANTS,
  PLANT_FLOATS,
  type Scatter,
  scatterAll,
  scatterChunk,
  scatterOf,
} from '../foliage/scatter.ts';
import type { Area } from '../terrain/brushes.ts';
import { chunksOf } from '../terrain/chunks.ts';
import { extentOf, heightAt, type TerrainGrid } from '../terrain/grid.ts';
import type { DrawModel } from './build.ts';
import { meshesOf } from './modelParts.ts';
import type { Vec3 } from './vec.ts';

/** A foliage type the terrain lists: its record, or null when there is none or it isn't sound, so nothing grows. */
export interface FoliageShown {
  readonly id: string;
  readonly record: FoliageRecord | null;
}

/** What the e2e reads of each type: its plants scattered and drawn now, and each chunk's. */
export interface FoliageSummary {
  readonly foliage: string;
  readonly model: string | null;
  readonly plants: number;
  readonly drawn: number;
  readonly capped: boolean;
  readonly chunks: readonly { at: [number, number]; plants: number; level: number; distance: number }[];
}

interface Part {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material | THREE.Material[];
  readonly matrix: THREE.Matrix4;
}

/** A model as foliage draws it: each LOD level's start and its meshes, placed in the model's own space. */
interface Template {
  readonly froms: number[];
  readonly parts: Part[][];
  /** Its levels, geometries, materials and matrices in one string: the same model drawn the same way. */
  readonly key: string;
}

interface Kind {
  readonly shown: FoliageShown & { readonly record: FoliageRecord };
  readonly scatter: Scatter;
  plants: Map<string, ChunkPlants>;
  capped: boolean;
  template: Template | null;
  readonly levels: Map<string, number>;
  readonly distances: Map<string, number>;
  readonly meshes: Map<string, THREE.InstancedMesh[]>;
}

const uuids = (material: Part['material']) => (Array.isArray(material) ? material : [material]).map((m) => m.uuid);

function templateOf(holder: THREE.Object3D): Template {
  holder.updateMatrixWorld(true);
  const body = holder.children[0];
  const levels = body instanceof THREE.LOD ? body.levels : [{ object: body ?? holder, distance: 0 }];
  const parts = levels.map((l) =>
    meshesOf(l.object).map((mesh) => ({
      geometry: mesh.geometry,
      material: mesh.material,
      matrix: mesh.matrixWorld.clone(),
    })),
  );
  const froms = levels.map((l) => l.distance);
  const key = JSON.stringify([
    froms,
    parts.map((level) => level.map((p) => [p.geometry.uuid, uuids(p.material), p.matrix.elements])),
  ]);
  return { froms, parts, key };
}

const UP = new THREE.Vector3(0, 1, 0);

export function createFoliageView(draw: () => void, gridOf: () => TerrainGrid | null) {
  const root = new THREE.Group();
  let list: readonly FoliageShown[] = [];
  let listKey = '';
  let drawModel: DrawModel = () => null;
  let kinds: Kind[] = [];
  // The list or the whole terrain changed: scattered again when next drawn or read, once.
  let dirty = false;
  const plant = new THREE.Matrix4();
  const instance = new THREE.Matrix4();
  const [position, up, scale] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const [tilt, yaw] = [new THREE.Quaternion(), new THREE.Quaternion()];

  const unmesh = (kind: Kind, key: string) => {
    for (const mesh of kind.meshes.get(key) ?? []) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    kind.meshes.delete(key);
  };

  const mesh = (kind: Kind, key: string) => {
    unmesh(kind, key);
    const plants = kind.plants.get(key);
    const level = kind.levels.get(key) ?? -1;
    const parts = kind.template?.parts[level];
    if (!plants || plants.count === 0 || level < 0 || !parts) return;
    const made = parts.map((part) => {
      const instanced = new THREE.InstancedMesh(part.geometry, part.material, plants.count);
      for (let n = 0; n < plants.count; n++) {
        const at = n * PLANT_FLOATS;
        const d = plants.data;
        position.set(d[at] as number, d[at + 1] as number, d[at + 2] as number);
        up.set(d[at + 5] as number, d[at + 6] as number, d[at + 7] as number);
        tilt.setFromUnitVectors(UP, up).multiply(yaw.setFromAxisAngle(UP, d[at + 3] as number));
        const size = d[at + 4] as number;
        plant.compose(position, tilt, scale.set(size, size, size));
        instanced.setMatrixAt(n, instance.multiplyMatrices(plant, part.matrix));
      }
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingSphere();
      root.add(instanced);
      return instanced;
    });
    kind.meshes.set(key, made);
  };

  const clear = () => {
    for (const kind of kinds) for (const key of [...kind.meshes.keys()]) unmesh(kind, key);
    kinds = [];
  };

  const templateFor = (kind: Kind) => {
    const holder = drawModel(`model:${kind.shown.record.model}`, []);
    return holder ? templateOf(holder) : null;
  };

  /** Every type scattered again over the whole grid, its chunks waiting for their levels. */
  const scatterEverything = () => {
    clear();
    dirty = false;
    const grid = gridOf();
    if (!grid) return;
    list.forEach((shown, channel) => {
      if (!shown.record || channel > 3) return;
      const scatter = scatterOf(shown.id, channel, shown.record);
      const { chunks, capped } = scatterAll(grid, scatter);
      if (capped) console.warn(`${shown.id} stops at ${MOST_PLANTS} plants`);
      const kind: Kind = {
        shown: shown as Kind['shown'],
        scatter,
        plants: chunks,
        capped,
        template: null,
        levels: new Map(),
        distances: new Map(),
        meshes: new Map(),
      };
      kind.template = templateFor(kind);
      kinds.push(kind);
    });
  };

  const fresh = () => {
    if (dirty) scatterEverything();
  };

  /** The chunks an area of vertices reaches scattered again, the cap counting the other chunks. */
  const scatterArea = (area: Area) => {
    const grid = gridOf();
    if (dirty || !grid) return;
    for (const kind of kinds) {
      let total = [...kind.plants.values()].reduce((n, c) => n + c.count, 0);
      for (const [ci, cj] of chunksOf(grid, area)) {
        const key = `${ci},${cj}`;
        total -= kind.plants.get(key)?.count ?? 0;
        const plants = scatterChunk(grid, kind.scatter, ci, cj, MOST_PLANTS - total);
        total += plants.count;
        kind.plants.set(key, plants);
        mesh(kind, key);
      }
      kind.capped = total >= MOST_PLANTS;
    }
    draw();
  };

  return {
    root,
    /** The terrain's foliage types, as its settings list them: scattered again when the list or a record changes. */
    show(next: readonly FoliageShown[]): void {
      const key = JSON.stringify(next);
      if (key === listKey) return;
      list = next;
      listKey = key;
      dirty = true;
      draw();
    },
    /**
     * The view's models as they are now: a type whose model has decoded, or is drawn otherwise (its
     * LOD, its slots, its scale), draws its plants again with it.
     */
    models(next: DrawModel): void {
      drawModel = next;
      for (const kind of kinds) {
        const made = templateFor(kind);
        if (made?.key === kind.template?.key) continue;
        kind.template = made;
        // Its levels start again: its LOD's distances may have moved.
        kind.levels.clear();
        for (const key of [...kind.meshes.keys()]) unmesh(kind, key);
      }
      draw();
    },
    /** The terrain changed: everywhere (null) or an area of its vertices. */
    changed(area: Area | null): void {
      if (area) scatterArea(area);
      else {
        dirty = true;
        draw();
      }
    },
    /** Each chunk's level for a camera at `eye`; a chunk whose level changed draws again. */
    levels(eye: Vec3): void {
      fresh();
      const grid = gridOf();
      if (!grid) return;
      const { across, width } = chunkGrid(grid);
      const e = extentOf(grid);
      for (const kind of kinds) {
        const drawnTo = kind.shown.record.distance ?? 200;
        for (let cj = 0; cj < across; cj++) {
          for (let ci = 0; ci < across; ci++) {
            const [x, z] = [(ci + 0.5) * width - e, (cj + 0.5) * width - e];
            const distance = Math.hypot(eye[0] - x, eye[1] - heightAt(grid, x, z), eye[2] - z);
            const key = `${ci},${cj}`;
            kind.distances.set(key, distance);
            const level = levelFor(distance, drawnTo, kind.template?.froms ?? [0]);
            if (level === kind.levels.get(key)) continue;
            kind.levels.set(key, level);
            mesh(kind, key);
          }
        }
      }
    },
    summary(): FoliageSummary[] {
      fresh();
      const grid = gridOf();
      const across = grid ? chunkGrid(grid).across : 0;
      return kinds.map((kind) => {
        const chunks: FoliageSummary['chunks'][number][] = [];
        let drawn = 0;
        for (let cj = 0; cj < across; cj++) {
          for (let ci = 0; ci < across; ci++) {
            const key = `${ci},${cj}`;
            const plants = kind.plants.get(key)?.count ?? 0;
            if (kind.meshes.has(key)) drawn += plants;
            const level = kind.levels.get(key) ?? -1;
            chunks.push({ at: [ci, cj], plants, level, distance: kind.distances.get(key) ?? 0 });
          }
        }
        return {
          foliage: kind.shown.id,
          model: kind.shown.record.model,
          plants: chunks.reduce((n, c) => n + c.plants, 0),
          drawn,
          capped: kind.capped,
          chunks,
        };
      });
    },
    near(id: string, x: number, z: number, radius: number): number {
      fresh();
      const kind = kinds.find((k) => k.shown.id === id);
      return kind ? plantsNear(kind.plants.values(), x, z, radius) : 0;
    },
    dispose(): void {
      clear();
    },
  };
}

export type FoliageView = ReturnType<typeof createFoliageView>;
