/**
 * The kits' effects (M3.3, docs/specs/kits.md): each one's fields, written as type-file fields,
 * give both its schema, which content is checked against as the engine's own effects are (E001,
 * E025), and the form the editor draws for it, so the two can't drift apart.
 */
import type { CalendarDef } from '@eb/core';
import {
  ACTOR,
  DEFAULT_CALENDAR,
  ECONOMY,
  FACTION,
  FACTIONS,
  GEAR,
  HALL,
  INVENTORY,
  ITEM,
  LOOT_TABLE,
  RECRUIT,
  RESOURCE,
  ROSTER,
  SHOP,
  SLOT,
  STAT,
  STATS,
  STATUS,
  TIME,
} from '@eb/kits';
import { z } from 'zod';
import { DIALOGUE_EFFECT_FILES } from './dialogueEffects.ts';
import { named } from './effect.ts';
import { ENCOUNTER_EFFECT_FILES } from './encounterEffects.ts';
import { EVENT_EFFECT_FILES } from './eventEffects.ts';
import { MAP_EFFECT_FILES } from './mapEffects.ts';
import { QUEST_EFFECT_FILES } from './questEffects.ts';
import { TACTICS_EFFECT_FILES } from './tacticsTypes.ts';
import { timeEffectFiles, timeEffectSchemas } from './timeEffects.ts';
import type { Fields } from './typeFile.ts';
import { fieldShape } from './typeSchema.ts';

export interface EffectFile {
  /** The effect's name, as content writes it: `{ "effect": "give-item" }`. */
  readonly effect: string;
  readonly kit: string;
  /** What the editor's list of effects to add calls it. */
  readonly label: string;
  /** In the order forms show them. */
  readonly fields: Fields;
}

const COUNT = { kind: 'int', min: 1, optional: true, label: 'Count', description: '1 when left out' } as const;
const WHO = { kind: 'ref', to: ACTOR, label: 'Actor' } as const;
/** Whose bag (M6.1, D73): an actor's, or the party's when left out. */
const WHOSE_BAG = {
  ...WHO,
  optional: true,
  label: 'Whose bag',
  description: 'An actor’s: the party’s when left out',
} as const;
const WHICH_STAT = { kind: 'ref', to: STAT, label: 'Stat' } as const;
const WHICH_STATUS = { kind: 'ref', to: STATUS, label: 'Status' } as const;

