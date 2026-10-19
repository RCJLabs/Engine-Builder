/**
 * The roster kit's record types (M3.6, D44, docs/specs/roster.md), as type files: recruit
 * templates, halls that offer recruits, and the roster's settings. A fee names resources with the
 * economy kit on; without it a fee is still allowed, and is W117, since nothing charges it.
 */
import { FLAG } from '@eb/core';
import { ACTOR, RECRUIT, RESOURCE, STAT, STATUS } from '@eb/kits';
import { DESCRIPTION, NAME } from './kitFields.ts';
import type { FieldDef, Fields, TypeFile } from './typeFile.ts';

/** The most a hall offers a round: each offer is worked out again whenever a hall's options are read. */
export const MOST_OFFERS = 20;
// As a loot table's weights: well under the 2^32 a draw can add up to.
const WEIGHT = 1_000_000;

const fee = (economy: boolean, description: string): FieldDef => ({
  kind: 'map',
  ...(economy ? { key: { kind: 'ref', to: RESOURCE } } : {}),
  of: { kind: 'int', min: 1 },
  optional: true,
  label: 'Fee',
  description,
});

const NAMES = { kind: 'list', min: 1, of: { kind: 'text', min: 1 } } as const;

/** Bands lowest first, as a faction's are: an id conditions name, a name, and where each begins. */
const bands = (label: string, extra: Fields): FieldDef => ({
  kind: 'list',
  min: 1,
  label,
  description: 'Lowest first: a value is in the last band it has reached',
  of: {
    kind: 'group',
    fields: {
      id: {
        kind: 'text',
        min: 1,
        label: 'Id',
        description: 'What conditions call it: lowercase words joined by hyphens',
      },
      name: { kind: 'text', optional: true, label: 'Name' },
      from: {
        kind: 'int',
        optional: true,
        label: 'From',
        description: 'Where it begins; the first one’s can be left out',
      },
      ...extra,
    },
  },
});

export function recruitTypeFile(economy: boolean): TypeFile {
  return {
    title: 'Recruit',
    description: 'What recruits are rolled from: a written actor, names, stats in ranges and traits by chance.',
    nameField: 'name',
    fields: {
      name: NAME,
      description: DESCRIPTION,
      actor: { kind: 'ref', to: ACTOR, label: 'Actor', description: 'The written actor each recruit copies' },
      names: { ...NAMES, label: 'Names', description: 'First names: one is drawn for each recruit' },
      bynames: {
        ...NAMES,
        optional: true,
        label: 'Bynames',
        description: 'Second names: a recruit is then a first name and a byname',
      },
      stats: {
        kind: 'map',
        key: { kind: 'ref', to: STAT },
        of: {
          kind: 'group',
          fields: {
            min: { kind: 'int', label: 'From' },
            max: { kind: 'int', optional: true, label: 'To', description: 'From, when left out' },
          },
        },
        optional: true,
        label: 'Rolled stats',
        description: 'Each rolled from From to To, both included, in place of the actor’s base',
      },
      traits: {
        kind: 'list',
        min: 1,
        optional: true,
        label: 'Traits',
        description: 'Each drawn in turn with its chance, until Most traits are drawn',
        of: {
          kind: 'group',
          fields: {
            status: { kind: 'ref', to: STATUS, label: 'Status', description: 'What a recruit drawing it starts with' },
            chance: { kind: 'int', min: 1, max: 100, label: 'Chance (%)' },
            fee: fee(economy, 'Added to the recruit’s fee when drawn'),
          },
        },
      },
      most: { kind: 'int', min: 0, optional: true, label: 'Most traits', description: 'No limit when left out' },
      fee: fee(economy, 'What hiring one costs, before its traits’ fees: nothing when left out'),
    },
  };
}

export const HALL_TYPE_FILE: TypeFile = {
  title: 'Hall',
  description:
    'A place that offers recruits: a station, a market, a tavern. Its offers stay the same until a new round.',
  nameField: 'name',
  fields: {
    name: NAME,
    description: DESCRIPTION,
    offers: {
      kind: 'int',
      min: 1,
      max: MOST_OFFERS,
      optional: true,
      label: 'Offers a round',
      description: '1 when left out',
    },
    recruits: {
      kind: 'list',
      min: 1,
      label: 'Recruits',
      description: 'Each offer is drawn from these by weight',
      of: {
        kind: 'group',
        fields: {
          recruit: { kind: 'ref', to: RECRUIT, label: 'Recruit' },
          weight: { kind: 'int', min: 1, max: WEIGHT, optional: true, label: 'Weight', description: '1 when left out' },
        },
      },
    },
  },
};

export const ROSTER_TYPE_FILE: TypeFile = {
  title: 'Roster',
  description: 'The roster’s settings: its cap, who starts on it, its ranks and its bonds. A game has one.',
  nameField: 'name',
  fields: {
    name: NAME,
    description: DESCRIPTION,
    cap: { kind: 'int', min: 0, optional: true, label: 'Most members', description: 'No limit when left out' },
    'cap-flag': {
      kind: 'ref',
      to: FLAG,
      optional: true,
      label: 'Most members from a flag',
      description: 'A number flag whose value is the cap, so rows can raise it',
    },
    start: {
      kind: 'list',
      min: 1,
      of: { kind: 'ref', to: ACTOR },
      optional: true,
      label: 'Starts with',
      description: 'Written actors on the roster as the game starts, in order',
    },
    ranks: {
      kind: 'group',
      optional: true,
      label: 'Ranks',
      description: 'A ladder on a stat: a member is at the last rank its value has reached',
      fields: {
        stat: { kind: 'ref', to: STAT, label: 'Stat', description: 'Fights, years, battles won' },
        bands: bands('Ranks', {
          status: {
            kind: 'ref',
            to: STATUS,
            optional: true,
            label: 'Status',
            description: 'What a member at this rank has, until its rank moves on',
          },
        }),
      },
    },
    bonds: {
      kind: 'group',
      optional: true,
      label: 'Bonds',
      description: 'A number for each pair of actors, changed by effects',
      fields: {
        min: { kind: 'int', optional: true, label: 'Lowest', description: 'No limit when left out' },
        max: { kind: 'int', optional: true, label: 'Highest', description: 'No limit when left out' },
        start: {
          kind: 'int',
          optional: true,
          label: 'Starts at',
          description: '0 when left out, or the nearer of Lowest and Highest',
        },
        bands: { ...bands('Bands', {}), optional: true },
      },
    },
  },
};
