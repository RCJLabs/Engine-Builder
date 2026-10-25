/**
 * Navigation (M6.2, D74, docs/specs/navigation.md): Recast and Detour through recast-navigation-js
 * (MIT; Recast and Detour are zlib), as nav.js holds them. A soup of triangles baked for the
 * player's body, a navmesh opened from its file, its paths and closest points, and a crowd stepped
 * on the walk's fixed steps. The walk, the editor's bake worker and Node's tests all use this.
 */
import { NAV_AGENT, NAV_CELLS } from '@eb/compiler';
import {
  Crowd,
  type CrowdAgent,
  exportNavMesh,
  getNavMeshPositionsAndIndices,
  importNavMesh,
  init,
  type NavMesh,
  NavMeshQuery,
} from 'recast-navigation';
import { generateSoloNavMesh, generateTiledNavMesh } from 'recast-navigation/generators';
import type { Vec3 } from '../spaces/vec.ts';
import type { Soup } from './geometry.ts';

/** How fast an NPC walks, at most, in m/s; how quickly it gets there. */
export const NPC_SPEED = 1.4;
const NPC_ACCELERATION = 8;
/** How far from a point the navmesh is looked for: across, and up and down. */
const REACH: Vec3 = [2, 4, 2];
const MOST_AGENTS = 64;

let ready: Promise<void> | null = null;
export const readyNav = (): Promise<void> => (ready ??= init());

const v = (p: Vec3) => ({ x: p[0], y: p[1], z: p[2] });
const vec = (p: { x: number; y: number; z: number }): Vec3 => [p.x, p.y, p.z];
const reach = { halfExtents: v(REACH) };

/** The soup's extent across the ground: one tile up to NAV_CELLS.solo metres, tiles of NAV_CELLS.tile cells past it. */
export function extentOf(soup: Soup): number {
  let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < soup.positions.length; i += 3) {
    const [x, z] = [soup.positions[i] as number, soup.positions[i + 2] as number];
    [x0, x1, z0, z1] = [Math.min(x0, x), Math.max(x1, x), Math.min(z0, z), Math.max(z1, z)];
  }
  return Math.max(x1 - x0, z1 - z0);
}

/** Recast's export of the soup baked for the player's body, or why it couldn't be. */
export function bakeSoup(soup: Soup): { ok: true; navmesh: Uint8Array; tiled: boolean } | { ok: false; why: string } {
  const config = {
    cs: NAV_CELLS.size,
    ch: NAV_CELLS.height,
    walkableRadius: Math.ceil(NAV_AGENT.radius / NAV_CELLS.size),
    walkableHeight: Math.ceil(NAV_AGENT.height / NAV_CELLS.height),
    walkableClimb: Math.floor(NAV_AGENT.climb / NAV_CELLS.height),
    walkableSlopeAngle: NAV_AGENT.slope,
  };
  if (soup.indices.length === 0) return { ok: false, why: 'The space has no ground or solids to walk on' };
  const tiled = extentOf(soup) > NAV_CELLS.solo;
  const made = tiled
    ? generateTiledNavMesh(soup.positions, soup.indices, { ...config, tileSize: NAV_CELLS.tile })
    : generateSoloNavMesh(soup.positions, soup.indices, config);
  if (!made.success) return { ok: false, why: made.error };
  const navmesh = exportNavMesh(made.navMesh);
  made.navMesh.destroy();
  return { ok: true, navmesh, tiled };
}

/** One NPC in the crowd: where it is, how it moves, and where it is going. */
export interface Agent {
  at(): Vec3;
  velocity(): Vec3;
  /** Walks to the navmesh's point nearest `to`, which it returns; null when there is none near. */
  walkTo(to: Vec3): Vec3 | null;
  stop(): void;
  /** Stands here at once: a load, or the player for the others to go round. */
  place(at: Vec3): void;
  readonly index: number;
}

export interface NavCrowd {
  add(at: Vec3, radius: number, height: number, still?: boolean): Agent;
  remove(agent: Agent): void;
  step(dt: number): void;
  free(): void;
}

export interface NavWorld {
  closest(p: Vec3): Vec3 | null;
  /** The corners from one point to another along the navmesh, both ends on it; null for no road. */
  path(from: Vec3, to: Vec3): Vec3[] | null;
  crowd(): NavCrowd;
  /** The navmesh drawn as triangles, with its tiles and polygons counted. */
  debug(): { positions: number[]; indices: number[]; tiles: number; polygons: number };
  free(): void;
}

function crowdOf(navMesh: NavMesh, query: NavMeshQuery): NavCrowd {
  const crowd = new Crowd(navMesh, { maxAgents: MOST_AGENTS, maxAgentRadius: 0.6 });
  const agentOf = (raw: CrowdAgent): Agent => ({
    index: raw.agentIndex,
    at: () => vec(raw.position()),
    velocity: () => vec(raw.velocity()),
    walkTo(to) {
      const found = query.findClosestPoint(v(to), reach);
      if (!found.success) return null;
      raw.requestMoveTarget(found.point);
      return vec(found.point);
    },
    stop: () => raw.resetMoveTarget(),
    place: (at) => raw.teleport(v(at)),
  });
  return {
    // A still agent (the player) is only gone round: it steers nothing itself.
    add: (at, radius, height, still = false) =>
      agentOf(
        crowd.addAgent(v(at), {
          radius,
          height,
          maxSpeed: still ? 0 : NPC_SPEED,
          maxAcceleration: still ? 0 : NPC_ACCELERATION,
          separationWeight: 2,
          updateFlags: still ? 0 : 7,
        }),
      ),
    remove: (agent) => crowd.removeAgent(agent.index),
    step: (dt) => crowd.update(dt),
    free: () => crowd.destroy(),
  };
}

/** A navmesh from Recast's export, for the walk and the editor's view. */
export function openNav(navmesh: Uint8Array): NavWorld {
  const imported = importNavMesh(navmesh);
  const navMesh = imported.navMesh;
  const query = new NavMeshQuery(navMesh);
  const closest = (p: Vec3): Vec3 | null => {
    const found = query.findClosestPoint(v(p), reach);
    return found.success ? vec(found.point) : null;
  };
  return {
    closest,
    path(from, to) {
      const found = query.computePath(v(from), v(to), reach);
      return found.success && found.path.length > 0 ? found.path.map(vec) : null;
    },
    crowd: () => crowdOf(navMesh, query),
    debug() {
      const [positions, indices] = getNavMeshPositionsAndIndices(navMesh);
      let [tiles, polygons] = [0, 0];
      for (let i = 0; i < navMesh.getMaxTiles(); i++) {
        const header = navMesh.getTile(i).header();
        if (!header) continue;
        tiles++;
        polygons += header.polyCount();
      }
      return { positions, indices, tiles, polygons };
    },
    free() {
      query.destroy();
      navMesh.destroy();
    },
  };
}

/** What nav.js leaves for the walk and the bake worker. */
export interface NavLib {
  readyNav: typeof readyNav;
  bakeSoup: typeof bakeSoup;
  openNav: typeof openNav;
}

export const NAV_LIB: NavLib = { readyNav, bakeSoup, openNav };
