/**
 * Slots that find in the world (M6.7, D79, docs/specs/radiant.md#slots-that-find-in-the-world): a
 * space by its tags, an object in it, or an actor placed there. Plain functions of the pack's places
 * and of the world module's facts: what was taken, who has fallen, and how many doors away a space is.
 */
import type { FactArgs, RecordStore, WorldPlaces } from '@eb/core';
import { own } from '../own.ts';
import { ACTOR } from '../stats/types.ts';
import type { Slot } from './types.ts';

export const SPACE = 'space';
export const OBJECT = 'object';

type Filled = Readonly<Record<string, string>>;
type WorldSlot = Pick<Slot, 'type' | 'in' | 'tags'>;

interface Facts {
  fact(id: string, args?: FactArgs): unknown;
}

/** Whether the slot finds in the world: a space, an object, or an actor asked for by its space or tags. */
export const findsInWorld = (slot: WorldSlot): boolean =>
  slot.type === SPACE ||
  slot.type === OBJECT ||
  (slot.type === ACTOR && (slot.in !== undefined || slot.tags !== undefined));

/** The space a slot's In names, an `@slot` read from the slots filled: undefined while that one isn't. */
export function spaceIn(slot: WorldSlot, filled: Filled | undefined): string | undefined {
  if (slot.in === undefined) return undefined;
  return slot.in.startsWith('@') ? own(filled ?? {}, slot.in.slice(1)) : slot.in;
}

const carries = (tags: readonly string[], wanted: readonly string[] | undefined) =>
  (wanted ?? []).every((tag) => tags.includes(tag));

/** An actor's tags: those of the object that places it. */
const actorTags = (places: WorldPlaces, actor: string): readonly string[] => {
  const placed = own(places.actors, actor);
  return placed === undefined ? [] : (own(own(places.objects, placed.space) ?? {}, placed.path)?.tags ?? []);
};

/**
 * Everything in the world the slot could hold before its Where, by id or path, sorted: what carries
 * its tags, in its space, neither taken nor fallen. Nothing comes back in M6.7 (D79).
 */
export function worldCandidates(places: WorldPlaces, slot: Slot, filled: Filled, facts: Facts): string[] {
  if (slot.type === SPACE) {
    return Object.keys(places.spaces)
      .sort()
      .filter((id) => carries(own(places.spaces, id)?.tags ?? [], slot.tags));
  }
  const space = spaceIn(slot, filled);
  if (slot.type === OBJECT) {
    const found = space === undefined ? undefined : own(places.objects, space);
    if (found === undefined) return [];
    return Object.keys(found)
      .sort()
      .filter(
        (path) =>
          carries(own(found, path)?.tags ?? [], slot.tags) &&
          facts.fact('world.taken', { space, object: path }) !== true,
      );
  }
  if (slot.in !== undefined && space === undefined) return [];
  return Object.keys(places.actors)
    .sort()
    .filter(
      (actor) =>
        (space === undefined || own(places.actors, actor)?.space === space) &&
        carries(actorTags(places, actor), slot.tags) &&
        facts.fact('world.npc-down', { actor }) !== true,
    );
}

/** The space a world slot's thing is in, whose doors Nearest counts. */
export function spaceOf(places: WorldPlaces, slot: Slot, filled: Filled, thing: string): string | undefined {
  if (slot.type === SPACE) return thing;
  if (slot.type === OBJECT) return spaceIn(slot, filled);
  return own(places.actors, thing)?.space;
}

/** Whether a world slot's thing is in the world still: a space or an object the pack no longer has is gone. */
export function stillThere(places: WorldPlaces, content: RecordStore, slot: Slot, slots: Filled, thing: string) {
  if (slot.type === SPACE) return own(places.spaces, thing) !== undefined;
  if (slot.type === OBJECT) return own(own(places.objects, spaceIn(slot, slots) ?? '') ?? {}, thing) !== undefined;
  return content.has(slot.type, thing);
}

/** A space's or an object's name as `{slot}` shows it: the space's; the object's, else its path's last id. */
export function placeName(places: WorldPlaces, slot: Slot, slots: Filled, thing: string): string {
  if (slot.type === SPACE) return own(places.spaces, thing)?.name ?? thing;
  const named = own(own(places.objects, spaceIn(slot, slots) ?? '') ?? {}, thing)?.name;
  return named ?? thing.slice(thing.lastIndexOf('/') + 1);
}
