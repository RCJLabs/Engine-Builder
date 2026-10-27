/**
 * What the world module reads of a building (M7.3, D85, docs/specs/rooms.md#facts): the room an object
 * stands in. An object is a path in the space; a placed actor's object stands where its NPC last arrived,
 * when it has arrived somewhere, else where it was placed, as the tile facts read it.
 */
import type { WorldData } from '../types.ts';
import { type Place, roomAt } from './building.ts';

/** What the fact reads of the world's slice: the player's space and where each NPC last arrived. */
export interface SliceStood {
  readonly space: string;
  readonly npcs: Readonly<Record<string, { readonly space: string; readonly arrived?: string }>>;
}

const own = <T>(map: Readonly<Record<string, T>> | undefined, key: string): T | undefined =>
  map !== undefined && Object.hasOwn(map, key) ? map[key] : undefined;

/** The place an object of a space stands on in its building, as the sim knows it now. */
export function placeIn(world: WorldData, slice: SliceStood, space: string, object: string): Place | undefined {
  const building = own(world.buildings, space);
  if (!building) return undefined;
  const actor = Object.keys(world.actors).find((id) => {
    const placed = world.actors[id];
    return placed?.space === space && placed.path === object;
  });
  const npc = actor === undefined ? undefined : own(slice.npcs, actor);
  const arrived = npc?.space === space ? npc.arrived : undefined;
  return own(building.places, arrived ?? object);
}

/** `world.room(space, of)`: the id of the room the object stands in, or "" when it stands in none. */
export function room(world: WorldData, slice: SliceStood, args: Readonly<Record<string, unknown>>): string {
  const space = typeof args.space === 'string' ? args.space : slice.space;
  const building = own(world.buildings, space);
  if (!building || typeof args.of !== 'string') return '';
  const place = placeIn(world, slice, space, args.of);
  return place === undefined ? '' : roomAt(building, place);
}