const FILES: EffectFile[] = [
  {
    effect: 'give-item',
    kit: INVENTORY,
    label: 'Give an item',
    fields: {
      item: { kind: 'ref', to: ITEM, label: 'Item' },
      count: { ...COUNT, description: '1 when left out; past the item’s Most carried, the rest is lost' },
      actor: WHOSE_BAG,
    },
  },
  {
    effect: 'take-item',
    kit: INVENTORY,
    label: 'Take an item',
    fields: {
      item: { kind: 'ref', to: ITEM, label: 'Item' },
      count: { ...COUNT, description: '1 when left out; it refuses when the bag holds fewer' },
      actor: WHOSE_BAG,
    },
  },
  {
    effect: 'roll-loot',
    kit: INVENTORY,
    label: 'Roll a loot table',
    fields: {
      table: { kind: 'ref', to: LOOT_TABLE, label: 'Table' },
      actor: {
        ...WHOSE_BAG,
        description: 'Its items into an actor’s bag, the party’s when left out; resources are the party’s',
      },
    },
  },
  {
    effect: 'add-resource',
    kit: ECONOMY,
    label: 'Add to a resource',
    fields: {
      resource: { kind: 'ref', to: RESOURCE, label: 'Resource' },
      by: { kind: 'int', label: 'By', description: 'Below 0 takes away; it refuses to go below the lowest' },
    },
  },
  {
    effect: 'pay-cost',
    kit: ECONOMY,
    label: 'Pay a cost',
    fields: {
      cost: {
        kind: 'map',
        key: { kind: 'ref', to: RESOURCE },
        of: { kind: 'int', min: 1 },
        label: 'Cost',
        description: 'All of it or none: it refuses when any resource is short',
      },
    },
  },
  {
    effect: 'open-shop',
    kit: ECONOMY,
    label: 'Open a shop',
    fields: { shop: { kind: 'ref', to: SHOP, label: 'Shop' } },
  },
  {
    effect: 'add-to-stat',
    kit: STATS,
    label: 'Add to a stat’s base',
    fields: {
      actor: WHO,
      stat: WHICH_STAT,
      by: { kind: 'int', label: 'By', description: 'Below 0 takes away: for good, as a level or a scar does' },
    },
  },
  {
    effect: 'damage-stat',
    kit: STATS,
    label: 'Damage a stat',
    fields: {
      actor: WHO,
      stat: WHICH_STAT,
      by: { kind: 'int', min: 1, label: 'By', description: 'It never leaves less than the stat’s Lowest' },
    },
  },
  {
    effect: 'heal-stat',
    kit: STATS,
    label: 'Heal a stat',
    fields: {
      actor: WHO,
      stat: WHICH_STAT,
      by: { kind: 'int', min: 1, optional: true, label: 'By', description: 'All the damage when left out' },
    },
  },
  {
    effect: 'add-status',
    kit: STATS,
    label: 'Add a status',
    fields: {
      actor: WHO,
      status: WHICH_STATUS,
      stacks: { ...COUNT, label: 'Stacks', description: '1 when left out; never past its Most stacks' },
    },
  },
  {
    effect: 'remove-status',
    kit: STATS,
    label: 'Remove a status',
    fields: {
      actor: WHO,
      status: WHICH_STATUS,
      stacks: { ...COUNT, label: 'Stacks', description: 'All of them when left out' },
    },
  },
  {
    effect: 'equip',
    kit: GEAR,
    label: 'Equip an item',
    fields: {
      actor: WHO,
      item: {
        kind: 'ref',
        to: ITEM,
        label: 'Item',
        description: 'Taken from the party’s bag; what its slot wore goes back',
      },
      slot: {
        kind: 'ref',
        to: SLOT,
        optional: true,
        label: 'Slot',
        description: 'Which of the slots it fits: a free one, else the first, when left out',
      },
    },
  },
  {
    effect: 'unequip',
    kit: GEAR,
    label: 'Unequip a slot',
    fields: {
      actor: WHO,
      slot: { kind: 'ref', to: SLOT, label: 'Slot', description: 'Its item goes back to the bag' },
    },
  },
  {
    effect: 'change-standing',
    kit: FACTIONS,
    label: 'Change a standing',
    fields: {
      faction: { kind: 'ref', to: FACTION, label: 'Faction' },
      by: { kind: 'int', label: 'By', description: 'Below 0 takes away; it stops at the faction’s bounds' },
    },
  },
  {
    effect: 'recruit',
    kit: ROSTER,
    label: 'Make a recruit',
    fields: {
      recruit: {
        kind: 'ref',
        to: RECRUIT,
        label: 'Recruit',
        description: 'Rolled from it, it joins with no fee; refused when the roster is full',
      },
    },
  },
  {
    effect: 'join',
    kit: ROSTER,
    label: 'Join the roster',
    fields: { actor: { ...WHO, description: 'Nothing for one on it already; refused when the roster is full' } },
  },
  {
    effect: 'leave',
    kit: ROSTER,
    label: 'Leave the roster',
    fields: {
      actor: WHO,
      why: { kind: 'text', min: 1, label: 'Why', description: 'Kept with it: dead, dismissed, sold' },
    },
  },
  {
    effect: 'change-bond',
    kit: ROSTER,
    label: 'Change a bond',
    fields: {
      actor: WHO,
      with: { ...WHO, label: 'With' },
      by: { kind: 'int', label: 'By', description: 'Below 0 takes away; it stops at the bonds’ bounds' },
    },
  },
  {
    effect: 'change-bonds',
    kit: ROSTER,
    label: 'Change every bond',
    fields: {
      by: { kind: 'int', label: 'By', description: 'For every pair of members now: a fight won together' },
    },
  },
  {
    effect: 'open-hall',
    kit: ROSTER,
    label: 'Open a hall',
    fields: { hall: { kind: 'ref', to: HALL, label: 'Hall', description: 'Its offers can be hired until it is left' } },
  },
  {
    effect: 'refresh-hall',
    kit: ROSTER,
    label: 'Start a hall’s next round',
    fields: { hall: { kind: 'ref', to: HALL, label: 'Hall', description: 'New offers, none of them hired' } },
  },
  ...EVENT_EFFECT_FILES,
  ...DIALOGUE_EFFECT_FILES,
  ...QUEST_EFFECT_FILES,
  ...MAP_EFFECT_FILES,
  ...ENCOUNTER_EFFECT_FILES,
  ...TACTICS_EFFECT_FILES,
];

export const KIT_EFFECT_FILES: readonly EffectFile[] = Object.freeze(FILES);

/** An effect's schema from its fields: a strict object whose `effect` is its name, marked as the engine's own are. */
export const effectSchema = (file: EffectFile) =>
  named(file.effect, z.strictObject({ effect: z.literal(file.effect), ...fieldShape(file.fields) }));

/** The effects of the kits on that have forms, in the kits' order; the time kit's in the calendar's units. */
export const kitEffectFiles = (on: readonly string[], calendar: CalendarDef = DEFAULT_CALENDAR): EffectFile[] =>
  on.flatMap((kit) => (kit === TIME ? timeEffectFiles(calendar) : KIT_EFFECT_FILES.filter((file) => file.kit === kit)));

const SCHEMAS = new Map(KIT_EFFECT_FILES.map((file) => [file.effect, effectSchema(file)]));

/** The schemas of the kits' effects that are on, made once; the time kit's, schedule among them, for the calendar. */
export const kitEffectSchemas = (on: readonly string[], calendar: CalendarDef = DEFAULT_CALENDAR): z.core.$ZodType[] =>
  on.flatMap((kit) =>
    kit === TIME
      ? [...timeEffectSchemas(calendar, effectSchema)]
      : KIT_EFFECT_FILES.filter((file) => file.kit === kit).map((file) => SCHEMAS.get(file.effect) as z.core.$ZodType),
  );
