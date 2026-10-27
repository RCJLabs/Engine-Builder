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
import { combatOf } from './weapons.ts';

type Ctx = ModuleContext<FightingSlice>;

/**
 * The actor falls, once: `by` is who struck the last blow, "" for a fall no hit made. An essential
 * NPC is down instead (M6.10, D82): nothing dropped or run, no body, and it rises later.
 */
export function fall(ctx: Ctx, def: FightingDef, actor: string, by: string): void {
  if (ctx.read().fallen.includes(actor) || ctx.read().down.includes(actor)) return;
  const record = (ctx.content.get(ACTOR, actor) ?? {}) as FightingActor;
  if (record.essential === true && actor !== def.player) {
    knockDown(ctx, actor, by);
    return;
  }
  const slice = ctx.write() as { fallen: readonly string[] };
  slice.fallen = [...slice.fallen, actor];
  ctx.emit('fell', { actor, by });
  if (record.drops !== undefined) ctx.apply({ effect: 'roll-loot', actor, table: record.drops });
  for (const effect of record['on-fall'] ?? []) ctx.apply(bind(effect, { self: actor }));
  if (actor === def.player) ctx.modes.push(FALLEN);
  else if (ctx.fact('world.npc-space', { actor }) !== undefined) ctx.apply({ effect: 'fall', actor });
}

/** An essential NPC down where it stands: the world module lays it as it lays the fallen. */
function knockDown(ctx: Ctx, actor: string, by: string): void {
  const slice = ctx.write() as { down: readonly string[] };
  slice.down = [...slice.down, actor].sort();
  ctx.emit('downed', { actor, by });
  if (ctx.fact('world.npc-space', { actor }) !== undefined) ctx.apply({ effect: 'fall', actor });
}

/**
 * `fighting/rise { actor }`, the stage's: a down NPC stands again at full health. The stage sends it
 * ten seconds after the NPC went down (RISE_S in the walk's knocked.ts).
 */
export function rise(ctx: Ctx, def: FightingDef | undefined, action: Action): void {
  if (def === undefined) ctx.refuse('not-walked');
  const { actor } = action as Action & { actor?: unknown };
  if (typeof actor !== 'string' || !ctx.read().down.includes(actor)) ctx.refuse('not-down', { actor });
  const slice = ctx.write() as { down: readonly string[] };
  slice.down = slice.down.filter((a) => a !== actor);
  ctx.apply({ effect: 'heal-stat', actor, stat: combatOf(ctx.content, def).health });
  if (ctx.fact('world.npc-space', { actor }) !== undefined) ctx.apply({ effect: 'rise', actor });
  ctx.emit('rose', { actor });
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
