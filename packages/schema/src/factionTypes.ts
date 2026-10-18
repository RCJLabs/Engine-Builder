/**
 * The factions kit's record type (M3.5, D43, docs/specs/factions.md), as a type file, and the
 * field it adds to the economy kit's shops when both kits are on.
 */
import { FACTION } from '@eb/kits';
import { DESCRIPTION, NAME } from './kitFields.ts';
import type { Fields, TypeFile } from './typeFile.ts';

export const FACTION_TYPE_FILE: TypeFile = {
  title: 'Faction',
  description: 'A side the party stands with: a number in its own range, in bands that prices and conditions read.',
  nameField: 'name',
  fields: {
    name: NAME,
    description: DESCRIPTION,
    min: { kind: 'int', optional: true, label: 'Lowest', description: 'No limit when left out' },
    max: { kind: 'int', optional: true, label: 'Highest', description: 'No limit when left out' },
    start: {
      kind: 'int',
      optional: true,
      label: 'Starts at',
      description: '0 when left out, or the nearer of Lowest and Highest',
    },
    bands: {
      kind: 'list',
      optional: true,
      label: 'Bands',
      description: 'Lowest first: a standing is in the last band it has reached',
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
          description: { kind: 'text', multiline: true, optional: true, label: 'Description' },
          from: {
            kind: 'int',
            optional: true,
            label: 'From',
            description: 'Where it begins; the first band’s can be left out',
          },
          price: {
            kind: 'int',
            min: 0,
            optional: true,
            label: 'Prices (%)',
            description: 'The share of what a shop naming the faction charges: 100 when left out',
          },
        },
      },
    },
    drift: {
      kind: 'group',
      optional: true,
      label: 'Drift',
      description: 'A point every few days toward where it rests',
      fields: {
        every: { kind: 'int', min: 1, label: 'Every (days)' },
        toward: {
          kind: 'int',
          optional: true,
          label: 'Toward',
          description: 'Where it rests: Starts at when left out',
        },
      },
    },
  },
};

/** What the factions kit adds to a shop, with the economy kit on: the faction whose band sets its prices. */
export const FACTION_SHOP_FIELDS: Fields = {
  faction: {
    kind: 'ref',
    to: FACTION,
    optional: true,
    label: 'Faction',
    description: 'Its band sets a share of what the shop charges',
  },
};
