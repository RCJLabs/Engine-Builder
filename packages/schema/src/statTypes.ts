/**
 * The stats and gear kits' record types (M3.4, D42, docs/specs/stats.md), as type files: stats,
 * actors, statuses and slots, and the fields the gear kit adds to the inventory kit's items and
 * to actors.
 */
import { GEAR, ITEM, SLOT, STAT, STATUS } from '@eb/kits';
import { DESCRIPTION, NAME, TAGS } from './kitFields.ts';
import { npcFields } from './npcFields.ts';
import type { FieldDef, Fields, TypeFile } from './typeFile.ts';

/** What a status, or a worn item, does to stats: a list, each adding, then taking a percent. */
export const MODIFIERS: FieldDef = {
  kind: 'list',
  optional: true,
  label: 'Modifiers',
  description: 'Each adds to a stat, then takes a percent of it: every percent summed, then taken once',
  of: {
    kind: 'group',
    fields: {
      stat: { kind: 'ref', to: STAT, label: 'Stat' },
      add: { kind: 'int', optional: true, label: 'Add', description: 'Whole points, added before the percents' },
      percent: { kind: 'int', optional: true, label: 'Percent', description: 'A whole percent, below 0 taking away' },
    },
  },
};

export const STAT_TYPE_FILE: TypeFile = {
  title: 'Stat',
  description: 'A number every actor has: health, aim, speed. Damage takes from what is left of it.',
  nameField: 'name',
  fields: {
    name: NAME,
    description: DESCRIPTION,
    min: {
      kind: 'int',
      optional: true,
      label: 'Lowest',
      description: '0 when left out: no value, and nothing damage leaves, goes below it',
    },
    max: { kind: 'int', optional: true, label: 'Highest', description: 'No limit when left out' },
    start: {
      kind: 'int',
      optional: true,
      label: 'Starts at',
      description: 'The base of an actor that leaves it out: Lowest when left out',
    },
  },
};

export const STATUS_TYPE_FILE: TypeFile = {
  title: 'Status',
  description: 'Something an actor has for a while, or for good: a wound, a blessing, a trait.',
  nameField: 'name',
  fields: {
    name: NAME,
    description: DESCRIPTION,
    modifiers: { ...MODIFIERS, description: 'What each stack does' },
    lasts: {
      kind: 'group',
      optional: true,
      label: 'Lasts',
      description: 'Days or ticks from when it is added, one of the two: until removed when left out',
      fields: {
        days: { kind: 'int', min: 1, optional: true, label: 'Days' },
        ticks: { kind: 'int', min: 1, optional: true, label: 'Ticks' },
      },
    },
    stacks: { kind: 'int', min: 1, optional: true, label: 'Most stacks', description: '1 when left out' },
    tags: { ...TAGS, description: 'Words conditions count statuses by' },
  },
};

/**
 * An actor: with the gear kit on, its slots and what it starts wearing too; and since M6.1 (D73), how
 * it looks placed in a space, its talk, faction and bag with their kits on (npcFields.ts).
 */
export function actorTypeFile(on: readonly string[]): TypeFile {
  const gear = on.includes(GEAR);
  const worn: Fields = {
    slots: {
      kind: 'list',
      min: 1,
      of: { kind: 'ref', to: SLOT },
      optional: true,
      label: 'Slots',
      description: 'Where it can wear things: every slot when left out',
    },
    wears: {
      kind: 'map',
      key: { kind: 'ref', to: SLOT },
      of: { kind: 'ref', to: ITEM },
      optional: true,
      label: 'Wears',
      description: 'What it starts wearing, by slot, from no bag',
    },
  };
  return {
    title: 'Actor',
    description: 'Someone with stats: a crew member, a gladiator, a climber.',
    nameField: 'name',
    fields: {
      name: NAME,
      description: DESCRIPTION,
      stats: {
        kind: 'map',
        key: { kind: 'ref', to: STAT },
        of: { kind: 'int' },
        optional: true,
        label: 'Stats',
        description: 'Its base for each: a stat left out has its Starts at',
      },
      statuses: {
        kind: 'list',
        of: { kind: 'ref', to: STATUS },
        optional: true,
        label: 'Starts with',
        description: 'Statuses it has from the start, a stack each, until removed',
      },
      ...(gear ? worn : {}),
      ...npcFields(on),
    },
  };
}

export const SLOT_TYPE_FILE: TypeFile = {
  title: 'Slot',
  description: 'Where an actor wears an item: a hand, a body, a head.',
  nameField: 'name',
  fields: {
    name: NAME,
    description: DESCRIPTION,
    takes: {
      ...TAGS,
      label: 'Takes',
      description: 'Item tags it can wear: an item worn in no slot of its own fits any slot taking one of its tags',
    },
  },
};

/** The fields the gear kit adds to the inventory kit's items. */
export const WORN_ITEM_FIELDS: Fields = {
  slot: {
    kind: 'ref',
    to: SLOT,
    optional: true,
    label: 'Worn in',
    description: 'Left out, any slot that takes one of its tags; with none, it can’t be worn',
  },
  modifiers: { ...MODIFIERS, description: 'What it does while worn' },
};
