/**
 * The encounters kit's record types (M4.7, D57, docs/specs/encounters.md#records), as type files:
 * the stats a fight reads, and an encounter of foes with what each result does. A fallen fighter
 * leaving the roster needs the roster kit: without it, a `leave` is W137.
 */
import { ACTOR, COMBAT, HIT_MAX, HIT_MIN, ROUNDS, STAT, STATUS } from '@eb/kits';
import { DESCRIPTION, NAME } from './kitFields.ts';
import type { FieldDef, TypeFile } from './typeFile.ts';

/** The most of one foe an encounter lists, and the most rounds a fight lasts. */
export const MOST_OF_A_FOE = 9;
export const MOST_ROUNDS = 50;

const stat = (label: string, description: string, optional = false): FieldDef => ({
  kind: 'ref',
  to: STAT,
  ...(optional ? { optional } : {}),
  label,
  description,
});

const percent = (label: string, description: string): FieldDef => ({
  kind: 'int',
  min: 0,
  max: 100,
  optional: true,
  label,
  description,
});

export const COMBAT_TYPE_FILE: TypeFile = {
  title: 'Combat',
  description: 'The stats a fight reads: health, the chance to hit, damage, and what blunts them.',
  nameField: 'name',
  fields: {
    name: NAME,
    health: stat('Health', 'What a hit takes off: a fighter with none left is down'),
    hit: stat('Hit', 'A fighter’s chance to hit, in percent, before the target’s dodge'),
    dodge: stat('Dodge', 'Taken off the hit of anyone striking this fighter', true),
    damage: stat('Damage', 'What each hit takes off'),
    armour: stat('Armour', 'Taken off each hit this fighter takes, which takes off at least 1', true),
    'hit-min': percent('Least hit (%)', `A hit’s chance is never below this: ${HIT_MIN} when left out`),
    'hit-max': percent('Most hit (%)', `Nor above this: ${HIT_MAX} when left out`),
    rounds: {
      kind: 'int',
      min: 1,
      max: MOST_ROUNDS,
      optional: true,
      label: 'Rounds',
      description: `The most a fight lasts, then it is a draw: ${ROUNDS} when left out`,
    },
  },
};

const results = (result: string, after: string): FieldDef => ({
  kind: 'effects',
  optional: true,
  label: result,
  description: `What ${after} does`,
});

export const ENCOUNTER_TYPE_FILE: TypeFile = {
  title: 'Encounter',
  description: 'Foes to fight, and what a win, a draw and a loss do. A choice fights it with the Fight effect.',
  nameField: 'name',
  fields: {
    name: NAME,
    description: DESCRIPTION,
    combat: { kind: 'ref', to: COMBAT, label: 'Combat', description: 'The stats this fight reads' },
    foes: {
      kind: 'list',
      min: 1,
      label: 'Foes',
      description: 'In line, the front first: each takes the blows until it falls',
      of: {
        kind: 'group',
        fields: {
          actor: { kind: 'ref', to: ACTOR, label: 'Actor' },
          count: {
            kind: 'int',
            min: 1,
            max: MOST_OF_A_FOE,
            optional: true,
            label: 'How many',
            description: '1 when left out',
          },
        },
      },
    },
    fighters: {
      kind: 'list',
      min: 1,
      optional: true,
      of: { kind: 'ref', to: ACTOR },
      label: 'Fighters',
      description: 'Who fights for the player, the front first: the roster’s members when left out',
    },
    breaks: {
      kind: 'int',
      min: 1,
      max: 100,
      optional: true,
      label: 'Foes break at (%)',
      description: 'The share of their health lost at which the foes break: 100 when left out, to the last',
    },
    win: results('Win', 'winning'),
    draw: results('Draw', 'a draw, when both sides fall at once or the rounds run out,'),
    lose: results('Lose', 'losing'),
    falls: {
      kind: 'group',
      optional: true,
      label: 'Falls',
      description: 'What happens to each of the party whose health a fight takes to nothing',
      fields: {
        status: { kind: 'ref', to: STATUS, optional: true, label: 'Status', description: 'Added to each who falls' },
        leave: {
          kind: 'text',
          min: 1,
          optional: true,
          label: 'Leaves, because',
          description: 'A member who falls leaves the roster, for this reason: “fell in the pits”',
        },
      },
    },
  },
};
