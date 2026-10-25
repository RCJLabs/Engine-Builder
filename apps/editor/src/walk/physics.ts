/**
 * The walk's physics (M5.8, D70, docs/specs/movement.md#the-stage): Rapier's world from a space's
 * parts and terrain, and the character moved through it by Rapier's kinematic character controller.
 * Rapier is the compat build, given by the caller, so Node's tests walk the same world the page does.
 */
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { Quat, Vec3 } from '../spaces/vec.ts';
import type { Clear } from './cameras.ts';
import type { Intent } from './controls.ts';
import { type Fall, fallAfter, STANDING, STEP, stepOf } from './motion.ts';
import { isTaken, type Solid, type Spawn } from './solids.ts';

export type Rapier = typeof RAPIER_NS;

export const BODY = { height: 1.8, radius: 0.35 } as const;
export const SLOPE = 40;
export const STEP_UP = 0.35;
export const SNAP = 0.4;
/** Below the ground's lowest by this much, the character is put back at its spawn. */
export const FALL_LIMIT = 50;
/** What the character weighs as it pushes what moves; what moves weighs its volume times this. */
const CHARACTER_MASS = 80;
const DENSITY = 300;

/** A terrain as the physics takes it: its heights in metres row by row along z, centred on the origin. */
export interface Ground {
  readonly size: number;
  readonly spacing: number;
  readonly heights: Float32Array;
  readonly low: number;
}

export interface Walker {
  /** Where the feet are, the velocity of the last step and whether it ended on the ground. */
  feet(): Vec3;
  velocity(): Vec3;
  grounded(): boolean;
  /** One fixed step of the character and the world. */
  step(intent: Intent, yaw: number): void;
  /** Rays for the camera: what they meet, the character left out. */
  readonly clear: Clear;
  /** Where each solid that moves is now. */
  moving(): { readonly path: string; readonly at: Vec3; readonly turn: Quat }[];
  /** Back to the spawn, standing. */
  respawn(): void;
  /** Solids taken (M5.9): gone from the world, with everything inside them. */
  remove(taken: ReadonlySet<string>): void;
  /** Solids of objects built as their cells come near (M5.10), solid at once. */
  add(solids: readonly Solid[]): void;
  /** An NPC's solid moved by `shift` from where it was placed (M6.2), as its agent walks. */
  npcAt(path: string, shift: Vec3): void;
  /** The solids of these top-level objects, taken down with their cells. */
  drop(tops: ReadonlySet<string>): void;
  /** How many bodies the world holds, the character's left out. */
  bodies(): number;
  /** Standing somewhere else: for tests and the editor's own tools, never a player's. */
  teleport(feet: Vec3): void;
  free(): void;
}

/** Rapier's heightfield runs column by column (the spike's rapierHeights, M1.10); ours row by row. */
export function columnsOf(ground: Ground): Float32Array {
  const { size, heights } = ground;
  const out = new Float32Array(size * size);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) out[x * size + z] = heights[z * size + x] as number;
  return out;
}

const quat = (q: Quat) => ({ x: q[0], y: q[1], z: q[2], w: q[3] });
/** The top-level object a part's path is in: "cottage/wall" is the cottage's. */
export const topOf = (path: string): string => {
  const at = path.indexOf('/');
  return at < 0 ? path : path.slice(0, at);
};
/** How far a move goes over the ground, leaving out up and down. */
const across = (v: Vec3) => Math.hypot(v[0], v[2]);

function colliderOf(rapier: Rapier, solid: Solid): RAPIER_NS.ColliderDesc | null {
  switch (solid.kind) {
    case 'box':
      return rapier.ColliderDesc.cuboid(...solid.half);
    case 'ball':
      return rapier.ColliderDesc.ball(solid.radius);
    case 'capsule':
      return solid.halfHeight > 0
        ? rapier.ColliderDesc.capsule(solid.halfHeight, solid.radius)
        : rapier.ColliderDesc.ball(solid.radius);
    case 'hull':
      return rapier.ColliderDesc.convexHull(new Float32Array(solid.points.flat()));
  }
}

/**
 * The solid's body: still ones fixed where they stand, moving ones dynamic, an NPC's kinematic (M6.2)
 * so the crowd moves it, each shape about its centre.
 */
function addSolid(rapier: Rapier, world: RAPIER_NS.World, solid: Solid) {
  const desc = colliderOf(rapier, solid);
  if (!desc) return null;
  if (solid.npc && solid.kind !== 'hull') {
    const kind = rapier.RigidBodyDesc.kinematicPositionBased();
    const body = world.createRigidBody(kind.setTranslation(...solid.center).setRotation(quat(solid.turn)));
    world.createCollider(desc, body);
    return body;
  }
  if (solid.kind === 'hull') {
    // A hull's points are the world's already: its body stands at the origin.
    const body = world.createRigidBody(solid.moves ? rapier.RigidBodyDesc.dynamic() : rapier.RigidBodyDesc.fixed());
    world.createCollider(desc.setDensity(DENSITY), body);
    return body;
  }
  const kind = solid.moves ? rapier.RigidBodyDesc.dynamic() : rapier.RigidBodyDesc.fixed();
  const body = world.createRigidBody(kind.setTranslation(...solid.center).setRotation(quat(solid.turn)));
  world.createCollider(desc.setDensity(DENSITY), body);
  return body;
}

