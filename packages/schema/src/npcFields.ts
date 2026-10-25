/**
 * What an actor gains to stand in a space as an NPC (M6.1, D73, docs/specs/npcs.md#the-actors-fields):
 * its look, always, and with each kit on, its talk, its faction and what it carries.
 */
import { DIALOGUE, FACTION, FACTIONS, INVENTORY, ITEM, TALK } from '@eb/kits';
import { MODEL } from './modelTypes.ts';
import type { Fields } from './typeFile.ts';

const LOOK: Fields = {
  model: {
    kind: 'ref',
    to: MODEL,
    optional: true,
    label: 'Model',
    description: 'What it draws as when placed in a space: the engine’s figure when left out',
  },
  figure: {
    kind: 'group',
    optional: true,
    label: 'Figure',
    description: 'How the engine draws it without a model: standing, facing the way it is placed',
    fields: {
      height: {
        kind: 'number',
        min: 0.5,
        max: 2.5,
        optional: true,
        label: 'Height',
        description: 'In metres: 1.75 when left out',
      },
      clothes: { kind: 'colour', optional: true, label: 'Clothes' },
      trim: { kind: 'colour', optional: true, label: 'Trim', description: 'The band at its waist' },
      skin: { kind: 'colour', optional: true, label: 'Skin' },
    },
  },
};

const BY_KIT: Readonly<Record<string, Fields>> = {
  [DIALOGUE]: {
    talk: {
      kind: 'ref',
      to: TALK,
      optional: true,
      label: 'Talk',
      description: 'What Interact opens when the player walks up to it: its prompt says Talk',
    },
  },
  [FACTIONS]: {
    faction: {
      kind: 'ref',
      to: FACTION,
      optional: true,
      label: 'Faction',
      description: 'Who it belongs to: factions.band-of reads the party’s band with them',
    },
  },
  [INVENTORY]: {
    carries: {
      kind: 'map',
      key: { kind: 'ref', to: ITEM },
      of: { kind: 'int', min: 1 },
      optional: true,
      label: 'Carries',
      description: 'Its bag at the start, by item: give and take change it in play',
    },
  },
};

/** An actor's NPC fields with these kits on: the look first, then each kit's in the kits' order. */
export function npcFields(on: readonly string[]): Fields {
  const fields: Record<string, Fields[string]> = { ...LOOK };
  for (const kit of [DIALOGUE, FACTIONS, INVENTORY]) if (on.includes(kit)) Object.assign(fields, BY_KIT[kit]);
  return fields;
}
