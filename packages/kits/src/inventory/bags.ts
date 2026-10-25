/**
 * Whose bag (M6.1, D73, docs/specs/npcs.md#bags): the party's, or an actor's. An actor's bag is its
 * record's `carries` until anything in it changes; from then on the slice keeps the whole bag, so
 * a content update to `carries` still reaches every save in which that bag never changed.
 */
import type { ModuleContext, RecordStore } from '@eb/core';
import { ACTOR } from '../stats/types.ts';
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

/** An event's or a preview's fields for whose bag: none for the party's. */
export const ofWhom = (actor: string | undefined): { actor?: string } => (actor === undefined ? {} : { actor });
