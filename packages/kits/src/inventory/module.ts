/**
 * The inventory kit's module (M3.3, D41, docs/specs/kits.md): the party's bag, the effects that
 * fill and empty it, and loot tables rolled into it. Items are read from content every time, so
 * an item's value or limit changed by an update reaches every save. Since M6.1 (D73), each actor's
 * bag too, named by an effect's `actor` (bags.ts).
 */
import { defineModule, type Effect, type ModuleContext, type PreviewContext } from '@eb/core';
import { draw, entryKind, liveEntries, lootTable, MAX_DEPTH } from '../loot/draw.ts';
import { ACTOR } from '../stats/types.ts';
import { bagOf, bagToWrite, ofWhom, whose } from './bags.ts';
import { itemRecord, room } from './items.ts';
import { INVENTORY, type InventorySlice, ITEM, type ItemRecord, rangeOf } from './types.ts';

/** An effect's `count`: 1 when left out, else a whole number of at least 1. */
function countOf(effect: Effect): number {
  const count = effect.count ?? 1;
  if (!Number.isSafeInteger(count) || (count as number) < 1) {
    throw new Error(`${effect.effect}: "count" is a whole number, 1 or more`);
  }
  return count as number;
}

/** The party's events, or an actor's (its own three, since every event's args are always given). */
const said = (actor: string | undefined, event: 'gained' | 'lost' | 'full') =>
  actor === undefined ? event : (`actor-${event}` as const);

/** Adds what fits into the party's bag or an actor's; what doesn't is lost, and said to be. */
function give(ctx: ModuleContext<InventorySlice>, actor: string | undefined, id: string, count: number): void {
  const have = bagOf(ctx.content, ctx.read(), actor)[id] ?? 0;
  const fits = room(itemRecord(ctx.content, id), have, count);
  if (fits > 0) {
    bagToWrite(ctx, actor)[id] = have + fits;
    ctx.emit(said(actor, 'gained'), { ...ofWhom(actor), item: id, count: fits });
  }
  if (fits < count) ctx.emit(said(actor, 'full'), { ...ofWhom(actor), item: id, lost: count - fits });
}

function take(ctx: ModuleContext<InventorySlice>, effect: Effect) {
  const id = effect.item as string;
  itemRecord(ctx.content, id);
  const actor = whose(ctx.content, effect.actor);
  const need = countOf(effect);
  const have = bagOf(ctx.content, ctx.read(), actor)[id] ?? 0;
  if (have < need) return ctx.refuse('not-enough', { ...ofWhom(actor), item: id, have, need });
  const bag = bagToWrite(ctx, actor);
  if (have === need) delete bag[id];
  else bag[id] = have - need;
  ctx.emit(said(actor, 'lost'), { ...ofWhom(actor), item: id, count: need });
}

/** Rolls a table into a bag: each table draws from a stream of its own, so new tables shift only their own rolls. */
function roll(ctx: ModuleContext<InventorySlice>, actor: string | undefined, id: string, depth: number): void {
  if (depth > MAX_DEPTH) throw new Error(`roll-loot: tables nest more than ${MAX_DEPTH} deep at "${id}"`);
  const table = lootTable(ctx.content, id);
  const live = liveEntries(table, (condition) => ctx.check(condition) === true);
  for (const { entry, count } of draw(table, live, ctx.rng(`loot-${id}`))) {
    const { kind, id: target } = entryKind(entry);
    if (kind === 'item') give(ctx, actor, target, count);
    else if (kind === 'resource') ctx.apply({ effect: 'add-resource', resource: target, by: count });
    else for (let i = 0; i < count; i++) roll(ctx, actor, target, depth + 1);
  }
}

function previewGive(ctx: PreviewContext<InventorySlice>, effect: Effect) {
  const item = effect.item as string;
  const actor = whose(ctx.content, effect.actor);
  const count = countOf(effect);
  const from = bagOf(ctx.content, ctx.read(), actor)[item] ?? 0;
  const fits = room(itemRecord(ctx.content, item), from, count);
  return { ...ofWhom(actor), item, from, to: from + fits, lost: count - fits };
}

function previewTake(ctx: PreviewContext<InventorySlice>, effect: Effect) {
  const item = effect.item as string;
  itemRecord(ctx.content, item);
  const actor = whose(ctx.content, effect.actor);
  const need = countOf(effect);
  const from = bagOf(ctx.content, ctx.read(), actor)[item] ?? 0;
  return from < need
    ? { ...ofWhom(actor), item, from, to: from, refused: 'not-enough' }
    : { ...ofWhom(actor), item, from, to: from - need };
}

