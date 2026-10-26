/**
 * Whose bag (M6.1, D73, docs/specs/npcs.md#bags): the party's, or an actor's. An actor's bag is its
 * record's `carries` until anything in it changes; from then on the slice keeps the whole bag, so
 * a content update to `carries` still reaches every save in which that bag never changed. A merchant's
 * bag goes back to its `carries` with the shop's stock on top each time the shop restocks (M6.8).
 */
import type { Effect, ModuleContext, RecordStore } from '@eb/core';
import { ACTOR } from '../stats/types.ts';
import { itemRecord, room } from './items.ts';
import type { InventorySlice } from './types.ts';

/** The fields of an actor the inventory kit reads. */
export interface CarryingActor {
  readonly carries?: Readonly<Record<string, number>>;
}

/** An effect's or a fact's `actor`: undefined for the party's bag, else an actor content has. */
export function whose(content: RecordStore, actor: unknown): string | undefined {
  if (actor === undefined) return undefined;
  if (typeof actor !== 'string' || !content.has(ACTOR, actor)) throw new Error(`No actor "${String(actor)}"`);
  return actor;
}

const carried = (content: RecordStore, actor: string): Readonly<Record<string, number>> =>
  (content.get(ACTOR, actor) as CarryingActor).carries ?? {};

/** The bag as it is now: the party's, the actor's as the slice keeps it, or what it carries in content. */
export function bagOf(
  content: RecordStore,
  state: InventorySlice,
  actor: string | undefined,
): Readonly<Record<string, number>> {
  if (actor === undefined) return state.bag;
  return state.bags[actor] ?? carried(content, actor);
}

/** The bag to change, the actor's copied out of content the first time anything in it changes. */
export function bagToWrite(ctx: ModuleContext<InventorySlice>, actor: string | undefined): Record<string, number> {
  const slice = ctx.write() as { bag: Record<string, number>; bags: Record<string, Record<string, number>> };
  if (actor === undefined) return slice.bag;
  const kept = slice.bags[actor];
  if (kept) return kept;
  const made = { ...carried(ctx.content, actor) };
  slice.bags[actor] = made;
  return made;
}

/**
 * `restock-bag { actor, add }`: the actor's bag back to its `carries`, with `add`'s items on top as far
 * as each fits; with nothing to add, the slice forgets the bag, so it is the record's again.
 */
export function restockBag(ctx: ModuleContext<InventorySlice>, effect: Effect): void {
  const actor = whose(ctx.content, effect.actor);
  if (actor === undefined) throw new Error('restock-bag: give the actor whose bag it is');
  const add = (effect.add ?? {}) as Readonly<Record<string, number>>;
  const bags = (ctx.write() as { bags: Record<string, Record<string, number>> }).bags;
  const items = Object.keys(add).sort();
  if (items.length === 0) {
    delete bags[actor];
    return;
  }
  const bag = { ...carried(ctx.content, actor) };
  for (const item of items) {
    const fits = room(itemRecord(ctx.content, item), bag[item] ?? 0, add[item] as number);
    if (fits > 0) bag[item] = (bag[item] ?? 0) + fits;
  }
  bags[actor] = bag;
}

/** An event's or a preview's fields for whose bag: none for the party's. */
export const ofWhom = (actor: string | undefined): { actor?: string } => (actor === undefined ? {} : { actor });
