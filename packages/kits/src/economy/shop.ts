/**
 * Shops (docs/specs/kits.md): a shelf stocked from the shop's items and its table, stocked again
 * every few days when it says so, and the checks a buy and a sale make. The actions and the options
 * they offer share the checks, so what is offered is what is accepted. A shop an actor keeps (M6.8,
 * D80) stocks their bag instead, and buys with their purse.
 */
import type { Condition, DeepReadonly, FactArgs, ModeFrame, ModuleContext, RecordStore } from '@eb/core';
import { itemRecord, room } from '../inventory/items.ts';
import { ITEM } from '../inventory/types.ts';
import { draw, entryKind, liveEntries, lootTable, MAX_DEPTH } from '../loot/draw.ts';
import { amountOf, highest, lowest, resourceRecord } from './amounts.ts';
import { purseOf, resetPurse } from './purses.ts';
import { buysItem, quoteBuy, quoteSell } from './quote.ts';
import { type EconomySlice, SHOP, type ShelfItem, type ShopRecord, type ShopState } from './types.ts';

/** The shop's record, or a thrown error: validation stops a reference to a missing shop. */
export function shopRecord(content: RecordStore, id: unknown): ShopRecord {
  if (typeof id !== 'string' || !content.has(SHOP, id)) throw new Error(`No shop "${String(id)}"`);
  return content.get(SHOP, id) as ShopRecord;
}

/** The shop a mode is for: its data's `shop`, as open-shop pushes it. */
export function shopIn(mode: ModeFrame): string | undefined {
  const data = mode.data as { shop?: unknown } | undefined;
  return typeof data?.shop === 'string' ? data.shop : undefined;
}

/** A new shelf: the stock's items as written, then what its table draws, a second draw of an item adding to the first. */
function stockShelf(ctx: ModuleContext<EconomySlice>, id: string, shop: ShopRecord): ShelfItem[] {
  const shelf: { item: string; left: number }[] = [];
  const put = (item: string, n: number) => {
    const at = shelf.find((s) => s.item === item);
    if (at) at.left += n;
    else shelf.push({ item, left: n });
  };
  for (const { item, count = 1 } of shop.stock?.items ?? []) put(item, count);
  const rng = ctx.rng(`stock-${id}`);
  const fill = (table: string, depth: number): void => {
    if (depth > MAX_DEPTH) throw new Error(`Shop "${id}": its tables nest more than ${MAX_DEPTH} deep`);
    const record = lootTable(ctx.content, table);
    const live = liveEntries(record, (condition) => ctx.check(condition) === true);
    for (const { entry, count } of draw(record, live, rng)) {
      const { kind, id: target } = entryKind(entry);
      if (kind === 'item') put(target, count);
      else if (kind === 'table') for (let i = 0; i < count; i++) fill(target, depth + 1);
      else throw new Error(`Shop "${id}": its stock table gives a resource, "${target}"`);
    }
  };
  if (shop.stock?.table !== undefined) fill(shop.stock.table, 0);
  return shelf;
}

/**
 * Stocks the shelf the first time the shop opens, and again once `every` days have passed since.
 * A shop that stocks again reads `time.day`, so its game needs the time module (W113).
 */
export function stockIfDue(ctx: ModuleContext<EconomySlice>, id: string, shop: ShopRecord): void {
  const saved = ctx.read().shops[id];
  const every = shop.stock?.every?.days;
  const today = every === undefined ? undefined : (ctx.fact('time.day') as number);
  const fresh = today === undefined || every === undefined || (saved?.day !== undefined && today - saved.day < every);
  if (saved && fresh) return;
  const stocked = stockShelf(ctx, id, shop);
  // A merchant's bag goes back to what they carry, the stock on top, and their purse to their record's.
  if (shop.actor !== undefined) {
    const add = Object.fromEntries(stocked.map((s) => [s.item, s.left]));
    ctx.apply({ effect: 'restock-bag', actor: shop.actor, add });
    resetPurse(ctx, shop.actor);
  }
  const shelf = shop.actor === undefined ? stocked : [];
  (ctx.write().shops as Record<string, ShopState>)[id] = today === undefined ? { shelf } : { shelf, day: today };
}