/** The odds a roll would read now: the same entries, weights and counts. */
function previewRoll(ctx: PreviewContext<InventorySlice>, effect: Effect, depth = 0): Record<string, unknown> {
  const id = effect.table as string;
  if (depth > MAX_DEPTH) throw new Error(`roll-loot: tables nest more than ${MAX_DEPTH} deep at "${id}"`);
  const table = lootTable(ctx.content, id);
  const live = liveEntries(table, (condition) => ctx.check(condition) === true);
  const nothing = table.nothing ?? 0;
  return {
    ...ofWhom(whose(ctx.content, effect.actor)),
    table: id,
    picks: rangeOf(table.picks, 1),
    nothing,
    total: live.reduce((sum, entry) => sum + entry.weight, nothing),
    entries: live.map((entry) => {
      const { kind, id: target } = entryKind(entry);
      const shown = { [kind]: target, weight: entry.weight, count: rangeOf(entry.count, 1) };
      return kind === 'table'
        ? { ...shown, odds: previewRoll(ctx, { effect: 'roll-loot', table: target, actor: effect.actor }, depth + 1) }
        : shown;
    }),
  };
}

const ITEM_ARG = { item: { type: 'ref', to: ITEM } } as const;
const ACTOR_ARG = { actor: { type: 'ref', to: ACTOR } } as const;
const COUNT = { type: 'int', min: 1 } as const;

export const inventoryKit = defineModule<InventorySlice>({
  id: INVENTORY,
  init: () => ({ bag: {}, bags: {} }),
  // Version 2 (M6.1) adds `bags`: a version 1 save had no bag but the party's, so every actor's is its `carries`.
  version: 2,
  migrate: { 2: (slice) => ({ ...(slice as object), bags: {} }) },
  facts: {
    count: {
      args: ITEM_ARG,
      domain: { type: 'int', min: 0 },
      label: 'carried',
      read: ({ state }, { item }) => state.bag[item as string] ?? 0,
    },
    tagged: {
      args: { tag: { type: 'text' } },
      domain: { type: 'int', min: 0 },
      label: 'carried with the tag',
      // An item a content update took away still sits in old bags: it counts for no tag.
      read: ({ state, content }, { tag }) =>
        Object.entries(state.bag).reduce((sum, [id, count]) => {
          const item = content.has(ITEM, id) ? (content.get(ITEM, id) as ItemRecord) : undefined;
          return item?.tags?.includes(tag as string) ? sum + count : sum;
        }, 0),
    },
    carried: {
      args: { ...ACTOR_ARG, ...ITEM_ARG },
      domain: { type: 'int', min: 0 },
      label: 'carried by',
      read: ({ state, content }, { actor, item }) => bagOf(content, state, whose(content, actor))[item as string] ?? 0,
    },
  },
  effects: {
    'give-item': {
      run: (ctx, effect) => {
        itemRecord(ctx.content, effect.item);
        give(ctx, whose(ctx.content, effect.actor), effect.item as string, countOf(effect));
      },
      preview: previewGive,
    },
    'take-item': { run: take, preview: previewTake },
    'roll-loot': {
      run: (ctx, effect) => roll(ctx, whose(ctx.content, effect.actor), effect.table as string, 0),
      preview: (ctx, effect) => previewRoll(ctx, effect),
    },
  },
  events: {
    gained: { args: { ...ITEM_ARG, count: COUNT }, label: 'Items go into the bag' },
    lost: { args: { ...ITEM_ARG, count: COUNT }, label: 'Items leave the bag' },
    full: { args: { ...ITEM_ARG, lost: COUNT }, label: 'The bag can’t hold all of it' },
    'actor-gained': { args: { ...ACTOR_ARG, ...ITEM_ARG, count: COUNT }, label: 'Items go into an actor’s bag' },
    'actor-lost': { args: { ...ACTOR_ARG, ...ITEM_ARG, count: COUNT }, label: 'Items leave an actor’s bag' },
    'actor-full': { args: { ...ACTOR_ARG, ...ITEM_ARG, lost: COUNT }, label: 'An actor’s bag can’t hold all of it' },
  },
});
