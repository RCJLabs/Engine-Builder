import { FLAG } from '@eb/core';
import {
  ACTOR,
  AI,
  BEHAVIOUR,
  DIALOGUE,
  ENCOUNTER,
  ENCOUNTERS,
  EVENT,
  EVENTS,
  FACTION,
  FACTIONS,
  GEAR,
  ITEM,
  LOOT_TABLE,
  MAP,
  MAPS,
  QUEST,
  QUESTS,
  RECRUIT,
  ROSTER,
  ROSTER_RECORD,
  SHOP,
  STAT,
  STATS,
  STATUS,
  TALK,
} from '@eb/kits';
import type { IndexedRecord } from './recordIndex.ts';

/**
 * A flag, or a record that names one: the records whose checks read each other (M3.1). A flag's
 * lint reads every record that names it, and a set-flag's check reads the flag. Its own module,
 * so the record form's checks don't bring the index with them.
 */
export const flagRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === FLAG || record.refs.some((ref) => ref.to.startsWith(`${FLAG}:`)));

/**
 * A loot table or a shop (M3.3): a table's loop check (E036) and a shop's stock check read every
 * table, so a change to one checks them all again, as a flag's does.
 */
export const lootRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === LOOT_TABLE || record.type === SHOP);

/**
 * A stat or an actor (M3.4): an actor's bases are checked against its stats' bounds, so a change
 * to either checks both again; with the gear kit on, an item or an actor, since what an actor
 * wears is checked against the items' slots.
 */
export const statRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === STAT || record.type === ACTOR);
export const wornRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === ITEM || record.type === ACTOR);

/**
 * A faction, or a record that names one (M3.5): a condition naming a band is checked against the
 * faction's bands (E039), so a change to a faction checks everything naming it again.
 */
export const factionRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === FACTION || record.refs.some((ref) => ref.to.startsWith(`${FACTION}:`)));

// A roster fact is named by its id, in a condition's text or its tree, and names no record that
// refs would find: "roster.ranked(veteran)". Read once for each record the index keeps.
const decoder = new TextDecoder();
const mentions = new WeakMap<IndexedRecord, boolean>();
function namesRosterFact(record: IndexedRecord): boolean {
  let found = mentions.get(record);
  if (found === undefined) {
    found = decoder.decode(record.bytes).includes(`${ROSTER}.`);
    mentions.set(record, found);
  }
  return found;
}

/**
 * The roster's record, the statuses its ranks give, and every record whose conditions name a
 * roster fact (M3.6): a rank or a bond band a condition names is checked against the roster's
 * (E040), a rank's status against its ladder, and a second roster against the first (E035), so a
 * change to any of them checks them all again.
 */
export const rosterRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === ROSTER_RECORD || record.type === STATUS || namesRosterFact(record));

/** An actor or a recruit template (M3.6): a written actor may not have an id a recruit could take (E035). */
export const recruitRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === ACTOR || record.type === RECRUIT);

/**
 * An event, or a record that names one (M3.7): a condition naming a choice is checked against its
 * event's choices (E041), so a change to an event checks everything naming it again.
 */
export const eventRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === EVENT || record.refs.some((ref) => ref.to.startsWith(`${EVENT}:`)));

/**
 * A talk, or a record that names one (M3.8): a condition naming a line or an option is checked
 * against its talk (E042), and a talk is warned of when nothing opens it (W123), so a change to a
 * talk, or to what names one, checks them all again.
 */
export const talkRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === TALK || record.refs.some((ref) => ref.to.startsWith(`${TALK}:`)));

/**
 * A quest, or a record that names one (M3.9): a condition naming a stage or an objective is checked
 * against its quest (E043), and a quest is warned of when nothing starts it (W125) or brings it to a
 * stage (W124), so a change to a quest, or to what names one, checks them all again.
 */
export const questRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === QUEST || record.refs.some((ref) => ref.to.startsWith(`${QUEST}:`)));

/**
 * A map, or a record that names one (M4.6): enter-map's node is checked against its map's nodes
 * (E053), so a change to a map, or to what enters one, checks them all again.
 */
export const mapRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === MAP || record.refs.some((ref) => ref.to.startsWith(`${MAP}:`)));

/**
 * An encounter, or a record whose fight names one (M4.7): a fight that names no fighters is E054
 * only when its encounter names none either, so a change to an encounter, or to what fights it,
 * checks them all again.
 */
export const encounterRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === ENCOUNTER || record.refs.some((ref) => ref.to.startsWith(`${ENCOUNTER}:`)));

/**
 * A behaviour or an actor (M6.3): a behaviour is warned of when no actor has it (W148) and checked
 * against the space each actor using it stands in (E081), so a change to either checks both again.
 */
export const behaviourRelated = (record: IndexedRecord | undefined): boolean =>
  record !== undefined && (record.type === BEHAVIOUR || record.type === ACTOR);

/** The checks that read other records, for the kits on. */
export const relatedFor = (kits: readonly string[]): ((record: IndexedRecord | undefined) => boolean)[] => [
  flagRelated,
  lootRelated,
  ...(kits.includes(STATS) ? [statRelated] : []),
  ...(kits.includes(GEAR) ? [wornRelated] : []),
  ...(kits.includes(FACTIONS) ? [factionRelated] : []),
  ...(kits.includes(ROSTER) ? [rosterRelated, recruitRelated] : []),
  ...(kits.includes(EVENTS) ? [eventRelated] : []),
  ...(kits.includes(DIALOGUE) ? [talkRelated] : []),
  ...(kits.includes(QUESTS) ? [questRelated] : []),
  ...(kits.includes(MAPS) ? [mapRelated] : []),
  ...(kits.includes(ENCOUNTERS) ? [encounterRelated] : []),
  ...(kits.includes(AI) ? [behaviourRelated] : []),
];
