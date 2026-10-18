/**
 * Damage, healing and bases (docs/specs/stats.md, D41). Damage is kept apart from a value, as
 * Bethesda's actor values keep it, so a maximum that rises raises what is left by as much, and
 * one that falls takes it down without losing the damage.
 */
import type { ModuleContext } from '@eb/core';
import { setNumber } from './state.ts';
import type { StatsSlice } from './types.ts';
import { actorState, currentOf, lowest, statRecord } from './values.ts';

/** A whole number of 1 or more, or the effect throws: validation stops it in content. */
export function countOf(n: unknown, effect: string, field: string): number {
  if (!Number.isSafeInteger(n) || (n as number) < 1)
    throw new Error(`${effect}: "${field}" is a whole number, 1 or more`);
  return n as number;
}

/** Adds to the base, below 0 taking away. */
export function addToStat(ctx: ModuleContext<StatsSlice>, actor: string, stat: string, by: unknown): void {
  if (!Number.isSafeInteger(by)) throw new Error('add-to-stat: "by" is a whole number');
  statRecord(ctx.content, stat);
  if (by === 0) return;
  const raised = actorState(ctx.read(), actor).raised?.[stat] ?? 0;
  setNumber(ctx, actor, 'raised', stat, raised + (by as number));
  ctx.emit('base-changed', { actor, stat, by });
}

/** Takes from what is left, never past the stat's min: says by how much, and when it runs out. */
export function damageStat(
  ctx: ModuleContext<StatsSlice>,
  actor: string,
  stat: string,
  by: number,
  value: number,
): void {
  const current = currentOf(ctx.content, ctx.read(), actor, stat, value);
  const floor = lowest(statRecord(ctx.content, stat));
  const take = Math.min(by, current - floor);
  if (take <= 0) return;
  const damage = actorState(ctx.read(), actor).damage?.[stat] ?? 0;
  setNumber(ctx, actor, 'damage', stat, damage + take);
  ctx.emit('damaged', { actor, stat, by: take });
  if (current - take === floor) ctx.emit('emptied', { actor, stat });
}

/**
 * Takes damage off, all of it when `by` is left out, and says how much. Damage kept past a fallen
 * maximum comes off first, so healing it may leave what is left where it was.
 */
export function healStat(ctx: ModuleContext<StatsSlice>, actor: string, stat: string, by: number | undefined): void {
  statRecord(ctx.content, stat);
  const damage = actorState(ctx.read(), actor).damage?.[stat] ?? 0;
  const give = Math.min(by ?? damage, damage);
  if (give <= 0) return;
  setNumber(ctx, actor, 'damage', stat, damage - give);
  ctx.emit('healed', { actor, stat, by: give });
}
