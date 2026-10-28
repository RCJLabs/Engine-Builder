/**
 * The tactics kit's records, read by id (M7.5, D87, docs/specs/tactics.md#records): validation stops content
 * naming one that isn't there (E005, E035), and E096 a battle whose space has no tilemap.
 */
import { gridOf, type PackTiles, type RecordStore } from '@eb/core';
import { ACTOR } from '../stats/types.ts';
import type { Arena } from './field.ts';
import {
  BATTLE,
  BATTLE_RULES,
  type BattleRecord,
  type BattleRulesRecord,
  GUN,
  type GunRecord,
  NUMBERS,
  type Numbers,
  ORDER,
  type OrderRecord,
} from './types.ts';

function recordOf<T>(content: RecordStore, type: string, id: unknown): T {
  if (typeof id !== 'string' || !content.has(type, id)) throw new Error(`No ${type} "${String(id)}"`);
  return content.get(type, id) as T;
}

export const battleRecord = (content: RecordStore, id: unknown): BattleRecord => recordOf(content, BATTLE, id);
export const rulesRecord = (content: RecordStore, id: unknown): BattleRulesRecord =>
  recordOf(content, BATTLE_RULES, id);

/** The numbers a battle-rules record gives, each left out at Space-Wrecked's. */
export function numbersOf(rules: BattleRulesRecord): Numbers {
  const out: Record<string, number> = { ...NUMBERS };
  for (const key of Object.keys(NUMBERS) as (keyof Numbers)[]) {
    const value = rules[key];
    if (typeof value === 'number') out[key] = value;
  }
  return out as unknown as Numbers;
}

/** An actor's gun and order, the fields the kit adds to it. */
export function kitOf(content: RecordStore, actor: string): { gun: string | null; order: string | null } {
  const record = recordOf<{ gun?: string; order?: string }>(content, ACTOR, actor);
  return { gun: record.gun ?? null, order: record.order ?? null };
}

/** What a battle is fought with: its space's tilemap, its rules' numbers, its options, the guns and orders. */
export function arenaOf(content: RecordStore, tiles: Readonly<Record<string, PackTiles>>, id: string): Arena {
  const record = battleRecord(content, id);
  const map = Object.hasOwn(tiles, record.space) ? tiles[record.space] : undefined;
  if (!map) throw new Error(`The battle "${id}" is in "${record.space}", which has no tilemap`);
  return {
    grid: gridOf(map),
    numbers: numbersOf(rulesRecord(content, record.rules)),
    forgiving: record.forgiving === true,
    permadeath: record.permadeath === true,
    press: record.press === true,
    gun: (gun) => recordOf<GunRecord>(content, GUN, gun),
    order: (order) => recordOf<OrderRecord>(content, ORDER, order),
  };
}
