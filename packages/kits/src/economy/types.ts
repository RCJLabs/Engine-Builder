/**
 * The economy kit's records and state (M3.3, docs/specs/kits.md): resources the party holds, and
 * shops that sell from a shelf and buy for a share of an item's value. Whole numbers only.
 */
import type { Condition } from '@eb/core';

/** The kit's id, its module's id and the key of its slice. */
export const ECONOMY = 'economy';
export const RESOURCE = 'resource';
export const SHOP = 'shop';
/** The mode a shop opens, whose data is `{ shop }`. */
export const SHOPPING = 'shopping';

/** records/resource/<id>.json */
export interface ResourceRecord {
  readonly name?: string;
  readonly description?: string;
  /** 0 when left out, and within the bounds. */
  readonly start?: number;
  /** 0 when left out: an amount never goes below it. */
  readonly min?: number;
  /** No limit when left out: past it, the rest is lost. */
  readonly max?: number;
  /** Prices in this resource are multiples of it: 1 when left out. */
  readonly step?: number;
}

export interface StockItem {
  readonly item: string;
  /** 1 when left out. */
  readonly count?: number;
}

export interface PriceRule {
  readonly if: Condition;
  /** A whole percent the price is multiplied by while `if` is true. */
  readonly percent: number;
}

/** records/shop/<id>.json */
export interface ShopRecord {
  readonly name?: string;
  readonly description?: string;
  /** The resource it charges and pays in. */
  readonly currency: string;
  /** The whole percent of an item's value it charges: 100 when left out. */
  readonly 'sells-at'?: number;
  /** The whole percent it pays: 50 when left out, never above `sells-at`. */
  readonly 'buys-at'?: number;
  /** Left out, the shop buys nothing; `{}`, anything; with tags, items with one of them. */
  readonly buys?: { readonly tags?: readonly string[] };
  readonly stock?: {
    readonly items?: readonly StockItem[];
    readonly table?: string;
    readonly every?: { readonly days: number };
  };
  readonly rules?: readonly PriceRule[];
  /** With the factions kit on, the faction whose band sets a share of what it charges (M3.5, D43). */
  readonly faction?: string;
}

export interface ShelfItem {
  readonly item: string;
  /** 1 or more: an item sold out leaves the shelf. */
  readonly left: number;
}

export interface ShopState {
  readonly shelf: readonly ShelfItem[];
  /** `time.day` when the shelf was stocked, for a shop that stocks again. */
  readonly day?: number;
}

export interface EconomySlice {
  /** By resource: only the amounts that aren't their start. */
  readonly amounts: Readonly<Record<string, number>>;
  /** By shop, from the first time it opens. */
  readonly shops: Readonly<Record<string, ShopState>>;
}
