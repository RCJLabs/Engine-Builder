/**
 * @eb/kits: the engine's kits, pure modules for what most games share (M3.3, D41,
 * docs/specs/kits.md). The inventory kit (items, the party's bag, loot tables), the economy kit
 * (resources, shops), the stats kit (actors, stats, statuses) and the gear kit (slots, worn items;
 * M3.4, docs/specs/stats.md), the factions kit (standing, bands, drift; M3.5,
 * docs/specs/factions.md), the time kit (the calendar as data) and the roster kit (members,
 * recruits made in play, halls, ranks, bonds; M3.6, docs/specs/roster.md), the events kit
 * (choice events, decks, consequences; M3.7, docs/specs/events.md) and the dialogue kit (speakers
 * and talks; M3.8, docs/specs/dialogue.md). Their record types and checks are in @eb/schema.
 */
export { leadsFrom, stepsFrom } from './dialogue/graph.ts';
export { dialogueModule } from './dialogue/module.ts';
export { lineOf, namedLine, namedOption, optionOf, talkRecord } from './dialogue/records.ts';
export {
  DIALOGUE,
  type DialogueSlice,
  type Line,
  type OpenTalk,
  SPEAKER,
  type SpeakerRecord,
  type Start,
  TALK,
  TALKING,
  type TalkOption,
  type TalkOutcome,
  type TalkRecord,
} from './dialogue/types.ts';
export { openingLine, saidIn, shownOptions, talkView } from './dialogue/view.ts';
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
export {
  type Asked,
  type ChoiceVerdict,
  type Choosing,
  choiceShown,
  choiceVerdict,
  chooseOptions,
  eventView,
  outcomeTable,
  type Short,
  verdictOn,
} from './events/choices.ts';
export { dueOf, leftOf } from './events/laters.ts';
export { eventsModule } from './events/module.ts';
export { choiceOf, deckRecord, eventRecord } from './events/records.ts';
export {
  CHOOSING,
  type Choice,
  type Cost,
  DECK,
  type DeckEntry,
  type DeckRecord,
  type DeckState,
  type Due,
  EVENT,
  EVENTS,
  type EventRecord,
  type EventsSlice,
  type Later,
  type Outcome,
  type Receipt,
} from './events/types.ts';
export { factionsKit } from './factions/module.ts';
export { bandOf, priceOf, reached, standingOf, startOf, within } from './factions/standing.ts';
export { type Band, type Drift, FACTION, FACTIONS, type FactionRecord, type FactionsSlice } from './factions/types.ts';
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
export { bondOf, pairKey } from './roster/bonds.ts';
export { type HireVerdict, hallIn, hireVerdict } from './roster/hall.ts';
export { capOf, rankOf, roomOf, rosterRecord } from './roster/members.ts';
export { rosterModule } from './roster/module.ts';
export {
  feeOf,
  MADE,
  madeActor,
  NAME_TRIES,
  nextRecruit,
  type Offer,
  offerAt,
  recruitId,
  roll,
  roundOf,
} from './roster/offers.ts';
export {
  type BondBand,
  type BondSettings,
  type Fee,
  HALL,
  type HallRecord,
  type HallRecruit,
  type HallState,
  HIRING,
  type Ladder,
  type Rank,
  RECRUIT,
  type RecruitRecord,
  ROSTER,
  ROSTER_RECORD,
  type Rolled,
  type RosterRecord,
  type RosterSlice,
  type StatRange,
  type Trait,
} from './roster/types.ts';
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
export { timeKit } from './time/module.ts';
export { DEFAULT_CALENDAR, TIME } from './time/types.ts';
