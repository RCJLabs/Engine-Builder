/**
 * The fighting kit (M6.4, D76, docs/specs/combat.md): weapons on items, hits the stage finds and the
 * sim resolves, falls, bodies and their search. Apart from the module so the schema's checks read
 * them without the sim code.
 */
import type { Effect } from '@eb/core';

/** The kit's id, which is its module's. */
export const FIGHTING = 'fighting';
/** The mode a fallen player's game stops in: nothing is on offer. */
export const FALLEN = 'fallen';

/** project.json's `fighting`, carried by packs from format 13: who the player is and the stats a fight reads. */
export interface FightingDef {
  /** The actor who is the player in a walked space. */
  readonly player: string;
  /** The combat record whose health, damage and armour a hit reads. */
  readonly combat: string;
}

export interface MeleeWeapon {
  readonly kind: 'melee';
  readonly damage: number;
  /** Metres from the wielder's centre a swing reaches. */
  readonly reach?: number;
  /** Degrees wide. */
  readonly arc?: number;
  /** Milliseconds before a swing can hit, while it can, and after. */
  readonly windup?: number;
  readonly strike?: number;
  readonly recover?: number;
}

export interface RangedWeapon {
  readonly kind: 'ranged';
  readonly damage: number;
  /** Metres: the farthest the wielder aims. */
  readonly range?: number;
  /** Metres a second as the arrow leaves. */
  readonly speed?: number;
  /** Milliseconds before it looses, and after. */
  readonly draw?: number;
  readonly recover?: number;
  /** The item each of the player's shots takes from the party's bag. */
  readonly ammo?: string;
}

export type Weapon = MeleeWeapon | RangedWeapon;

/** An actor's fists, when it wears no weapon. */
export const FISTS: MeleeWeapon = {
  kind: 'melee',
  damage: 1,
  reach: 1.2,
  arc: 90,
  windup: 200,
  strike: 100,
  recover: 300,
};

/** A melee weapon's and a ranged weapon's numbers when its record leaves them out. */
export const MELEE_DEFAULTS = { reach: 2, arc: 100, windup: 250, strike: 150, recover: 350 } as const;
export const RANGED_DEFAULTS = { range: 30, speed: 40, draw: 500, recover: 400 } as const;

/** The fields the kit reads off an actor. */
export interface FightingActor {
  /** A loot table rolled into its own bag as it falls. */
  readonly drops?: string;
  /** Run as it falls, `@self` the actor. */
  readonly 'on-fall'?: readonly Effect[];
  /** M6.10 (D82): its health run out, it is down rather than fallen, and gets up again. */
  readonly essential?: boolean;
}

export interface FightingSlice {
  /** Who has fallen, in the order they fell: the player among them once they fall. */
  readonly fallen: readonly string[];
  /** The fallen NPCs searched, sorted. */
  readonly searched: readonly string[];
  /** Essential NPCs down for now, sorted (M6.10, D82): out of the fight until they rise. */
  readonly down: readonly string[];
}
