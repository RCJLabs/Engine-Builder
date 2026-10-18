/**
 * The inventory kit's module (M3.3, D41, docs/specs/kits.md): the party's bag, the effects that
 * fill and empty it, and loot tables rolled into it. Items are read from content every time, so
 * an item's value or limit changed by an update reaches every save.
 */
import { defineModule, type Effect, type ModuleContext, type PreviewContext } from '@eb/core';
import { draw, entryKind, liveEntries, lootTable, MAX_DEPTH } from '../loot/draw.ts';
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

/** Adds what fits; what doesn't is lost, and said to be. */
function give(ctx: ModuleContext<InventorySlice>, id: string, count: number): void {
  const have = ctx.read().bag[id] ?? 0;
  const fits = room(itemRecord(ctx.content, id), have, count);
  if (fits > 0) {
    (ctx.write().bag as Record<string, number>)[id] = have + fits;
    ctx.emit('gained', { item: id, count: fits });
  }
  if (fits < count) ctx.emit('full', { item: id, lost: count - fits });
}

function take(ctx: ModuleContext<InventorySlice>, effect: Effect) {
  const id = effect.item as string;
  itemRecord(ctx.content, id);
  const need = countOf(effect);
  const have = ctx.read().bag[id] ?? 0;
  if (have < need) return ctx.refuse('not-enough', { item: id, have, need });
  const bag = ctx.write().bag as Record<string, number>;
  if (have === need) delete bag[id];
  else bag[id] = have - need;
  ctx.emit('lost', { item: id, count: need });
}

/** Rolls a table into the bag: each table draws from a stream of its own, so new tables shift only their own rolls. */
function roll(ctx: ModuleContext<InventorySlice>, id: string, depth: number): void {
  if (depth > MAX_DEPTH) throw new Error(`roll-loot: tables nest more than ${MAX_DEPTH} deep at "${id}"`);
  const table = lootTable(ctx.content, id);
  const live = liveEntries(table, (condition) => ctx.check(condition) === true);
  for (const { entry, count } of draw(table, live, ctx.rng(`loot-${id}`))) {
    const { kind, id: target } = entryKind(entry);
    if (kind === 'item') give(ctx, target, count);
    else if (kind === 'resource') ctx.apply({ effect: 'add-resource', resource: target, by: count });
    else for (let i = 0; i < count; i++) roll(ctx, target, depth + 1);
  }
}

function previewGive(ctx: PreviewContext<InventorySlice>, effect: Effect) {
  const item = effect.item as string;
  const count = countOf(effect);
  const from = ctx.read().bag[item] ?? 0;
  const fits = room(itemRecord(ctx.content, item), from, count);
  return { item, from, to: from + fits, lost: count - fits };
}

function previewTake(ctx: PreviewContext<InventorySlice>, effect: Effect) {
  const item = effect.item as string;
  itemRecord(ctx.content, item);
  const need = countOf(effect);
  const from = ctx.read().bag[item] ?? 0;
  return from < need ? { item, from, to: from, refused: 'not-enough' } : { item, from, to: from - need };
}

/** The odds a roll would read now: the same entries, weights and counts. */
function previewRoll(ctx: PreviewContext<InventorySlice>, effect: Effect, depth = 0): Record<string, unknown> {
  const id = effect.table as string;
  if (depth > MAX_DEPTH) throw new Error(`roll-loot: tables nest more than ${MAX_DEPTH} deep at "${id}"`);
  const table = lootTable(ctx.content, id);
  const live = liveEntries(table, (condition) => ctx.check(condition) === true);
  const nothing = table.nothing ?? 0;
  return {
    table: id,
    picks: rangeOf(table.picks, 1),
    nothing,
    total: live.reduce((sum, entry) => sum + entry.weight, nothing),
    entries: live.map((entry) => {
      const { kind, id: target } = entryKind(entry);
      const shown = { [kind]: target, weight: entry.weight, count: rangeOf(entry.count, 1) };
      return kind === 'table'
        ? { ...shown, odds: previewRoll(ctx, { effect: 'roll-loot', table: target }, depth + 1) }
        : shown;
    }),
  };
}

const ITEM_ARG = { item: { type: 'ref', to: ITEM } } as const;
const COUNT = { type: 'int', min: 1 } as const;

export const inventoryKit = defineModule<InventorySlice>({
  id: INVENTORY,
  init: () => ({ bag: {} }),
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
  },
  effects: {
    'give-item': {
      run: (ctx, effect) => {
        itemRecord(ctx.content, effect.item);
        give(ctx, effect.item as string, countOf(effect));
      },
      preview: previewGive,
    },
    'take-item': { run: take, preview: previewTake },
    'roll-loot': {
      run: (ctx, effect) => roll(ctx, effect.table as string, 0),
      preview: (ctx, effect) => previewRoll(ctx, effect),
    },
  },
  events: {
    gained: { args: { ...ITEM_ARG, count: COUNT }, label: 'Items go into the bag' },
    lost: { args: { ...ITEM_ARG, count: COUNT }, label: 'Items leave the bag' },
    full: { args: { ...ITEM_ARG, lost: COUNT }, label: 'The bag can’t hold all of it' },
  },
});
