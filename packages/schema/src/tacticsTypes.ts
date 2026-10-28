/**
 * The tactics kit's record types (M7.5, D87, docs/specs/tactics.md#records), as type files: the stats and
 * numbers a battle reads, guns, orders and battles; an actor's gun and order; and start-battle. A battle's
 * space and objects are names the compiler checks against the spaces (E096).
 */
import {
  ACTOR,
  BATTLE,
  BATTLE_RULES,
  GUN,
  NUMBERS,
  type Numbers,
  ORDER,
  ORDER_KINDS,
  STAT,
  STATUS,
  TACTICS,
  TEAMS,
} from '@eb/kits';
import type { EffectFile } from './kitEffects.ts';
import { NAME } from './kitFields.ts';
import type { FieldDef, Fields, TypeFile } from './typeFile.ts';

/** The most of each number a battle-rules record may set. */
const NUMBER_MOST: Readonly<Record<keyof Numbers, number>> = {
  'action-points': 4,
  'half-cover': 100,
  'full-cover': 100,
  overwatch: 100,
  'flank-crit': 100,
  close: 40,
  mid: 40,
  sight: 40,
  bleed: 10,
  'forgiving-step': 100,
  'forgiving-most': 100,
};

const WORDS: Readonly<Record<keyof Numbers, [string, string]>> = {
  'action-points': ['Action points', 'What each unit has a turn'],
  'half-cover': ['Half cover', 'Taken off a shot at someone in half cover'],
  'full-cover': ['Full cover', 'Taken off a shot at someone in full cover'],
  overwatch: ['Overwatch', 'Taken off a shot on overwatch'],
  'flank-crit': ['Flank crit', 'Added to the crit chance at someone with no cover'],
  close: ['Close', 'The most tiles a shot is close at'],
  mid: ['Mid', 'The most tiles a shot is mid at; past it, long'],
  sight: ['Sight', 'The most tiles anyone sees'],
  bleed: ['Bleed', 'Their own turns a crew member who is down has before they are out'],
  'forgiving-step': ['Forgiving step', 'Added to the crew’s shots for each miss in a row, with forgiving odds on'],
  'forgiving-most': ['Forgiving most', 'The most forgiving odds add'],
};

const stat = (label: string, description: string, optional = false): FieldDef => ({
  kind: 'ref',
  to: STAT,
  ...(optional ? { optional } : {}),
  label,
  description,
});

const numbers: Fields = Object.fromEntries(
  (Object.keys(NUMBERS) as (keyof Numbers)[]).map((key) => {
    const [label, description] = WORDS[key];
    const field: FieldDef = {
      kind: 'int',
      min: key === 'action-points' || key === 'sight' ? 1 : 0,
      max: NUMBER_MOST[key],
      optional: true,
      label,
      description: `${description}: ${NUMBERS[key]} when left out`,
    };
    return [key, field];
  }),
);

export const BATTLE_RULES_TYPE_FILE: TypeFile = {
  title: 'Battle rules',
  description: 'The stats a battle reads a unit’s numbers from, and its numbers, Space-Wrecked’s when left out.',
  nameField: 'name',
  fields: {
    name: NAME,
    health: stat('Health', 'A unit’s hit points: the crew’s what is left of it, the foes’ all of it'),
    aim: stat('Aim', 'A unit’s chance to hit, in percent, before the gun, cover and the rest'),
    defense: stat('Defense', 'Taken off the chance to hit this unit: 0 when left out', true),
    armor: stat('Armor', 'Taken off each hit this unit takes, which takes off at least 1: 0 when left out', true),
    mobility: stat('Mobility', 'The tiles a unit moves for one action point'),
    ...numbers,
  },
};

const percent = (label: string, description: string): FieldDef => ({
  kind: 'int',
  min: -100,
  max: 100,
  label,
  description,
});

export const GUN_TYPE_FILE: TypeFile = {
  title: 'Gun',
  description: 'What a unit shoots with: its damage, its accuracy at each range, its crits and its clip.',
  nameField: 'name',
  fields: {
    name: NAME,
    damage: {
      kind: 'group',
      label: 'Damage',
      description: 'A hit does from the least to the most, both included',
      fields: {
        least: { kind: 'int', min: 0, max: 99, label: 'Least' },
        most: { kind: 'int', min: 0, max: 99, label: 'Most' },
      },
    },
    accuracy: {
      kind: 'group',
      label: 'Accuracy',
      description: 'Added to the chance to hit at each range',
      fields: {
        close: percent('Close', 'Within close range'),
        mid: percent('Mid', 'Within mid range'),
        long: percent('Long', 'Beyond it'),
      },
    },
    crit: { kind: 'int', min: 0, max: 100, label: 'Crit (%)', description: 'The chance a hit is a crit' },
    'crit-damage': { kind: 'int', min: 0, max: 99, label: 'Crit damage', description: 'Added to a crit’s damage' },
    clip: { kind: 'int', min: 1, max: 99, label: 'Clip', description: 'The shots it holds; a reload fills it' },
  },
};

