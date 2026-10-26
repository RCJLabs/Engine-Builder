/**
 * A quest's slots that find in the world, checked (M6.7, D79, docs/specs/radiant.md#checks): E088 for
 * one that can't be read, and W127 for one nothing in the project can fill, read from the spaces' tags.
 */
import type { Slot } from '@eb/kits';
import type { DiagnosticCode } from './diagnostics.ts';

type Report = (code: DiagnosticCode, path: string, message: string) => void;

/** Each space's tags, each tagged object's by space and path, and each placed actor's, through prefabs. */
export interface SpaceTags {
  readonly spaces: ReadonlyMap<string, readonly string[]>;
  readonly objects: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
  readonly actors: ReadonlyMap<string, readonly string[]>;
}

const SPACE = 'space';
const OBJECT = 'object';
const ACTOR = 'actor';

/** Whether the slot finds in the world: a space, an object, or an actor asked for by its space or tags. */
export const findsInWorld = (slot: Pick<Slot, 'type' | 'in' | 'tags'>): boolean =>
  slot.type === SPACE ||
  slot.type === OBJECT ||
  (slot.type === ACTOR && (slot.in !== undefined || slot.tags !== undefined));

const carries = (tags: readonly string[], wanted: readonly string[]) => wanted.every((tag) => tags.includes(tag));
const named = (tags: readonly string[]) => tags.map((tag) => `"${tag}"`).join(' and ');

/**
 * The fields a world slot can't be read without (E088), and whether anything in the project carries
 * its tags (W127). `tags` is undefined where the spaces aren't read: then only the slot's own fields
 * are checked.
 */
export function checkWorldSlot(slots: readonly Slot[], i: number, report: Report, tags: SpaceTags | undefined): void {
  const slot = slots[i] as Slot;
  const at = `/slots/${i}`;
  const world = findsInWorld(slot);
  if (slot.pick === 'nearest' && !world) {
    report(
      'E088',
      `${at}/pick`,
      'Nearest counts doors to a space: only a space, an object or an actor found in the world has one',
    );
  }
  if (slot.in !== undefined && slot.type !== OBJECT && slot.type !== ACTOR) {
    report('E088', `${at}/in`, `In is where an object or an actor is found: a ${slot.type} slot has none`);
  }
  if (slot.tags !== undefined && !world) {
    report('E088', `${at}/tags`, `Tags are what a space, an object or an actor carries: not a ${slot.type}`);
  }
  if (!world) return;
  if (slot.record !== undefined)
    report(
      'E088',
      `${at}/record`,
      'A slot that finds in the world holds what it finds: give Tags or Where, not Record',
    );
  if (tags !== undefined && tags.spaces.size === 0) {
    report('E088', `${at}/type`, `This project has no spaces for a ${slot.type} slot to find in`);
    return;
  }
  if (slot.type === OBJECT && slot.in === undefined)
    report('E088', `${at}/in`, 'An object is found in a space: give In');
  if (slot.type === OBJECT && (slot.tags ?? []).length === 0)
    report('E088', `${at}/tags`, 'An object is found by its tags: give Tags');
  const space = inSpace(slots, i, report);
  if (tags !== undefined && space !== null) unfillable(slot, space, at, tags, report);
}

/**
 * Where a slot's In says it is found: a space's id, an earlier space slot, or undefined for a slot with
 * no In; null when In names no slot before it that holds a space (E088).
 */
function inSpace(slots: readonly Slot[], i: number, report: Report): Slot | string | undefined | null {
  const slot = slots[i] as Slot;
  if (slot.in === undefined) return undefined;
  if (!slot.in.startsWith('@')) return slot.in;
  const name = slot.in.slice(1);
  const before = slots.slice(0, i).find((s) => s.id === name);
  if (before === undefined) {
    const after = slots.some((s) => s.id === name);
    report(
      'E088',
      `/slots/${i}/in`,
      after ? `@${name} is filled after this slot: In names one before it` : `This quest has no slot ${name}`,
    );
    return null;
  }
  if (before.type !== SPACE) {
    report('E088', `/slots/${i}/in`, `@${name} holds a ${before.type}, not a space`);
    return null;
  }
  return before;
}

/** W127 for a world slot nothing carries the tags of; E088 for In naming a space the project hasn't. */
function unfillable(slot: Slot, inside: Slot | string | undefined, at: string, tags: SpaceTags, report: Report) {
  const wanted = slot.tags ?? [];
  if (typeof inside === 'string' && !tags.spaces.has(inside)) {
    report('E088', `${at}/in`, `No space "${inside}"`);
    return;
  }
  // The spaces it can be found in: one named, those an earlier space slot can find, or any.
  const spaces =
    typeof inside === 'string'
      ? [inside]
      : inside === undefined
        ? [...tags.spaces.keys()]
        : [...tags.spaces].filter(([, carried]) => carries(carried, inside.tags ?? [])).map(([id]) => id);
  const found =
    slot.type === SPACE
      ? [...tags.spaces.values()].some((carried) => carries(carried, wanted))
      : slot.type === OBJECT
        ? spaces.some((space) =>
            [...(tags.objects.get(space)?.values() ?? [])].some((carried) => carries(carried, wanted)),
          )
        : [...tags.actors].some(([, carried]) => carries(carried, wanted));
  if (found || wanted.length === 0) return;
  const where =
    slot.type === SPACE
      ? 'No space carries'
      : `Nothing ${slot.type === OBJECT ? 'in the spaces it can be in' : 'placed'} carries`;
  report('W127', `${at}/tags`, `${where} the tags ${named(wanted)}, so this slot can never be filled`);
}
