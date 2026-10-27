/**
 * What the world module reads of a tilemap (M7.2, D84, docs/specs/tilemaps.md#facts): whether one
 * object sees another, and the cover one has against another. An object is a path in the space; a
 * placed actor's object stands where its NPC last arrived, when it has arrived somewhere, else where it
 * was placed. Off the map, or in a space with no tilemap, nothing is seen and there is no cover.
 */
import type { WorldData } from '../types.ts';
import { coverFrom } from './cover.ts';
import { type Cover, gridOf, type Tile } from './grid.ts';
import { lineOfSight } from './sight.ts';

/** What the facts read of the world's slice: the player's space and where each NPC last arrived. */
export interface SliceSeen {
  readonly space: string;
  readonly npcs: Readonly<Record<string, { readonly space: string; readonly arrived?: string }>>;
}

const own = <T>(map: Readonly<Record<string, T>> | undefined, key: string): T | undefined =>
  map !== undefined && Object.hasOwn(map, key) ? map[key] : undefined;

/** The tile an object of a space stands on, as the sim knows it now. */
export function tileOf(world: WorldData, slice: SliceSeen, space: string, object: string): Tile | undefined {
  const tiles = own(world.tiles, space);
  if (!tiles) return undefined;
  const actor = Object.keys(world.actors).find((id) => {
    const placed = world.actors[id];
    return placed?.space === space && placed.path === object;
  });
  const npc = actor === undefined ? undefined : own(slice.npcs, actor);
  const arrived = npc?.space === space ? npc.arrived : undefined;
  return own(tiles.places, arrived ?? object);
}

const spaceIn = (slice: SliceSeen, args: Readonly<Record<string, unknown>>) =>
  typeof args.space === 'string' ? args.space : slice.space;

/** `world.sees(space, from, to)`: a line of sight between the two objects' tiles. */
export function sees(world: WorldData, slice: SliceSeen, args: Readonly<Record<string, unknown>>): boolean {
  const space = spaceIn(slice, args);
  const tiles = own(world.tiles, space);
  if (!tiles || typeof args.from !== 'string' || typeof args.to !== 'string') return false;
  const from = tileOf(world, slice, space, args.from);
  const to = tileOf(world, slice, space, args.to);
  return from !== undefined && to !== undefined && lineOfSight(gridOf(tiles), from, to);
}

/** `world.cover(space, at, from)`: the cover the first object has against the second. */
export function cover(world: WorldData, slice: SliceSeen, args: Readonly<Record<string, unknown>>): Cover {
  const space = spaceIn(slice, args);
  const tiles = own(world.tiles, space);
  if (!tiles || typeof args.at !== 'string' || typeof args.from !== 'string') return 'none';
  const at = tileOf(world, slice, space, args.at);
  const from = tileOf(world, slice, space, args.from);
  return at !== undefined && from !== undefined ? coverFrom(gridOf(tiles), at, from) : 'none';
}
