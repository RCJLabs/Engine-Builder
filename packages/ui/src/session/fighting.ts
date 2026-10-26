/**
 * What the stage reads of a walked space's fights (M6.4, D76, docs/specs/combat.md): who the player
 * is, what each fighter here wields with its numbers filled in, who has fallen, who has been searched
 * and which two NPCs are engaged. The sim decides every hit; this only tells the stage how to time and
 * aim one, and where the bodies lie.
 */
import { type GameState, npcEngaged, type PackFighting, type RecordStore, WORLD, type WorldSlice } from '@eb/core';
import { ACTOR, FIGHTING, type FightingSlice, MELEE_DEFAULTS, RANGED_DEFAULTS, type Weapon, wielded } from '@eb/kits';

/** A weapon as the stage times it: every number given, `item` "" for fists. */
export interface WeaponView {
  readonly item: string;
  readonly kind: 'melee' | 'ranged';
  readonly damage: number;
  /** Melee: metres a swing reaches and degrees wide; ranged: metres it aims and m/s it leaves at. */
  readonly reach: number;
  readonly arc: number;
  readonly range: number;
  readonly speed: number;
  /** Milliseconds: a swing's wind-up and strike, a shot's draw, and the recovery after either. */
  readonly windup: number;
  readonly strike: number;
  readonly draw: number;
  readonly recover: number;
  readonly ammo?: string;
}

export interface FightView {
  readonly player: string;
  /** The player's and each NPC's of the player's space, by actor. */
  readonly weapons: Readonly<Record<string, WeaponView>>;
  readonly fallen: readonly string[];
  readonly searched: readonly string[];
  /** The NPCs striking the player now, at most two (D76). */
  readonly engaged: readonly string[];
}

/** Its numbers, the kind's defaults where the record leaves them out. */
export function weaponView(item: string, weapon: Weapon): WeaponView {
  const melee = weapon.kind === 'melee' ? weapon : undefined;
  const ranged = weapon.kind === 'ranged' ? weapon : undefined;
  return {
    item,
    kind: weapon.kind,
    damage: weapon.damage,
    reach: melee?.reach ?? MELEE_DEFAULTS.reach,
    arc: melee?.arc ?? MELEE_DEFAULTS.arc,
    range: ranged?.range ?? RANGED_DEFAULTS.range,
    speed: ranged?.speed ?? RANGED_DEFAULTS.speed,
    windup: melee?.windup ?? MELEE_DEFAULTS.windup,
    strike: melee?.strike ?? MELEE_DEFAULTS.strike,
    draw: ranged?.draw ?? RANGED_DEFAULTS.draw,
    recover: weapon.recover ?? (melee ? MELEE_DEFAULTS.recover : RANGED_DEFAULTS.recover),
    ...(ranged?.ammo !== undefined ? { ammo: ranged.ammo } : {}),
  };
}

type Fact = (id: string, args?: Readonly<Record<string, unknown>>) => unknown;

/** The fights' view, in a game with the fighting kit, its fighting and a world; otherwise none. */
export function fightOf(
  state: GameState,
  content: RecordStore,
  fact: Fact,
  fighting: PackFighting | undefined,
): FightView | undefined {
  const slice = state[FIGHTING] as FightingSlice | undefined;
  const world = state[WORLD] as WorldSlice | undefined;
  if (!slice || !world || !fighting) return undefined;
  const here = content.ids(ACTOR).filter((actor) => fact('world.npc-space', { actor }) === world.space);
  const weapons: Record<string, WeaponView> = {};
  for (const actor of [fighting.player, ...here]) {
    const held = wielded(content, fact, actor);
    weapons[actor] = weaponView(held.item, held.weapon);
  }
  return {
    player: fighting.player,
    weapons,
    fallen: slice.fallen,
    searched: slice.searched,
    engaged: here.filter((actor) => npcEngaged(world.npcs, actor)),
  };
}