export function createWalker(
  rapier: Rapier,
  /** `at`: where a load stood the player, in place of the spawn (M5.9). */
  parts: { readonly solids: readonly Solid[]; readonly spawn: Spawn | undefined; readonly at?: Vec3 },
  ground: Ground | null,
): Walker {
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;
  if (ground) {
    const cells = ground.size - 1;
    const span = cells * ground.spacing;
    world.createCollider(rapier.ColliderDesc.heightfield(cells, cells, columnsOf(ground), { x: span, y: 1, z: span }));
  }
  let moving: { path: string; body: RAPIER_NS.RigidBody }[] = [];
  let bodies: { path: string; body: RAPIER_NS.RigidBody }[] = [];
  /** Each NPC's body by path, with where it was placed: the crowd's moves are from there. */
  const npcs = new Map<string, { body: RAPIER_NS.RigidBody; from: Vec3 }>();
  const add = (solids: readonly Solid[]) => {
    for (const solid of solids) {
      const body = addSolid(rapier, world, solid);
      if (body) bodies.push({ path: solid.path, body });
      if (body && solid.moves) moving.push({ path: solid.path, body });
      if (body && solid.npc && solid.kind !== 'hull') npcs.set(solid.path, { body, from: solid.center });
    }
  };
  /** Takes out the bodies `gone` says of: from the world, and from the lists. */
  const takeOut = (gone: (path: string) => boolean) => {
    for (const { path, body } of bodies) if (gone(path)) world.removeRigidBody(body);
    bodies = bodies.filter((b) => !gone(b.path));
    moving = moving.filter((m) => !gone(m.path));
    for (const path of [...npcs.keys()]) if (gone(path)) npcs.delete(path);
  };
  add(parts.solids);
  const half = BODY.height / 2 - BODY.radius;
  const character = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased());
  const capsule = world.createCollider(rapier.ColliderDesc.capsule(half, BODY.radius), character);
  const controller = world.createCharacterController(0.01);
  controller.setUp({ x: 0, y: 1, z: 0 });
  controller.setMaxSlopeClimbAngle((SLOPE * Math.PI) / 180);
  controller.setMinSlopeSlideAngle((SLOPE * Math.PI) / 180);
  controller.enableAutostep(STEP_UP, 0.2, true);
  controller.enableSnapToGround(SNAP);
  controller.setApplyImpulsesToDynamicBodies(true);
  controller.setCharacterMass(CHARACTER_MASS);
  // Rapier builds its query structures as the world steps: the first spawn's ray needs them.
  world.step();

  const lowest = ground ? ground.low : 0;
  let fall: Fall = STANDING;
  let velocity: Vec3 = [0, 0, 0];

  const ray = (from: Vec3, dir: Vec3, most: number) => {
    const hit = world.castRay(
      new rapier.Ray({ x: from[0], y: from[1], z: from[2] }, { x: dir[0], y: dir[1], z: dir[2] }),
      most,
      true,
      undefined,
      undefined,
      capsule,
      character,
    );
    return hit ? hit.timeOfImpact : null;
  };

  /** Where the walk starts: its spawn point, or the origin on whatever is under it. */
  const start = (): Vec3 => {
    if (parts.spawn) return parts.spawn.at;
    const down = ray([0, 1000, 0], [0, -1, 0], 2000);
    return [0, down === null ? 0 : 1000 - down, 0];
  };
  const place = (feet: Vec3) => {
    const centre = { x: feet[0], y: feet[1] + BODY.height / 2, z: feet[2] };
    character.setTranslation(centre, true);
    character.setNextKinematicTranslation(centre);
  };
  const slide = (delta: Vec3): Vec3 => {
    controller.computeColliderMovement(capsule, { x: delta[0], y: delta[1], z: delta[2] });
    const m = controller.computedMovement();
    return [m.x, m.y, m.z];
  };
  const feet = (): Vec3 => {
    const t = character.translation();
    return [t.x, t.y - BODY.height / 2, t.z];
  };
  // A spawn point a little under the ground stands on it: up out of the ground, then the snap down.
  place(parts.at ?? start());

  return {
    feet,
    velocity: () => velocity,
    grounded: () => fall.grounded,
    step(intent, yaw) {
      const asked = stepOf(intent, yaw, fall);
      let moved = slide(asked.delta);
      // Rapier 0.21 now and then loses a grounded step's whole slide to the press down it carries:
      // on a flat floor, about one step in a hundred. Asked again without the press, it slides; a
      // wall still stops it.
      if (fall.grounded && asked.delta[1] < 0 && across(moved) < across(asked.delta) / 2) {
        moved = slide([asked.delta[0], 0, asked.delta[2]]);
      }
      const was = character.translation();
      const next = { x: was.x + moved[0], y: was.y + moved[1], z: was.z + moved[2] };
      character.setNextKinematicTranslation(next);
      fall = fallAfter(asked.vy, asked.delta[1], moved[1], controller.computedGrounded());
      velocity = [moved[0] / STEP, moved[1] / STEP, moved[2] / STEP];
      world.step();
      if (next.y - BODY.height / 2 < lowest - FALL_LIMIT) this.respawn();
    },
    clear: ray,
    moving: () =>
      moving.map(({ path, body }) => {
        const t = body.translation();
        const r = body.rotation();
        return { path, at: [t.x, t.y, t.z] as Vec3, turn: [r.x, r.y, r.z, r.w] as Quat };
      }),
    respawn() {
      this.teleport(start());
    },
    remove(taken) {
      takeOut((path) => isTaken(path, taken));
    },
    add,
    npcAt(path, shift) {
      const npc = npcs.get(path);
      if (!npc) return;
      const [x, y, z] = npc.from;
      npc.body.setNextKinematicTranslation({ x: x + shift[0], y: y + shift[1], z: z + shift[2] });
    },
    drop(tops) {
      if (tops.size > 0) takeOut((path) => tops.has(topOf(path)));
    },
    bodies: () => bodies.length,
    teleport(at) {
      fall = STANDING;
      velocity = [0, 0, 0];
      place(at);
    },
    free() {
      world.removeCharacterController(controller);
      world.free();
    },
  };
}
