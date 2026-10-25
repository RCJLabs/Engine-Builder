/**
 * The near objects as three draws them (M5.10, D72, docs/specs/streaming.md#building): each
 * top-level object built on its own, as the Scene panel builds a space (build.ts), when its cells
 * come near, and taken down when they go. Building waits in a queue, nearest first, and each frame
 * builds for at most BUDGET_MS, so crossing into a cell never stops the walk for long.
 */
import * as THREE from 'three/webgpu';
import type { createBuilder, DrawModel } from '../spaces/build.ts';
import { lodsOf } from '../spaces/meshes.ts';
import { castShadows } from '../spaces/shadows.ts';
import type { SpaceJson, SpaceObject } from '../spaces/spaceFile.ts';

/** How long a frame spends building, at most, past its first object. */
export const BUDGET_MS = 4;

/** The object at a path of ids, as the builder tags them: "placement/inner". */
export function nodeAt(root: THREE.Object3D, path: string): THREE.Object3D | undefined {
  const [first, ...rest] = path.split('/');
  let node = root.children.find((c) => c.userData.objectId === first);
  for (const id of rest) node = node?.children.find((c) => c.userData.innerId === id);
  return node;
}

export interface NearObjects {
  readonly root: THREE.Group;
  /** The objects to have built from now on, those to build in the order given. */
  want(ids: ReadonlySet<string>, order: readonly string[]): void;
  /** Builds what waits, for at most BUDGET_MS, or all of it; says whether it built anything. */
  build(all: boolean): boolean;
  /** Every object built again: a model's file decoded, or a tier's shadows. */
  rebuild(): void;
  readonly waiting: number;
  /** The longest one frame's building took, in ms, rings built whole left out. */
  readonly slowest: number;
  lods(): readonly THREE.LOD[];
  built(): string[];
  dispose(): void;
}

export function createNearObjects(
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  builder: ReturnType<typeof createBuilder>,
  draw: () => DrawModel,
  /** Called with each object once it is built, before it is drawn. */
  dressed: (node: THREE.Object3D) => void,
  shadows: boolean,
): NearObjects {
  const root = new THREE.Group();
  const byId = new Map<string, SpaceObject>(space.objects.map((o) => [o.id, o]));
  const built = new Map<string, THREE.Object3D>();
  let wanted: ReadonlySet<string> = new Set();
  let waiting: string[] = [];
  let lods: THREE.LOD[] = [];
  let slowest = 0;

  const make = (id: string) => {
    const object = byId.get(id);
    if (!object) return;
    const made = builder.build({ ...space, objects: [object] }, prefabs, undefined, draw(), true);
    const node = made.root.children[0];
    if (!node) return;
    made.root.remove(node);
    if (shadows) castShadows(node);
    built.set(id, node);
    root.add(node);
    dressed(node);
  };
  const takeDown = (id: string) => {
    built.get(id)?.removeFromParent();
    built.delete(id);
  };
  const relist = () => {
    lods = lodsOf(root);
    root.updateMatrixWorld(true);
  };

  return {
    root,
    want(ids, order) {
      wanted = ids;
      for (const id of [...built.keys()]) if (!ids.has(id)) takeDown(id);
      waiting = [...order.filter((id) => ids.has(id) && !built.has(id)), ...waiting.filter((id) => ids.has(id))];
      waiting = [...new Set(waiting)];
      relist();
    },
    build(all) {
      if (waiting.length === 0) return false;
      const start = performance.now();
      do {
        const id = waiting.shift() as string;
        if (wanted.has(id) && !built.has(id)) make(id);
      } while (waiting.length > 0 && (all || performance.now() - start < BUDGET_MS));
      // A ring built whole waits under the loading screen or a respawn: only spread frames can hitch.
      if (!all) slowest = Math.max(slowest, performance.now() - start);
      relist();
      return true;
    },
    rebuild() {
      const ids = [...built.keys()];
      for (const id of ids) takeDown(id);
      for (const id of ids) make(id);
      relist();
    },
    get waiting() {
      return waiting.length;
    },
    get slowest() {
      return slowest;
    },
    lods: () => lods,
    built: () => [...built.keys()].sort(),
    dispose() {
      for (const id of [...built.keys()]) takeDown(id);
    },
  };
}
