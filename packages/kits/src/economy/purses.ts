/**
 * Purses (M6.8, D80, docs/specs/barter.md#purses): what an actor holds of each resource, their record's
 * `purse` until it changes and the slice's from then on, so a content update reaches every save in
 * which that purse never changed. Within the resource's bounds, as the party's amounts are.
 */
import type { DeepReadonly, ModuleContext, RecordStore } from '@eb/core';
import { ACTOR } from '../stats/types.ts';
import { highest, lowest, resourceRecord } from './amounts.ts';
import type { EconomySlice, PursedActor } from './types.ts';

/** The actor's record, or a thrown error: validation stops a reference to a missing actor. */
export function pursedActor(content: RecordStore, actor: unknown): PursedActor {
  if (typeof actor !== 'string' || !content.has(ACTOR, actor)) throw new Error(`No actor "${String(actor)}"`);
  return content.get(ACTOR, actor) as PursedActor;
}

/** What the actor holds of the resource now. */
export function purseOf(slice: DeepReadonly<EconomySlice>, content: RecordStore, actor: string, id: string): number {
  const resource = resourceRecord(content, id);
  const held = slice.purses[actor]?.[id] ?? pursedActor(content, actor).purse?.[id] ?? 0;
  return Math.min(Math.max(held, lowest(resource)), highest(resource));
}

/**
 * Adds `by` to the actor's purse (below 0 takes away): past the highest, the rest is lost; below the
 * lowest, it refuses `cant-pay`, as the actor can't meet it.
 */
export function addToPurse(ctx: ModuleContext<EconomySlice>, actor: string, id: string, by: number): void {
  const resource = resourceRecord(ctx.content, id);
  const from = purseOf(ctx.read(), ctx.content, actor, id);
  if (from + by < lowest(resource)) {
    ctx.refuse('cant-pay', { actor, resource: id, have: from, need: -by });
    return;
  }
  const to = Math.min(from + by, highest(resource));
  if (to === from) return;
  const purses = ctx.write().purses as Record<string, Record<string, number>>;
  purses[actor] = { ...(purses[actor] ?? pursedActor(ctx.content, actor).purse ?? {}), [id]: to };
}

/** The actor's purse back to their record's. */
export function resetPurse(ctx: ModuleContext<EconomySlice>, actor: string): void {
  if (ctx.read().purses[actor] === undefined) return;
  delete (ctx.write().purses as Record<string, unknown>)[actor];
}
