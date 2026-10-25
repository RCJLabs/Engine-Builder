/**
 * The NPCs in the walk's view (M6.1, D73, docs/specs/npcs.md#talking): which built objects are placed
 * actors, each turned to face the player as its Talk is used and back once the walk goes on, and
 * what the hook says of them. The turns are facing.ts's arithmetic, laid on the nodes here.
 */
import { eachPlaced } from '@eb/compiler';
import * as THREE from 'three/webgpu';
import { ACTOR } from '../spaces/figureLook.ts';
import type { Vec3 } from '../spaces/vec.ts';
import { createFacing, yawToward } from './facing.ts';
import { nodeAt } from './nearObjects.ts';
import type { WalkSpace } from './world.ts';

/** What the hook says of an NPC built: its actor, what it draws as, and the yaws it faces and was placed at. */
export interface NpcSeen {
  readonly path: string;
  readonly actor: string;
  readonly drawn: 'model' | 'figure';
  readonly yaw: number;
  readonly placed: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;

export function createNpcView(space: WalkSpace, root: () => THREE.Object3D) {
  const npcs = new Map<string, { actor: string; figure: boolean }>();
  for (const object of space.space.objects) {
    eachPlaced(object, space.prefabs, (seen, ids, passed) => {
      const npc = seen.record?.startsWith(`${ACTOR}:`) ? space.npcs(seen.record, passed) : null;
      if (npc && seen.record)
        npcs.set(ids.join('/'), { actor: seen.record.slice(ACTOR.length + 1), figure: !!npc.figure });
    });
  }
  const facing = createFacing();
  // Each NPC's yaw as placed, read the first time it is seen, before anything turns it.
  const placed = new Map<string, number>();
  const ahead = new THREE.Vector3();
  const at = new THREE.Vector3();

  /** Its yaw in the world, in degrees: where its −z points, as solids.ts's yawOf reads a turn. */
  const yawOf = (node: THREE.Object3D) => {
    node.updateWorldMatrix(true, false);
    node.getWorldDirection(ahead);
    return (Math.atan2(ahead.x, ahead.z) * 180) / Math.PI + 0;
  };
  const placedOf = (path: string, node: THREE.Object3D) => {
    const known = placed.get(path);
    if (known !== undefined) return known;
    const yaw = yawOf(node);
    placed.set(path, yaw);
    return yaw;
  };

  return {
    isNpc: (path: string) => npcs.has(path),
    /** Its Talk used: the NPC turns from where it faces toward the player's feet. */
    face(path: string, feet: Vec3, now: number): void {
      const node = npcs.has(path) ? nodeAt(root(), path) : undefined;
      if (!node) return;
      const from = placedOf(path, node);
      node.getWorldPosition(at);
      facing.face(path, now, from, yawOf(node), yawToward([at.x, at.y, at.z], feet));
    },
    back: (now: number) => facing.back(now),
    turning: (now: number) => facing.turning(now),
    /** Lays this frame's turn on its node: about the world's up, so the NPC stays upright. */
    apply(now: number): void {
      const turn = facing.turn(now);
      const node = turn ? nodeAt(root(), turn.path) : undefined;
      if (!turn || !node) return;
      node.rotateOnWorldAxis(UP, (turn.yaw - yawOf(node)) * DEG);
      node.updateMatrixWorld(true);
    },
    list(): NpcSeen[] {
      return [...npcs].flatMap(([path, npc]) => {
        const node = nodeAt(root(), path);
        if (!node) return [];
        const yaw = Math.round(yawOf(node) * 10) / 10 + 0;
        const was = Math.round(placedOf(path, node) * 10) / 10 + 0;
        return [{ path, actor: npc.actor, drawn: npc.figure ? 'figure' : 'model', yaw, placed: was } as const];
      });
    },
  };
}
