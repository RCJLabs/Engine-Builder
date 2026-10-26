/**
 * A space's map as the Map screen draws it (M6.6, D78, docs/specs/markers.md#in-play): its baked
 * image and bounds from the pack, or plain ground round its objects; a pin where the sim last heard
 * the player stood, or the spawn point they arrive at; and a pin for each of the tracked quest's
 * targets here, or the door it stands in at, found as the walk's markers are (markers.ts). Plain
 * functions of the pack's world, built into walk.js, so the page's host carries none of them.
 */
import type { SpaceJson } from '@eb/compiler';
import { doorsOf, type PackWorld } from '@eb/core';
import type { MapAsk, MapPin, SpaceMapShown } from '@eb/ui';
import type { Vec3 } from '../spaces/vec.ts';
import { objectPlaces } from './goals.ts';
import { actorPlacesOf } from './markerStage.ts';
import { type MarkerWorld, markerPoints } from './markers.ts';
import { partsOf, spawnOf } from './solids.ts';

/** Ground round the objects, so none sits on the map's edge, as a bake's bounds have it. */
export const AROUND = 4;

type Bounds = readonly [number, number, number, number];

/** The square holding every point with `around` metres to spare, centred on them. */
export function squareRound(points: readonly (readonly [number, number])[], around = AROUND): Bounds {
  if (points.length === 0) return [-around, -around, around, around];
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const half = Math.max(x1 - x0, z1 - z0) / 2 + around;
  const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
  return [cx - half, cz - half, cx + half, cz + half];
}

const MIME: Readonly<Record<string, string>> = { webp: 'image/webp', png: 'image/png' };

/** The baked image as a URL the page can draw: the pack holds it base64. */
function imageOf(world: PackWorld, path: string): string | undefined {
  const data = world.files[path];
  const mime = MIME[path.slice(path.lastIndexOf('.') + 1)];
  return data === undefined || mime === undefined ? undefined : `data:${mime};base64,${data}`;
}

// A pin is drawn, not walked to: millimetres and tenths of a degree, so a turn through a quaternion reads as written.
const mm = (n: number) => Math.round(n * 1000) / 1000;
const flat = (at: Vec3): [number, number] => [mm(at[0]), mm(at[2])];

export function mapOf(world: PackWorld, ask: MapAsk): SpaceMapShown {
  const space = world.spaces[ask.space] as SpaceJson | undefined;
  if (!space) return { space: ask.space, bounds: squareRound([]), pins: [] };
  const prefabs = new Map(Object.entries(world.prefabs).map(([id, value]) => [id, value as SpaceJson]));
  const places = objectPlaces(space, prefabs);
  const actors = actorPlacesOf(world);
  const markerWorld: MarkerWorld = {
    here: ask.space,
    doors: doorsOf({ uses: world.uses ?? {}, triggers: world.triggers }),
    place: (path) => places.get(path),
    actor: (id) => {
      const placed = actors.get(id);
      if (!placed) return undefined;
      if (placed.space !== ask.space) return { space: placed.space };
      const heard = ask.npcs?.[id]?.feet;
      const at = heard ? ([heard[0], heard[1], heard[2]] as Vec3) : places.get(placed.path);
      return { space: placed.space, ...(at ? { at } : {}), height: 0 };
    },
  };
  const targets = markerPoints(ask.markers, markerWorld).map(
    (point): MapPin => ({
      kind: point.door === undefined ? 'target' : 'door',
      at: flat(point.at),
      quest: point.quest,
      objective: point.objective,
      text: point.text,
    }),
  );
  const spawn = ask.at ? undefined : spawnOf(partsOf(space, prefabs, () => null, new Set()).spawns, ask.arrive);
  const stood = ask.at ?? (spawn ? { feet: spawn.at, yaw: spawn.yaw } : undefined);
  const player: MapPin[] = stood
    ? [{ kind: 'player', at: [mm(stood.feet[0]), mm(stood.feet[2])], yaw: Math.round(stood.yaw * 10) / 10 }]
    : [];
  const pins = [...player, ...targets];
  const map = world.maps?.[ask.space];
  const image = map ? imageOf(world, map.image) : undefined;
  return {
    space: ask.space,
    bounds: map ? map.bounds : squareRound([...[...places.values()].map(flat), ...pins.map((p) => p.at)]),
    ...(image ? { image } : {}),
    pins,
  };
}
