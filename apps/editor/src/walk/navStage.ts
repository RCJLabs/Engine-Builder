/**
 * The walk's navigation (M6.2, D74, docs/specs/navigation.md#the-stage), for a space with a navmesh:
 * nav.js loaded and the navmesh opened, its NPCs walked by the crowd (crowdWalk.ts) on the walk's
 * fixed steps, their nodes and bodies put where their agents are, where they stand told to the sim
 * (npcTell.ts), and a tap walking the player along the navmesh (tapPath.ts) with a ring where they go.
 */
import { navmeshOf } from '@eb/compiler';
import type { PackWorld } from '@eb/core';
import type { NpcGoal, SpaceAsk } from '@eb/ui';
import type { NavWorld } from '../nav/lib.ts';
import { FIGURE } from '../spaces/figureLook.ts';
import { add, sub, times, type Vec3 } from '../spaces/vec.ts';
import type { Intent } from './controls.ts';
import { type CrowdNpc, createCrowdWalk, type WalkingNpc } from './crowdWalk.ts';
import { objectPlaces } from './goals.ts';
import type { LoadNav } from './host.ts';
import { STEP } from './motion.ts';
import { createNpcTell, type NpcTell } from './npcTell.ts';
import type { Outbox } from './outbox.ts';
import type { Walker } from './physics.ts';
import { pushAlong, pushedElsewhere, type TapPath, tapPathOf, targetOf } from './tapPath.ts';
import type { WalkView } from './view.ts';
import type { WalkSpace } from './world.ts';

/** What the hook says of the navigation (docs/specs/navigation.md#the-stage). */
export interface WalkNav {
  readonly navmesh: { readonly tiles: number; readonly polygons: number };
  readonly agents: readonly WalkingNpc[];
  readonly tap: { readonly target: Vec3; readonly corners: readonly Vec3[]; readonly next: number } | null;
  readonly sent: ReturnType<NpcTell['sent']>;
}

export interface NavStage {
  /** The intent with the tapped path's push in it: a tap starts one, any other push ends it. */
  intent(intent: Intent, tap: { x: number; y: number } | undefined, feet: Vec3, yaw: number): Intent;
  /** After each fixed step: the crowd stepped and each NPC's body where its agent is. */
  step(feet: Vec3): void;
  /** Each frame: the NPCs drawn where they are, and where they stand told when due. */
  frame(now: number): void;
  stand(now: number): void;
  told(next: Readonly<Record<string, NpcGoal>>): void;
  hook(): WalkNav;
  stop(): void;
}

const bytesOf = (base64: string): Uint8Array => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
/** How far a tap's ray looks for something to stand on. */
const TAP_REACH = 500;

/** The space's NPCs as the crowd walks them: the pack's actors placed here, at their places. */
export function npcsOf(space: WalkSpace, world: PackWorld, places: ReadonlyMap<string, Vec3>): CrowdNpc[] {
  return Object.entries(world.actors ?? {}).flatMap(([actor, placed]) => {
    const at = placed.space === space.id ? places.get(placed.path) : undefined;
    if (!at) return [];
    const height = space.npcs(`actor:${actor}`, [])?.height ?? FIGURE.height;
    return [{ path: placed.path, actor, placed: at, radius: FIGURE.radius, height }];
  });
}

export async function createNavStage(
  space: WalkSpace,
  world: PackWorld,
  ask: SpaceAsk,
  outbox: Outbox,
  load: LoadNav | undefined,
  to: { readonly walker: Walker; view(): WalkView },
): Promise<NavStage | null> {
  const packed = world.navmeshes?.[space.id];
  if (packed === undefined || !load) return null;
  const lib = await load();
  await lib.readyNav();
  const nav: NavWorld = lib.openNav(navmeshOf(bytesOf(packed)));
  const counts = (({ tiles, polygons }) => ({ tiles, polygons }))(nav.debug());
  const places = objectPlaces(space.space, space.prefabs);
  const npcs = npcsOf(space, world, places);
  const placedOf = new Map(npcs.map((n) => [n.path, n.placed]));
  const crowd = createCrowdWalk(nav, npcs, (path) => places.get(path), ask.npcs ?? {});
  const tell = createNpcTell(ask, outbox, (actor, goal) => crowd.heard(actor, goal));
  let tapped: TapPath | null = null;
  const turned = new Set<string>();
  // Only an NPC that has walked, or a load put somewhere, is said: one never moved stands where placed.
  const said = () => crowd.list().filter((npc) => npc.yaw !== undefined);
  const show = (path: TapPath | null) => to.view().marker.show(path ? targetOf(path) : null);

  const begin = (tap: { x: number; y: number }, feet: Vec3) => {
    const ray = to.view().ray(tap.x, tap.y);
    const hit = to.walker.clear(ray.from, ray.dir, TAP_REACH);
    const target = hit === null ? null : nav.closest(add(ray.from, times(ray.dir, hit)));
    tapped = target ? tapPathOf(nav.path(feet, target)) : null;
    show(tapped);
  };

  return {
    intent(intent, tap, feet, yaw) {
      if (pushedElsewhere(intent)) {
        if (tapped) {
          tapped = null;
          show(null);
        }
        return intent;
      }
      if (tap) begin(tap, feet);
      if (!tapped) return intent;
      const along = pushAlong(tapped, feet, yaw);
      tapped = along.path;
      if (!tapped) show(null);
      return { ...intent, move: along.move };
    },
    step(feet) {
      crowd.present(to.view().npcs.built());
      crowd.step(STEP, feet);
      for (const npc of crowd.list()) {
        const placed = placedOf.get(npc.path);
        if (placed && npc.state !== 'away') to.walker.npcAt(npc.path, sub(npc.at, placed));
      }
    },
    frame(now) {
      const list = crowd.list();
      for (const npc of list) {
        if (npc.state === 'away') continue;
        // Turned the way it walks, or once to the way a load said it faced.
        const moving = Math.hypot(npc.velocity[0], npc.velocity[2]) > 0.1;
        const first = npc.yaw !== undefined && !turned.has(npc.path);
        if (first) turned.add(npc.path);
        to.view().npcs.place(npc.path, npc.at, moving || first ? npc.yaw : undefined);
      }
      tell.frame(said(), crowd.arrivals(), now);
    },
    stand: (now) => tell.stand(said(), crowd.arrivals(), now),
    told: (next) => crowd.told(next),
    hook: () => ({
      navmesh: counts,
      agents: crowd.list(),
      tap: tapped ? { target: targetOf(tapped), corners: tapped.corners, next: tapped.next } : null,
      sent: tell.sent(),
    }),
    stop() {
      crowd.free();
      nav.free();
    },
  };
}
