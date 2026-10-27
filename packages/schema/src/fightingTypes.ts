/**
 * The fighting kit's fields (M6.4, D76, docs/specs/combat.md): an item's weapon, and what an actor
 * does as it falls. A weapon is one group for both kinds, the fields the other kind reads left out
 * (W151 when given), so a sword made a bow keeps its damage.
 */
import { ACTOR, COMBAT, FISTS, ITEM, LOOT_TABLE, MELEE_DEFAULTS, RANGED_DEFAULTS } from '@eb/kits';
import type { Fields } from './typeFile.ts';

const MS = { kind: 'int', min: 0, max: 10_000, optional: true } as const;

/** The item's `weapon` group, with the fighting kit on. */
export const WEAPON_FIELDS: Fields = {
  weapon: {
    kind: 'group',
    optional: true,
    label: 'Weapon',
    description: `What it does as a weapon, worn: an actor wearing none fights with its fists (${FISTS.damage} damage)`,
    fields: {
      kind: { kind: 'enum', values: ['melee', 'ranged'], label: 'Kind' },
      damage: {
        kind: 'int',
        min: 1,
        max: 999,
        label: 'Damage',
        description: "Added to the wielder's damage stat, less the target's armour; never less than 1",
      },
      reach: {
        kind: 'number',
        min: 0.5,
        max: 10,
        optional: true,
        label: 'Reach',
        description: `Melee: metres from the wielder's centre a swing reaches (${MELEE_DEFAULTS.reach})`,
      },
      arc: {
        kind: 'int',
        min: 10,
        max: 360,
        optional: true,
        label: 'Arc',
        description: `Melee: how wide a swing is, in degrees (${MELEE_DEFAULTS.arc})`,
      },
      windup: { ...MS, label: 'Wind-up', description: `Melee: ms before it can hit (${MELEE_DEFAULTS.windup})` },
      strike: { ...MS, label: 'Strike', description: `Melee: ms while it can hit (${MELEE_DEFAULTS.strike})` },
      range: {
        kind: 'number',
        min: 1,
        max: 200,
        optional: true,
        label: 'Range',
        description: `Ranged: the farthest the wielder aims, in metres (${RANGED_DEFAULTS.range})`,
      },
      speed: {
        kind: 'number',
        min: 5,
        max: 200,
        optional: true,
        label: 'Speed',
        description: `Ranged: metres a second as the shot leaves (${RANGED_DEFAULTS.speed})`,
      },
      draw: { ...MS, label: 'Draw', description: `Ranged: ms before it looses (${RANGED_DEFAULTS.draw})` },
      recover: {
        ...MS,
        label: 'Recover',
        description: `ms after, before the next (${MELEE_DEFAULTS.recover} melee, ${RANGED_DEFAULTS.recover} ranged)`,
      },
      ammo: {
        kind: 'ref',
        to: ITEM,
        optional: true,
        label: 'Ammo',
        description: "Ranged: what each of the player's shots takes from the bag; NPCs shoot without",
      },
    },
  },
};

/** An actor's fields with the fighting kit on. */
export const FALLING_FIELDS: Fields = {
  drops: {
    kind: 'ref',
    to: LOOT_TABLE,
    optional: true,
    label: 'Drops',
    description: 'Rolled into its own bag as it falls, for the player to search',
  },
  'on-fall': {
    kind: 'effects',
    optional: true,
    label: 'On fall',
    description: 'What happens as it falls: @self is the actor',
  },
  essential: {
    kind: 'bool',
    optional: true,
    label: 'Essential',
    description: 'Struck to nothing, it goes down and gets up again rather than falling (M6.10)',
  },
};

/**
 * E090: an essential actor never falls, so its drops and on-fall would never run (M6.10, D82). The
 * player's essential is caught with project.json's fighting, by checkFightingNames.
 */
export function checkEssential(actor: unknown, report: (code: 'E090', path: string, message: string) => void): void {
  const value = actor as { essential?: unknown; drops?: unknown; 'on-fall'?: unknown } | null;
  if (value?.essential !== true) return;
  for (const field of ['drops', 'on-fall'] as const)
    if (value[field] !== undefined)
      report('E090', `/${field}`, `An essential actor never falls, so its ${field} would never run`);
}

const MELEE_ONLY = ['reach', 'arc', 'windup', 'strike'] as const;
const RANGED_ONLY = ['range', 'speed', 'draw', 'ammo'] as const;

/** W151: a weapon's fields its kind doesn't read. */
export function checkWeapon(item: unknown, report: (code: 'W151', path: string, message: string) => void): void {
  const weapon = (item as { weapon?: Record<string, unknown> } | null)?.weapon;
  if (weapon === undefined) return;
  const melee = weapon.kind === 'melee';
  for (const field of melee ? RANGED_ONLY : MELEE_ONLY) {
    if (weapon[field] === undefined) continue;
    const kind = melee ? 'melee' : 'ranged';
    report(
      'W151',
      `/weapon/${field}`,
      `A ${kind} weapon doesn't read its ${field}: take it out, or make it ${melee ? 'ranged' : 'melee'}`,
    );
  }
}

export interface FightingProblem {
  readonly code: 'E082' | 'E090';
  readonly path: string;
  readonly message: string;
}

/**
 * E082 for project.json's fighting against the records and the spaces: its player an actor placed
 * in no space (the player is no NPC), its combat a combat record. The compiler's and the editor's.
 */
export function checkFightingNames(
  fighting: { readonly player: string; readonly combat: string },
  has: (type: string, id: string) => boolean,
  placed: (actor: string) => string | undefined,
  essential: (actor: string) => boolean = () => false,
): FightingProblem[] {
  const problems: FightingProblem[] = [];
  const { player, combat } = fighting;
  if (!has(ACTOR, player))
    problems.push({
      code: 'E082',
      path: '/fighting/player',
      message: `There is no actor "${player}" to be the player`,
    });
  else {
    if (essential(player))
      problems.push({
        code: 'E090',
        path: '/fighting/player',
        message: `"${player}" is essential, but the player falls as the game ends: only an NPC can be essential`,
      });
    const space = placed(player);
    if (space !== undefined)
      problems.push({
        code: 'E082',
        path: '/fighting/player',
        message: `"${player}" is placed in the space "${space}" as an NPC: the player is placed by spawn points, not as an actor`,
      });
  }
  if (!has(COMBAT, combat))
    problems.push({
      code: 'E082',
      path: '/fighting/combat',
      message: `There is no combat record "${combat}" to say which stats a hit reads`,
    });
  return problems;
}
