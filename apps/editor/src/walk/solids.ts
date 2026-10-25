/**
 * What a space is made of for the walk (M5.8, D70, docs/specs/movement.md#the-stage), as plain
 * data: its solids, its trigger zones and its spawn points, each placed in the world through the
 * prefabs and overrides that reach it, as the view draws them (build.ts). A shape stands on its
 * `at`: a box of scale 2 is 2 m tall above it. Rapier and three are the stage's; this is arithmetic.
 */
import {
  type Fields,
  isFields,
  overridden,
  passedOn,
  placedObjects,
  type SpaceJson,
  type SpaceObject,
} from '@eb/compiler';
import type { ModelCollider } from '@eb/schema';
import { chestOf, FIGURE, type NpcOf } from '../spaces/figureLook.ts';
import { transformOf } from '../spaces/spaceFile.ts';
import { add, mulQuat, type Quat, quatOfTurn, rotate, type Vec3 } from '../spaces/vec.ts';

/** Where a part sits in the world: its place, its turn, and its scale along its own axes. */
export interface Frame {
  readonly at: Vec3;
  readonly turn: Quat;
  readonly scale: Vec3;
}

export const WORLD_FRAME: Frame = { at: [0, 0, 0], turn: [0, 0, 0, 1], scale: [1, 1, 1] };

/** `npc`: a placed actor's (M6.2), which the crowd walks: fixed, set where its agent is each step. */
export type Solid = (
  | {
      readonly kind: 'box';
      readonly path: string;
      readonly center: Vec3;
      readonly turn: Quat;
      readonly half: Vec3;
      readonly moves: boolean;
    }
  | {
      readonly kind: 'ball';
      readonly path: string;
      readonly center: Vec3;
      readonly turn: Quat;
      readonly radius: number;
      readonly moves: boolean;
    }
  | {
      readonly kind: 'capsule';
      readonly path: string;
      readonly center: Vec3;
      readonly turn: Quat;
      readonly radius: number;
      /** Half the straight part, between the two half balls. */
      readonly halfHeight: number;
      readonly moves: boolean;
    }
  | { readonly kind: 'hull'; readonly path: string; readonly points: readonly Vec3[]; readonly moves: boolean }
) & { readonly npc?: boolean };

/** A trigger zone: a ball for a sphere, a box for anything else, the size of its object. */
export type Zone =
  | { readonly kind: 'box'; readonly path: string; readonly center: Vec3; readonly turn: Quat; readonly half: Vec3 }
  | { readonly kind: 'ball'; readonly path: string; readonly center: Vec3; readonly radius: number };

export interface Spawn {
  readonly path: string;
  readonly at: Vec3;
  /** The way it faces, in degrees about y: 0 looks along -z. */
  readonly yaw: number;
  readonly start: boolean;
  readonly view: 'third' | 'first';
}

/** Something the player can use (M5.9): where its middle is, and what its prompt says. */
export interface UsePoint {
  readonly path: string;
  readonly center: Vec3;
  readonly label: string;
}

export interface Parts {
  readonly solids: readonly Solid[];
  readonly zones: readonly Zone[];
  readonly spawns: readonly Spawn[];
  readonly uses: readonly UsePoint[];
}

/** A placed record's model collider and scale, as this placement sees it, or null for none. */
export type ModelOf = (
  key: string,
  passed: readonly Fields[],
) => { readonly collider?: ModelCollider; readonly scale?: number } | null;

export const DEEPEST = 8;

const mul = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];

/** `local` placed in `parent`: its place turned and scaled by the parent's, its turn after the parent's. */
export function within(parent: Frame, local: Frame): Frame {
  return {
    at: add(parent.at, rotate(parent.turn, mul(parent.scale, local.at))),
    turn: mulQuat(parent.turn, local.turn),
    scale: mul(parent.scale, local.scale),
  };
}

/** A point given in the frame's own axes, in the world's. */
export const pointIn = (frame: Frame, p: Vec3): Vec3 => add(frame.at, rotate(frame.turn, mul(frame.scale, p)));

