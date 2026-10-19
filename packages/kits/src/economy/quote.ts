/**
 * The quote (docs/specs/kits.md): every price a player sees, every option offered, every refusal
 * and every charge comes from here, so none can disagree. Ludus had three prices for one buy, and
 * refused 140 of 210 buys a player could afford. Exact: a fraction in BigInt, rounded once, so
 * the order of the rules can't change a price.
 */
import type { Condition, FactArgs, RecordStore } from '@eb/core';
import { itemRecord } from '../inventory/items.ts';
import type { ItemRecord } from '../inventory/types.ts';
import { resourceRecord } from './amounts.ts';
import type { ShopRecord } from './types.ts';

function big(n: number, what: string): bigint {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`A price's ${what} is a whole number, 0 or more: ${n}`);
  return BigInt(n);
}

function whole(n: bigint): number {
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`A price of ${n} is past what the engine counts exactly`);
  return Number(n);
}

/** value × sells-at × r1 × … × rk / 100^(1+k), to the nearest multiple of `step`, halves up. */
export function buyPrice(value: number, sellsAt: number, rules: readonly number[], step: number): number {
  let num = big(value, 'value') * big(sellsAt, 'percent');
  let den = 100n;
  for (const percent of rules) {
    num *= big(percent, 'percent');
    den *= 100n;
  }
  const unit = den * big(step, 'step');
  return whole(((2n * num + unit) / (2n * unit)) * BigInt(step));
}

/** value × buys-at / 100, down to a multiple of `step`. */
export function sellPrice(value: number, buysAt: number, step: number): number {
  const unit = 100n * big(step, 'step');
  return whole(((big(value, 'value') * big(buysAt, 'percent')) / unit) * BigInt(step));
}

/** What a quote reads: content, whether a rule's condition is true now, and other kits' facts. */
export interface Quoting {
  readonly content: RecordStore;
  holds(condition: Condition): boolean;
  fact(id: string, args?: FactArgs): unknown;
}

const stepOf = (content: RecordStore, shop: ShopRecord) => resourceRecord(content, shop.currency).step ?? 1;

/**
 * What buying one of the item costs now: the share its faction's band sets (M3.5, D43), then the
 * rules whose `if` holds. One fraction, rounded once, so their order can't change the price.
 */
export function quoteBuy(quoting: Quoting, shop: ShopRecord, item: string): number {
  const rules = (shop.rules ?? []).filter((rule) => quoting.holds(rule.if)).map((rule) => rule.percent);
  const share = shop.faction === undefined ? [] : [quoting.fact('factions.price', { faction: shop.faction }) as number];
  const { value = 0 } = itemRecord(quoting.content, item);
  return buyPrice(value, shop['sells-at'] ?? 100, [...share, ...rules], stepOf(quoting.content, shop));
}

/** What the shop pays for one now: never more than buying the same item would cost. */
export function quoteSell(quoting: Quoting, shop: ShopRecord, item: string): number {
  const { value = 0 } = itemRecord(quoting.content, item);
  const offer = sellPrice(value, shop['buys-at'] ?? 50, stepOf(quoting.content, shop));
  return Math.min(offer, quoteBuy(quoting, shop, item));
}

/** Whether the shop buys the item: `buys` left out, nothing; `{}`, anything; with tags, an item with one. */
export function buysItem(shop: ShopRecord, item: ItemRecord): boolean {
  if (shop.buys === undefined) return false;
  const { tags } = shop.buys;
  return tags === undefined || tags.some((tag) => item.tags?.includes(tag) === true);
}
