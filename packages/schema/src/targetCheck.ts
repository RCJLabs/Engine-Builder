/**
 * A quest's objectives' targets against the spaces and actors (M6.6, D78, docs/specs/markers.md#targets):
 * E086 for one that names a space, an object, an actor or a slot that isn't one, or is neither an
 * actor nor a space; W155 for an actor, by id, placed in no space, whose marker can't show. Only
 * targets as written: one read from a count names what the count names. Since M6.7 (D79) a space can
 * be `@slot` of a space slot and an object `@slot` of an object slot In it.
 */
import type { RecordIndex } from '@eb/core';
import type { Walkers } from './worldCheck.ts';

type Report = (code: 'E086' | 'W155', path: string, message: string) => void;

export interface TargetContext {
  readonly records: Pick<RecordIndex, 'has'>;
  /** Each space's object paths, through prefabs. */
  readonly objects: ReadonlyMap<string, ReadonlySet<string>>;
  /** Where each placed actor stands. */
  readonly walkers: Walkers;
}

interface QuestShape {
  readonly slots?: readonly { readonly id: string; readonly type: string; readonly in?: string }[];
  readonly stages: readonly { readonly objectives?: readonly { readonly target?: unknown }[] }[];
}

const ACTOR = 'actor';
/** "a space", "an object": a slot's type with its article. */
const aType = (type: string) => `${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type}`;
const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function checkActor(actor: string, quest: QuestShape, at: string, ctx: TargetContext, report: Report): void {
  if (actor.startsWith('@')) {
    const slot = quest.slots?.find((s) => s.id === actor.slice(1));
    if (!slot) report('E086', at, `This quest has no slot "${actor.slice(1)}"`);
    else if (slot.type !== ACTOR) report('E086', at, `The slot "${slot.id}" holds ${aType(slot.type)}, not an actor`);
    return;
  }
  if (!ctx.records.has(ACTOR, actor)) report('E086', at, `No actor "${actor}"`);
  else if (!ctx.walkers.has(actor))
    report('W155', at, `The actor "${actor}" stands in no space, so the marker can't show`);
}

/** A target's space and object named by slots (M6.7): a space slot, and an object slot In it. */
function checkPlaceSlots(quest: QuestShape, space: string, object: unknown, at: string, report: Report): boolean {
  const slotOf = (name: string) => quest.slots?.find((s) => s.id === name.slice(1));
  if (space.startsWith('@')) {
    const slot = slotOf(space);
    if (!slot) report('E086', `${at}/space`, `This quest has no slot "${space.slice(1)}"`);
    else if (slot.type !== 'space')
      report('E086', `${at}/space`, `The slot "${slot.id}" holds ${aType(slot.type)}, not a space`);
  }
  if (typeof object === 'string' && object.startsWith('@')) {
    const slot = slotOf(object);
    if (!slot) report('E086', `${at}/object`, `This quest has no slot "${object.slice(1)}"`);
    else if (slot.type !== 'object')
      report('E086', `${at}/object`, `The slot "${slot.id}" holds ${aType(slot.type)}, not an object`);
    else if (slot.in !== space)
      report('E086', `${at}/object`, `The slot "${slot.id}" is found in ${slot.in ?? 'no space'}, not ${space}`);
    return true;
  }
  return space.startsWith('@');
}

function checkPlace(
  quest: QuestShape,
  target: Readonly<Record<string, unknown>>,
  at: string,
  ctx: TargetContext,
  report: Report,
): void {
  const { space, object } = target;
  if (typeof space !== 'string') {
    report('E086', at, 'An object is in a space: give the space too');
    return;
  }
  if (checkPlaceSlots(quest, space, object, at, report)) return;
  const objects = ctx.objects.get(space);
  if (!objects) report('E086', `${at}/space`, `No space "${space}"`);
  else if (typeof object === 'string' && !objects.has(object)) {
    report('E086', `${at}/object`, `The space "${space}" has no object "${object}"`);
  }
}

/** Each objective's written target, at its path in the quest. */
export function checkTargets(quest: QuestShape, ctx: TargetContext, report: Report): void {
  quest.stages.forEach((stage, s) => {
    (stage.objectives ?? []).forEach((objective, o) => {
      const target = objective.target;
      if (target === undefined) return;
      const at = `/stages/${s}/objectives/${o}/target`;
      if (!isObject(target)) return;
      const actor = target.actor;
      if (typeof actor === 'string') {
        if (target.space !== undefined || target.object !== undefined) {
          report('E086', at, 'A target is an actor, or a space and an object in it: not both');
        } else checkActor(actor, quest, `${at}/actor`, ctx, report);
      } else if (target.space === undefined && target.object === undefined) {
        report('E086', at, 'Give an actor, or a space and maybe an object in it');
      } else checkPlace(quest, target, at, ctx, report);
    });
  });
}
