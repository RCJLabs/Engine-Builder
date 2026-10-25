/**
 * A hit and a shot (D76, docs/specs/combat.md#a-hit): the stage found a swing or an arrow reaching
 * its target, and the sim takes the hurt off with the stats kit's damage-stat, no roll; a shot takes
 * its ammo from the party's bag as it looses. Both are the stage's actions, never on offer.
 */
import type { Action, ModuleContext } from '@eb/core';
import { lowest, statRecord } from '../stats/values.ts';
import { fall, inSpace } from './falls.ts';
import type { FightingDef, FightingSlice } from './types.ts';
import { combatOf, hurtOf, wielded } from './weapons.ts';

type Ctx = ModuleContext<FightingSlice>;

/** Whether the actor is there to strike or be struck: the player always, an NPC in the player's space. */
const present = (ctx: Ctx, def: FightingDef, actor: string) => actor === def.player || inSpace(ctx, actor);

/** `fighting/hit { by, on, weapon }`: `weapon` is the item `by` wields, "" for fists. */
export function hit(ctx: Ctx, def: FightingDef | undefined, action: Action): void {
  if (def === undefined) ctx.refuse('not-walked');
  const { by, on, weapon } = action as Action & { by?: unknown; on?: unknown; weapon?: unknown };
  if (typeof by !== 'string' || typeof on !== 'string' || typeof weapon !== 'string') ctx.refuse('bad-hit');
  // The player strikes an NPC or an NPC the player: NPCs don't fight each other yet (D76).
  if ((by === def.player) === (on === def.player)) ctx.refuse('bad-hit', { by, on });
  const { fallen } = ctx.read();
  if (fallen.includes(by) || fallen.includes(on)) ctx.refuse('fallen', { by, on });
  for (const actor of [by, on]) if (!present(ctx, def, actor)) ctx.refuse('elsewhere', { actor });
  // Only an engaged NPC strikes: one circling waits its turn (D76).
  if (by !== def.player && ctx.fact('world.npc-engaged', { actor: by }) !== true) ctx.refuse('not-fighting', { by });
  const held = wielded(ctx.content, ctx.fact, by);
  if (held.item !== weapon) ctx.refuse('not-wielded', { by, weapon });
  const combat = combatOf(ctx.content, def);
  const hurt = hurtOf(ctx.fact, combat, by, on, held.weapon);
  const left = ctx.fact('stats.current', { actor: on, stat: combat.health }) as number;
  ctx.apply({ effect: 'damage-stat', actor: on, stat: combat.health, by: hurt });
  ctx.emit('hit', { by, on, hurt });
  if (left - hurt <= lowest(statRecord(ctx.content, combat.health))) fall(ctx, def, on, by);
}

/** `fighting/loosed { weapon }`: the player looses a shot, its ammo taken first. */
export function loosed(ctx: Ctx, def: FightingDef | undefined, action: Action): void {
  if (def === undefined) ctx.refuse('not-walked');
  const { weapon } = action as Action & { weapon?: unknown };
  if (ctx.read().fallen.includes(def.player)) ctx.refuse('fallen', { by: def.player });
  const held = wielded(ctx.content, ctx.fact, def.player);
  if (typeof weapon !== 'string' || held.item !== weapon || held.weapon.kind !== 'ranged')
    ctx.refuse('not-wielded', { by: def.player, weapon });
  const { ammo } = held.weapon;
  if (ammo !== undefined) {
    if ((ctx.fact('inventory.count', { item: ammo }) as number) < 1) ctx.refuse('no-ammo', { ammo });
    ctx.apply({ effect: 'take-item', item: ammo, count: 1 });
  }
  ctx.emit('loosed', { weapon });
}