export const frameOf = (object: SpaceObject): Frame => {
  const t = transformOf(object);
  return { at: t.at, turn: quatOfTurn(t.turn), scale: t.scale };
};

/** The unit shape's middle: half a metre up for those that stand on their place, none for a plane. */
export const middleOfShape = (shape: string | undefined): Vec3 => [0, shape === 'plane' ? 0 : 0.5, 0];
export const middleOf = (object: SpaceObject): Vec3 => middleOfShape(object.shape);

/** A collider component on an object of `shape`, sized by its scale: the walk's, and the navmesh's bake (M6.2). */
export function colliderSolid(path: string, frame: Frame, shape: string | undefined, fields: Fields): Solid {
  const center = pointIn(frame, middleOfShape(shape));
  const [sx, sy, sz] = frame.scale.map(Math.abs) as [number, number, number];
  const moves = fields.moves === true;
  if (fields.shape === 'sphere')
    return { kind: 'ball', path, center, turn: frame.turn, radius: Math.max(sx, sy, sz) / 2, moves };
  if (fields.shape === 'capsule') {
    const radius = Math.max(sx, sz) / 2;
    return { kind: 'capsule', path, center, turn: frame.turn, radius, halfHeight: Math.max(0, sy / 2 - radius), moves };
  }
  return { kind: 'box', path, center, turn: frame.turn, half: [sx / 2, sy / 2, sz / 2], moves };
}

/** A model's collider in the world: the model scaled by its record's scale inside its placement. */
export function modelSolid(path: string, frame: Frame, collider: ModelCollider, scale = 1): Solid | null {
  const model = within(frame, { at: [0, 0, 0], turn: [0, 0, 0, 1], scale: [scale, scale, scale] });
  const [sx, sy, sz] = model.scale.map(Math.abs) as [number, number, number];
  const center = pointIn(model, collider.center ?? [0, 0, 0]);
  const r = collider.radius ?? 0;
  switch (collider.shape) {
    case 'box': {
      const [x, y, z] = collider.size ?? [0, 0, 0];
      return x > 0 && y > 0 && z > 0
        ? {
            kind: 'box',
            path,
            center,
            turn: model.turn,
            half: [(x * sx) / 2, (y * sy) / 2, (z * sz) / 2],
            moves: false,
          }
        : null;
    }
    case 'sphere':
      return r > 0
        ? { kind: 'ball', path, center, turn: model.turn, radius: r * Math.max(sx, sy, sz), moves: false }
        : null;
    case 'capsule': {
      const radius = r * Math.max(sx, sz);
      const half = ((collider.height ?? 0) * sy) / 2 - radius;
      return radius > 0 && half >= 0
        ? { kind: 'capsule', path, center, turn: model.turn, radius, halfHeight: half, moves: false }
        : null;
    }
    case 'hull': {
      const points = (collider.points ?? []).map((p) => pointIn(model, p));
      return points.length >= 4 ? { kind: 'hull', path, points, moves: false } : null;
    }
  }
}

function zoneOf(path: string, frame: Frame, object: SpaceObject): Zone {
  const center = pointIn(frame, middleOf(object));
  const [sx, sy, sz] = frame.scale.map(Math.abs) as [number, number, number];
  if (object.shape === 'sphere') return { kind: 'ball', path, center, radius: Math.max(sx, sy, sz) / 2 };
  return { kind: 'box', path, center, turn: frame.turn, half: [sx / 2, Math.max(sy, 0.01) / 2, sz / 2] };
}

/** The yaw of a turn, in degrees: where its -z points, seen from above. */
export function yawOf(turn: Quat): number {
  const [x, , z] = rotate(turn, [0, 0, -1]);
  // + 0: a turn of none is 0°, not -0°.
  return (Math.atan2(-x, -z) * 180) / Math.PI + 0;
}

/** An NPC drawn as the engine's figure (M6.1): a fixed capsule its height tall, standing on its place. */
function figureSolid(path: string, frame: Frame, height: number): Solid {
  const radius = FIGURE.radius;
  const tall = height * Math.abs(frame.scale[1]);
  return {
    kind: 'capsule',
    path,
    center: [frame.at[0], frame.at[1] + tall / 2, frame.at[2]],
    turn: frame.turn,
    radius,
    halfHeight: Math.max(0, tall / 2 - radius),
    moves: false,
  };
}