/** How many of the item the shop has to sell: on its shelf, or in its actor's bag. */
export function inStock(trade: Pick<Trade, 'slice' | 'fact'>, shopId: string, shop: ShopRecord, item: string): number {
  if (shop.actor !== undefined) return trade.fact('inventory.carried', { actor: shop.actor, item }) as number;
  return trade.slice.shops[shopId]?.shelf.find((s) => s.item === item)?.left ?? 0;
}

/** One item off the shelf; the last one takes the item off it. */
export function takeFromShelf(ctx: ModuleContext<EconomySlice>, id: string, item: string): void {
  const state = ctx.write().shops[id] as { shelf: ShelfItem[] };
  state.shelf = state.shelf.flatMap((s) => (s.item !== item ? [s] : s.left > 1 ? [{ item, left: s.left - 1 }] : []));
}

/** What a trade reads, from an action's context, its options' view or a fact's. */
export interface Trade {
  readonly content: RecordStore;
  readonly slice: DeepReadonly<EconomySlice>;
  holds(condition: Condition): boolean;
  fact(id: string, args?: FactArgs): unknown;
}

export type Verdict =
  | { readonly ok: true; readonly price: number }
  | { readonly ok: false; readonly reason: string; readonly data: Readonly<Record<string, unknown>> };

const no = (reason: string, data: Readonly<Record<string, unknown>>): Verdict => ({ ok: false, reason, data });
const isItem = (content: RecordStore, item: unknown): item is string =>
  typeof item === 'string' && content.has(ITEM, item);

/** Whether one of the item can be bought now, and at what price. */
export function buyVerdict(trade: Trade, shopId: string, item: unknown): Verdict {
  const shop = shopRecord(trade.content, shopId);
  if (!isItem(trade.content, item) || inStock(trade, shopId, shop, item) < 1) {
    return no('sold-out', { shop: shopId, item: String(item) });
  }
  const price = quoteBuy(trade, shop, item);
  const have = amountOf(trade.slice, trade.content, shop.currency);
  if (have - price < lowest(resourceRecord(trade.content, shop.currency))) {
    return no('cant-afford', { shop: shopId, item, price, have });
  }
  const carried = trade.fact('inventory.count', { item }) as number;
  if (room(itemRecord(trade.content, item), carried, 1) < 1) return no('no-room', { shop: shopId, item });
  return { ok: true, price };
}

/** Whether the shop will buy one of the item now, and for what. */
export function sellVerdict(trade: Trade, shopId: string, item: unknown): Verdict {
  const shop = shopRecord(trade.content, shopId);
  if (!isItem(trade.content, item) || !buysItem(shop, itemRecord(trade.content, item))) {
    return no('wont-buy', { shop: shopId, item: String(item) });
  }
  if ((trade.fact('inventory.count', { item }) as number) < 1) return no('none-to-sell', { shop: shopId, item });
  const price = quoteSell(trade, shop, item);
  const have = amountOf(trade.slice, trade.content, shop.currency);
  if (have + price > highest(resourceRecord(trade.content, shop.currency))) {
    return no('purse-full', { shop: shopId, item, price, have });
  }
  return shop.actor === undefined ? { ok: true, price } : merchantTakes(trade, shopId, shop.actor, shop, item, price);
}

/** Whether a merchant can pay for the item and has room for it in their bag. */
function merchantTakes(
  trade: Trade,
  shopId: string,
  actor: string,
  shop: ShopRecord,
  item: string,
  price: number,
): Verdict {
  const purse = purseOf(trade.slice, trade.content, actor, shop.currency);
  if (purse - price < lowest(resourceRecord(trade.content, shop.currency))) {
    return no('cant-pay', { shop: shopId, actor, item, price, have: purse });
  }
  const carried = trade.fact('inventory.carried', { actor, item }) as number;
  if (room(itemRecord(trade.content, item), carried, 1) < 1) return no('no-room', { shop: shopId, actor, item });
  return { ok: true, price };
}
