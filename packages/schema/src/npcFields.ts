/**
 * What an actor gains to stand in a space as an NPC (M6.1, D73, docs/specs/npcs.md#the-actors-fields):
 * its look, always (a sprite and a speed for a 2D space since M7.1, D83), and with each kit on, its talk, its faction and what it carries; with the ai
 * kit (M6.3, D75), its behaviour and its senses; with the fighting kit (M6.4, D76), its drops and
 * what happens as it falls, which the player's actor has too; with the economy kit (M6.8, D80), its purse.
 */
import {
  AI,
  BEHAVIOUR,
  CONE_DEG,
  DIALOGUE,
  ECONOMY,
  FACTION,
  FACTIONS,
  FIGHTING,
  HEARING_M,
  INVENTORY,
  ITEM,
  RESOURCE,
  SIGHT_M,
  TALK,
} from '@eb/kits';
import { ANIMATOR } from './animatorTypes.ts';
import { FALLING_FIELDS } from './fightingTypes.ts';
import { MODEL } from './modelTypes.ts';
import { SPRITE } from './spriteTypes.ts';
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
    description: 'How the engine draws it without a model: the starter character in these colours, at this height',
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
  animator: {
    kind: 'ref',
    to: ANIMATOR,
    optional: true,
    label: 'Animator',
    description: 'How it moves (M6.5): the engine’s stock animator when left out',
  },
  // M7.1 (D83): what it draws as in a 2D space, and how fast it walks there.
  sprite: {
    kind: 'ref',
    to: SPRITE,
    optional: true,
    label: 'Sprite',
    description: 'What it draws as in a 2D space: it plays walk as it moves and idle as it stands, when it has them',
  },
  speed: {
    kind: 'number',
    min: 1,
    max: 1000,
    optional: true,
    label: 'Speed',
    description: 'In a 2D space, art pixels a second: 24 when left out',
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
  [ECONOMY]: {
    purse: {
      kind: 'map',
      key: { kind: 'ref', to: RESOURCE },
      of: { kind: 'int', min: 0 },
      optional: true,
      label: 'Purse',
      description: 'What it holds of each resource at the start: a shop it keeps buys with it',
    },
  },
  [AI]: {
    behaviour: {
      kind: 'ref',
      to: BEHAVIOUR,
      optional: true,
      label: 'Behaviour',
      description: 'What it does, and when: it stands where it is placed when left out',
    },
    sight: {
      kind: 'number',
      min: 0,
      max: 100,
      optional: true,
      label: 'Sight',
      description: `How far it sees, in metres: ${SIGHT_M} when left out, 0 blind`,
    },
    cone: {
      kind: 'int',
      min: 1,
      max: 360,
      optional: true,
      label: 'Cone',
      description: `How wide it sees, in degrees: ${CONE_DEG} when left out`,
    },
    hearing: {
      kind: 'number',
      min: 0,
      max: 100,
      optional: true,
      label: 'Hearing',
      description: `How far it hears, in metres: ${HEARING_M} when left out, 0 deaf`,
    },
  },
  [FIGHTING]: FALLING_FIELDS,
};

/** An actor's NPC fields with these kits on: the look first, then each kit's in the kits' order. */
export function npcFields(on: readonly string[]): Fields {
  const fields: Record<string, Fields[string]> = { ...LOOK };
  for (const kit of [DIALOGUE, FACTIONS, INVENTORY, ECONOMY, AI, FIGHTING])
    if (on.includes(kit)) Object.assign(fields, BY_KIT[kit]);
  return fields;
}
