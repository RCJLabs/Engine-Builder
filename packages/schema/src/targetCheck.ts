/**
 * A quest's objectives' targets against the spaces and actors (M6.6, D78, docs/specs/markers.md#targets):
 * E086 for one that names a space, an object, an actor or a slot that isn't one, or is neither an
 * actor nor a space; W155 for an actor, by id, placed in no space, whose marker can't show. Only
 * targets as written: one read from a count names what the count names.
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
  readonly slots?: readonly { readonly id: string; readonly type: string }[];
  readonly stages: readonly { readonly objectives?: readonly { readonly target?: unknown }[] }[];
}

const ACTOR = 'actor';
const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function checkActor(actor: string, quest: QuestShape, at: string, ctx: TargetContext, report: Report): void {
  if (actor.startsWith('@')) {
    const slot = quest.slots?.find((s) => s.id === actor.slice(1));
    if (!slot) report('E086', at, `This quest has no slot "${actor.slice(1)}"`);
    else if (slot.type !== ACTOR) report('E086', at, `The slot "${slot.id}" holds a ${slot.type}, not an actor`);
    return;
  }
  if (!ctx.records.has(ACTOR, actor)) report('E086', at, `No actor "${actor}"`);
  else if (!ctx.walkers.has(actor))
    report('W155', at, `The actor "${actor}" stands in no space, so the marker can't show`);
}

function checkPlace(target: Readonly<Record<string, unknown>>, at: string, ctx: TargetContext, report: Report): void {
  const { space, object } = target;
  if (typeof space !== 'string') {
    report('E086', at, 'An object is in a space: give the space too');
    return;
  }
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
      } else checkPlace(target, at, ctx, report);
    });
  });
}
