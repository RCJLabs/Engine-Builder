/**
 * @eb/kits: the engine's kits, pure modules for what most games share (M3.3, D41,
 * docs/specs/kits.md). So far the inventory kit (items, the party's bag, loot tables) and the
 * economy kit (resources, shops). Their record types and checks are in @eb/schema.
 */
export { addAmount, amountOf, highest, lowest, resourceRecord } from './economy/amounts.ts';
export { economyKit } from './economy/module.ts';
export { buyPrice, buysItem, type Quoting, quoteBuy, quoteSell, sellPrice } from './economy/quote.ts';
export { buyVerdict, sellVerdict, shopIn, shopRecord, type Trade, type Verdict } from './economy/shop.ts';
export {
  ECONOMY,
  type EconomySlice,
  type PriceRule,
  RESOURCE,
  type ResourceRecord,
  SHOP,
  SHOPPING,
  type ShelfItem,
  type ShopRecord,
  type ShopState,
  type StockItem,
} from './economy/types.ts';
export { itemRecord, room } from './inventory/items.ts';
export { inventoryKit } from './inventory/module.ts';
export {
  INVENTORY,
  type InventorySlice,
  ITEM,
  type ItemRecord,
  LOOT_TABLE,
  type LootEntry,
  type LootTableRecord,
  type Range,
  rangeOf,
} from './inventory/types.ts';
export { KIT_IDS, KITS, type Kit, type KitProblem, kitsOn } from './kits.ts';
export { type Drawn, draw, entryKind, liveEntries, lootTable, MAX_DEPTH } from './loot/draw.ts';
export { kitModules } from './modules.ts';
