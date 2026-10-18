/**
 * Resource amounts (docs/specs/kits.md). Like flags, the slice holds only the amounts that aren't
 * their start, and an amount is read within today's bounds, so a content update to a start or a
 * bound reaches every save.
 */
import type { DeepReadonly, ModuleContext, RecordStore } from '@eb/core';
import { type EconomySlice, RESOURCE, type ResourceRecord } from './types.ts';

/** The resource's record, or a thrown error: validation stops a reference to a missing resource. */
export function resourceRecord(content: RecordStore, id: unknown): ResourceRecord {
  if (typeof id !== 'string' || !content.has(RESOURCE, id)) throw new Error(`No resource "${String(id)}"`);
  return content.get(RESOURCE, id) as ResourceRecord;
}

/** The lowest and highest an amount may be: 0 and no limit when left out. */
export const lowest = (resource: ResourceRecord): number => resource.min ?? 0;
export const highest = (resource: ResourceRecord): number => resource.max ?? Number.POSITIVE_INFINITY;

const within = (resource: ResourceRecord, n: number) => Math.min(Math.max(n, lowest(resource)), highest(resource));

/** What the party holds of the resource now. */
export function amountOf(slice: DeepReadonly<EconomySlice>, content: RecordStore, id: string): number {
  const resource = resourceRecord(content, id);
  return within(resource, slice.amounts[id] ?? resource.start ?? 0);
}

/** Sets an amount, already within its bounds: an amount back at its start leaves the slice. */
function set(ctx: ModuleContext<EconomySlice>, id: string, resource: ResourceRecord, to: number): void {
  const amounts = ctx.write().amounts as Record<string, number>;
  if (to === (resource.start ?? 0)) delete amounts[id];
  else amounts[id] = to;
}

/**
 * Adds `by` (below 0 takes away): past the highest, the rest is lost; below the lowest, it
 * refuses, as a cost the party can't meet. Raises economy/changed by what it really changed.
 */
export function addAmount(ctx: ModuleContext<EconomySlice>, id: string, by: number) {
  if (!Number.isSafeInteger(by)) throw new Error(`add-resource: "by" is a whole number`);
  const resource = resourceRecord(ctx.content, id);
  const from = amountOf(ctx.read(), ctx.content, id);
  if (from + by < lowest(resource)) return ctx.refuse('not-enough', { resource: id, have: from, need: -by });
  const to = Math.min(from + by, highest(resource));
  if (to === from) return;
  set(ctx, id, resource, to);
  ctx.emit('changed', { resource: id, by: to - from });
}

/** A cost's resources in id order, each with a whole amount of 1 or more. */
export function costEntries(cost: unknown): [string, number][] {
  if (typeof cost !== 'object' || cost === null || Array.isArray(cost)) {
    throw new Error('pay-cost: "cost" is { resource: amount }');
  }
  const entries = Object.entries(cost as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [id, n] of entries) {
    if (!Number.isSafeInteger(n) || (n as number) < 1) throw new Error(`pay-cost: ${id} is a whole number, 1 or more`);
  }
  return entries as [string, number][];
}

/** The first resource of the cost the party is short of, or undefined when it can pay all of it. */
export function shortOf(
  slice: DeepReadonly<EconomySlice>,
  content: RecordStore,
  cost: readonly [string, number][],
): { resource: string; have: number; need: number } | undefined {
  for (const [id, need] of cost) {
    const have = amountOf(slice, content, id);
    if (have - need < lowest(resourceRecord(content, id))) return { resource: id, have, need };
  }
  return undefined;
}

/** Pays all of a cost or none of it. */
export function payCost(ctx: ModuleContext<EconomySlice>, cost: unknown) {
  const entries = costEntries(cost);
  const short = shortOf(ctx.read(), ctx.content, entries);
  if (short) return ctx.refuse('cant-afford', short);
  for (const [id, n] of entries) addAmount(ctx, id, -n);
}
