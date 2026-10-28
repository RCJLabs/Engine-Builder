/**
 * @eb/kits: the engine's kits, pure modules for what most games share (M3.3, D41,
 * docs/specs/kits.md). The inventory kit (items, the party's bag, loot tables), the economy kit
 * (resources, shops), the stats kit (actors, stats, statuses) and the gear kit (slots, worn items;
 * M3.4, docs/specs/stats.md), the factions kit (standing, bands, drift; M3.5,
 * docs/specs/factions.md), the time kit (the calendar as data) and the roster kit (members,
 * recruits made in play, halls, ranks, bonds; M3.6, docs/specs/roster.md), the events kit
 * (choice events, decks, consequences; M3.7, docs/specs/events.md), the dialogue kit (speakers
 * and talks; M3.8, docs/specs/dialogue.md) and the quests kit (stages, objectives, the journal;
 * M3.9, docs/specs/quests.md), the maps kit (layered and drawn maps, travel; M4.6,
 * docs/specs/maps.md), the encounters kit (fights worked out exactly and rolled once; M4.7,
 * docs/specs/encounters.md), the ai kit (behaviours, schedules and awareness; M6.3,
 * docs/specs/ai.md), and the fighting kit (weapons, hits, falls and bodies in a walked space; M6.4,
 * docs/specs/combat.md), and the tactics kit (Space-Wrecked's boarding fight on a tilemap; M7.5,
 * docs/specs/tactics.md). Their record types and checks are in @eb/schema.
 */
export * from './ai/index.ts';
export { goesOnTo, leadsFrom, stepsFrom } from './dialogue/graph.ts';
export { dialogueModule } from './dialogue/module.ts';
export { lineOf, namedLine, namedOption, optionOf, talkRecord } from './dialogue/records.ts';
export {
  type Branch as TalkBranch,
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
export { openingLine, saidIn, shownOptions, talkView, wayOn } from './dialogue/view.ts';
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
  breakAt,
  COMBAT,
  type CombatRecord,
  combatRecord,
  ENCOUNTER,
  ENCOUNTERS,
  type EncounterRecord,
  type EncountersSlice,
  type Ends,
  encounterRecord,
  encountersModule,
  endsOf,
  type Falls,
  type FightBuilt,
  type Fighter,
  type FightOutcome,
  type FightRow,
  type FightTable,
  type Foe,
  fallenAt,
  fight,
  fightShown,
  fightTable,
  HIT_MAX,
  HIT_MIN,
  type Match,
  matchOf,
  outcomesOf,
  partyIds,
  RESULTS,
  type Reader as FightReader,
  type Result as FightResult,
  ROLL_OUT_OF,
  ROUNDS,
  rowAt,
  rowsOf,
  STANCE,
  type Stance,
  shares,
  volley,
} from './encounters/index.ts';
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
export * from './fighting/index.ts';
export { gearKit } from './gear/module.ts';
export { GEAR, type GearSlice, SLOT, type SlotRecord, type WearableItem, type WearingActor } from './gear/types.ts';
export { gearParts, wornBy } from './gear/worn.ts';
export { type Opened, openedIn } from './inventory/containers.ts';
export { itemRecord, room } from './inventory/items.ts';
export { inventoryKit, inventoryModule } from './inventory/module.ts';
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
export {
  along,
  type Built,
  bothWays,
  crosses,
  crossingBroken,
  kindRecord,
  type LinkShown,
  linksWithin,
  type MapShown,
  makeLayered,
  mapRecord,
  mapShown,
  mapsModule,
  type NodeShown,
  neighbours,
  nodeId,
  placeBroken,
  quickest,
  type Route,
  type RuleCheck,
  reachBroken,
  SWEEP_SEEDS,
  sweepLayered,
  type Travel,
  type TravelShown,
  type TravelVerdict,
  travelOf,
  travels,
  travelVerdict,
} from './maps/index.ts';
export {
  type DrawnNode,
  type KindNames,
  type LayerRules,
  MAP,
  MAPS,
  type MadeMap,
  type MadeNode,
  type MapRecord,
  type MapsSlice,
  type MixEntry,
  type Move,
  NODE_KIND,
  type NodeKindRecord,
  type PlaceRule,
  type Road,
  type Takes,
} from './maps/types.ts';
export { kitModules, kitsInWorld } from './modules.ts';
export {
  canBeDone,
  canEnd,
  endingStages,
  goneStages,
  type Lead,
  leadsByStage,
  leadsFrom as questLeadsFrom,
  stepsFrom as questStepsFrom,
} from './quests/graph.ts';
export { jobTimer } from './quests/jobs.ts';
export { type JobShown, type ObjectiveShown, type QuestShown, questShown } from './quests/journal.ts';
export { kitMetrics } from './quests/metrics.ts';
export { questsModule } from './quests/module.ts';
export { namedObjective, namedSlot, namedStage, objectiveOf, questRecord, stageOf } from './quests/records.ts';
export { FAILED } from './quests/run.ts';
export { bind as bindSlots, slotText } from './quests/slots.ts';
export { targetOf } from './quests/targets.ts';
export { firstActive } from './quests/tracking.ts';
export {
  type Count,
  type Job,
  type JobOutcome,
  type Objective,
  PICKS,
  type Pick,
  QUEST,
  QUEST_STATES,
  QUESTS,
  type QuestEntry,
  type QuestRecord,
  type QuestState,
  type QuestsSlice,
  type Slot,
  type SlotRank,
  type Stage,
  type Target as QuestTarget,
} from './quests/types.ts';
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
export { walkedStage } from './stages.ts';
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
export {
  type Arena,
  act,
  aiAction,
  arenaOf,
  BATTLE,
  BATTLE_RULES,
  type Band as ShotBand,
  type Battle,
  type BattleRecord,
  type BattleRulesRecord,
  battleRecord,
  bestPlan,
  createBattle,
  dartOdds,
  FIGHTING_BATTLE,
  fieldOf,
  GUN,
  type GunRecord,
  harm,
  type LineWords,
  lineOf as battleLine,
  type Move as BattleMove,
  NUMBERS,
  type Numbers,
  numbersOf,
  type Odds,
  ORDER,
  ORDER_KINDS,
  ORDER_NUMBER,
  type OrderKind,
  type OrderRecord,
  optionsOf,
  orderTargets,
  type Part as OddsPart,
  type Plan,
  type Post,
  plansFor,
  type Rolls,
  rangeBand,
  reachOf,
  rulesRecord,
  type Setting,
  STATUSES,
  type Status as UnitStatus,
  sees,
  shotOdds,
  TACTICS,
  type TacticsSlice,
  TEAMS,
  type Team,
  type Told,
  tacticsModule,
  type Unit,
  type Weld,
} from './tactics/index.ts';
export { timeKit } from './time/module.ts';
export { DEFAULT_CALENDAR, TIME } from './time/types.ts';
