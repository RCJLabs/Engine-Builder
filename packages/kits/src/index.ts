/**
 * @eb/kits: the engine's kits, pure modules for what most games share (M3.3, D41,
 * docs/specs/kits.md). The inventory kit (items, the party's bag, loot tables), the economy kit
 * (resources, shops), the stats kit (actors, stats, statuses) and the gear kit (slots, worn items;
 * M3.4, docs/specs/stats.md). Their record types and checks are in @eb/schema.
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
export { gearKit } from './gear/module.ts';
export { GEAR, type GearSlice, SLOT, type SlotRecord, type WearableItem, type WearingActor } from './gear/types.ts';
export { gearParts, wornBy } from './gear/worn.ts';
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
export { statsModule } from './stats/module.ts';
export {
  ACTOR,
  type ActorRecord,
  type ActorState,
  type Lasts,
  type Modifier,
  STAT,
  STATS,
  STATUS,
  type StatRecord,
  type StatsSlice,
  type StatusRecord,
  type StatusState,
  type Until,
} from './stats/types.ts';
export { currentOf, type Part, type StatParts, statParts, statusParts } from './stats/values.ts';
