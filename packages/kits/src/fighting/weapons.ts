/**
 * What an actor fights with and what a hit of it does (D76): the first worn item with a weapon, by
 * slot, or else fists; and `max(1, damage + the wielder's damage − the target's armour)`, the stats
 * the project's combat record names. No roll, so a screen's preview of it is the hurt itself.
 */
import type { FactArgs, RecordStore } from '@eb/core';
import type { CombatRecord } from '../encounters/types.ts';
import { COMBAT } from '../encounters/types.ts';
import { SLOT } from '../gear/types.ts';
import { ITEM } from '../inventory/types.ts';
import { FISTS, type FightingDef, type Weapon } from './types.ts';

type Fact = (id: string, args?: FactArgs) => unknown;

export interface Wielded {
  /** The weapon's item, or "" for fists. */
  readonly item: string;
  readonly weapon: Weapon;
}

/** The weapon an item is, or undefined for an item that isn't one or isn't there. */
export function weaponOfItem(content: RecordStore, item: unknown): Weapon | undefined {
  if (typeof item !== 'string' || !content.has(ITEM, item)) return undefined;
  return (content.get(ITEM, item) as { weapon?: Weapon }).weapon;
}

/** What the actor wields: the first of its slots, in slot order, wearing a weapon; else fists. */
export function wielded(content: RecordStore, fact: Fact, actor: string): Wielded {
  for (const slot of content.ids(SLOT)) {
    const item = fact('gear.in-slot', { actor, slot });
    const weapon = weaponOfItem(content, item);
    if (weapon) return { item: item as string, weapon };
  }
  return { item: '', weapon: FISTS };
}

/** The combat record the project's fighting names, or a thrown error: E082 keeps a bad one from content. */
export function combatOf(content: RecordStore, def: FightingDef): CombatRecord {
  if (!content.has(COMBAT, def.combat)) throw new Error(`fighting: no combat record "${def.combat}"`);
  return content.get(COMBAT, def.combat) as CombatRecord;
}

const statOf = (fact: Fact, actor: string, stat: string | undefined) =>
  stat === undefined ? 0 : (fact('stats.value', { actor, stat }) as number);

/** What a hit of `weapon` by `by` takes off `on`'s health: never less than 1. */
export function hurtOf(fact: Fact, combat: CombatRecord, by: string, on: string, weapon: Weapon): number {
  return Math.max(1, weapon.damage + statOf(fact, by, combat.damage) - statOf(fact, on, combat.armour));
}