/**
 * The space's parts, depth first as the view draws them. A zone is kept only when the sim has it
 * (`zones`, the pack's trigger zones for the space), and a use only when the sim has it too (`uses`,
 * its label by path), so the walk sends nothing the sim can't hear. A placed actor (M6.1, `npcs`)
 * has its model's collider or its figure's capsule, and its Talk at its chest.
 */
export function partsOf(
  space: SpaceJson,
  prefabs: ReadonlyMap<string, SpaceJson>,
  models: ModelOf,
  zones: ReadonlySet<string>,
  uses: ReadonlyMap<string, string> = new Map(),
  npcs: NpcOf = () => null,
): Parts {
  const solids: Solid[] = [];
  const found: Zone[] = [];
  const spawns: Spawn[] = [];
  const usable: UsePoint[] = [];
  const walk = (
    object: SpaceObject,
    layers: readonly unknown[],
    parent: Frame,
    ids: readonly string[],
    depth: number,
  ) => {
    const seen = overridden(object, layers);
    const frame = within(parent, frameOf(seen));
    const path = ids.join('/');
    const components = seen.components ?? {};
    if (isFields(components.collider)) solids.push(colliderSolid(path, frame, seen.shape, components.collider));
    if (isFields(components.trigger) && zones.has(path)) found.push(zoneOf(path, frame, seen));
    const label = isFields(components.interact) ? uses.get(path) : undefined;
    if (label !== undefined) usable.push({ path, center: pointIn(frame, middleOf(seen)), label });
    if (isFields(components.spawn)) {
      const spawn = components.spawn;
      spawns.push({
        path,
        at: frame.at,
        yaw: yawOf(frame.turn),
        start: spawn.start === true,
        view: spawn.view === 'first' ? 'first' : 'third',
      });
    }
    if (seen.record !== undefined) {
      const passed = passedOn(object, layers);
      const model = models(seen.record, passed);
      const npc = npcs(seen.record, passed);
      const solid = model?.collider
        ? modelSolid(path, frame, model.collider, model.scale)
        : npc?.figure
          ? figureSolid(path, frame, npc.figure.height)
          : null;
      if (solid) solids.push(npc ? { ...solid, npc: true } : solid);
      const talk = npc && label === undefined ? uses.get(path) : undefined;
      if (npc && talk !== undefined) {
        const chest = chestOf(npc.height) * Math.abs(frame.scale[1]);
        usable.push({ path, center: [frame.at[0], frame.at[1] + chest, frame.at[2]], label: talk });
      }
      return;
    }
    const prefab = seen.prefab === undefined ? undefined : prefabs.get(seen.prefab);
    if (!prefab || depth >= DEEPEST) return;
    for (const inner of placedObjects(prefab, passedOn(object, layers))) {
      walk(inner.object, inner.layers, frame, [...ids, inner.object.id], depth + 1);
    }
  };
  for (const object of space.objects) walk(object, [], WORLD_FRAME, [object.id], 0);
  return { solids, zones: found, spawns, uses: usable };
}

/**
 * Where the walk starts: the spawn point the player arrives at (M5.9), else the one with start, else
 * the first, else none (the origin on the ground).
 */
export const spawnOf = (spawns: readonly Spawn[], arrive?: string): Spawn | undefined =>
  (arrive === undefined ? undefined : spawns.find((s) => s.path === arrive)) ??
  spawns.find((s) => s.start) ??
  spawns[0];

/** The path, or one of the objects it is inside, is in `taken`: "rope" takes "rope/coil" with it. */
export function isTaken(path: string, taken: ReadonlySet<string>): boolean {
  if (taken.size === 0) return false;
  for (let at = path.length; at > 0; at = path.lastIndexOf('/', at - 1)) {
    if (taken.has(path.slice(0, at))) return true;
  }
  return false;
}
