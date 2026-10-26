/**
 * A fall and a search (D76, docs/specs/combat.md#a-fall): an actor whose health runs out falls once,
 * its drops rolled into its own bag and its on-fall effects run; an NPC lies down in the world
 * module, and the player's game stops in the fallen mode. A body's search opens the inventory kit's
 * container mode on its bag (M6.8, D80), where its lines are taken one at a time.
 */
import type { Action, ModuleContext } from '@eb/core';
import { bind } from '../quests/slots.ts';
import { ACTOR } from '../stats/types.ts';
import { FALLEN, type FightingActor, type FightingDef, type FightingSlice } from './types.ts';

type Ctx = ModuleContext<FightingSlice>;

/** The actor falls, once: `by` is who struck the last blow, "" for a fall no hit made. */
export function fall(ctx: Ctx, def: FightingDef, actor: string, by: string): void {
  if (ctx.read().fallen.includes(actor)) return;
  const slice = ctx.write() as { fallen: readonly string[] };
  slice.fallen = [...slice.fallen, actor];
  ctx.emit('fell', { actor, by });
  const record = (ctx.content.get(ACTOR, actor) ?? {}) as FightingActor;
  if (record.drops !== undefined) ctx.apply({ effect: 'roll-loot', actor, table: record.drops });
  for (const effect of record['on-fall'] ?? []) ctx.apply(bind(effect, { self: actor }));
  if (actor === def.player) ctx.modes.push(FALLEN);
  else if (ctx.fact('world.npc-space', { actor }) !== undefined) ctx.apply({ effect: 'fall', actor });
}

/** `fighting/search { actor }`: a fallen NPC's bag opened, to take from and put into. */
export function search(ctx: Ctx, def: FightingDef | undefined, action: Action): void {
  if (def === undefined) ctx.refuse('not-walked');
  const { actor } = action as Action & { actor?: unknown };
  if (typeof actor !== 'string' || !ctx.content.has(ACTOR, actor)) ctx.refuse('bad-search');
  if (!ctx.read().fallen.includes(actor) || actor === def.player) ctx.refuse('not-fallen', { actor });
  if (!inSpace(ctx, actor)) ctx.refuse('elsewhere', { actor });
  ctx.apply({ effect: 'open-container', actor });
  const slice = ctx.write() as { searched: readonly string[] };
  if (!slice.searched.includes(actor)) slice.searched = [...slice.searched, actor].sort();
  ctx.emit('searched', { actor });
}

/** Whether a placed NPC stands in the space the player is in. */
export function inSpace(ctx: Ctx, actor: string): boolean {
  const space = ctx.fact('world.npc-space', { actor });
  return typeof space === 'string' && ctx.fact('world.in', { space }) === true;
}