const orderNumber = (label: string, min: number, max: number, description: string): FieldDef => ({
  kind: 'int',
  min,
  max,
  optional: true,
  label,
  description,
});

export const ORDER_TYPE_FILE: TypeFile = {
  title: 'Order',
  description: 'A crew member’s order, usable a few times a fight. Each kind reads one number.',
  nameField: 'name',
  fields: {
    name: NAME,
    kind: { kind: 'enum', values: ORDER_KINDS, label: 'Kind' },
    uses: { kind: 'int', min: 1, max: 9, label: 'Uses', description: 'How many times a fight' },
    aim: orderNumber(
      'Aim',
      -100,
      100,
      'Suppress: below 0, off the target’s shots; mark: added to shots at it; sedate: added to the dart',
    ),
    rounds: orderNumber('Rounds', 1, 20, 'Weld: the rounds the door holds, this one counted'),
    hp: orderNumber('Hit points', 1, 99, 'Patch: what it gives back'),
    ap: orderNumber('Action points', 1, 3, 'Hustle: what it adds this turn'),
    armor: orderNumber('Armor', 1, 9, 'Kit: what it adds for the fight'),
  },
};

const posts = (label: string, description: string): FieldDef => ({
  kind: 'list',
  min: 1,
  max: 12,
  label,
  description,
  of: {
    kind: 'group',
    fields: {
      actor: { kind: 'ref', to: ACTOR, label: 'Actor' },
      at: { kind: 'text', min: 1, label: 'At', description: 'An object of the space, whose tile the unit starts on' },
    },
  },
});

const results = (label: string, after: string): FieldDef => ({
  kind: 'effects',
  optional: true,
  label,
  description: `What ${after} does`,
});

export const BATTLE_TYPE_FILE: TypeFile = {
  title: 'Battle',
  description:
    'A fight on a 2D space’s tilemap, the crew against the foes, sides taking turns. Start it with Start a battle.',
  nameField: 'name',
  fields: {
    name: NAME,
    rules: { kind: 'ref', to: BATTLE_RULES, label: 'Rules' },
    space: { kind: 'text', min: 1, label: 'Space', description: 'A 2D space with a tilemap' },
    crew: posts('Crew', 'The player’s side, played by tapping: each actor once'),
    foes: posts('Foes', 'The other side, played by the AI: an actor may stand here more than once'),
    first: {
      kind: 'enum',
      values: TEAMS,
      optional: true,
      label: 'First',
      description: 'The side that plays first: crew when left out',
    },
    forgiving: {
      kind: 'bool',
      optional: true,
      label: 'Forgiving',
      description: 'The crew’s misses in a row raise their next shot’s odds',
    },
    permadeath: { kind: 'bool', optional: true, label: 'Permadeath', description: 'Bleeding out is death' },
    press: {
      kind: 'bool',
      optional: true,
      label: 'Foes press on',
      description: 'The foes walk toward the crew when they see no one',
    },
    win: results('Win', 'winning'),
    lose: results('Lose', 'losing'),
    falls: {
      kind: 'ref',
      to: STATUS,
      optional: true,
      label: 'Falls',
      description: 'Added to each of the crew who ends the fight out or dead',
    },
  },
};

/** What the kit adds to an actor: its gun and its order. */
export const TACTICS_ACTOR_FIELDS: Fields = {
  gun: {
    kind: 'ref',
    to: GUN,
    optional: true,
    label: 'Gun',
    description: 'What it shoots with in a battle: with none it can’t shoot, watch or reload',
  },
  order: { kind: 'ref', to: ORDER, optional: true, label: 'Order', description: 'Its order in a battle, on the crew' },
};

export const TACTICS_TYPE_FILES: Readonly<Record<string, TypeFile>> = {
  [BATTLE_RULES]: BATTLE_RULES_TYPE_FILE,
  [GUN]: GUN_TYPE_FILE,
  [ORDER]: ORDER_TYPE_FILE,
  [BATTLE]: BATTLE_TYPE_FILE,
};

export const TACTICS_EFFECT_FILES: readonly EffectFile[] = [
  {
    effect: 'start-battle',
    kit: TACTICS,
    label: 'Start a battle',
    fields: { battle: { kind: 'ref', to: BATTLE, label: 'Battle', description: 'Fought on its space at once' } },
  },
];
