/**
 * A crew member's order in a fight (M7.5, D87, docs/specs/tactics.md#records; from space-wrecked's
 * src/sim/orders.js). Each is usable its record's `uses` times a fight and needs an ap:
 *   suppress  an enemy in sight: its shots take `aim` until its side's next turn ends; all ap, a round
 *   weld      the door on a side of its tile shut and welded for `rounds` rounds, this one counted
 *   patch     an ally beside, hurt or down: `hp` back; one down gets up with `hp`
 *   hustle    itself: `ap` more this turn, at no cost
 *   mark      an enemy in sight: the other side's shots at it take `aim` until the crew's next turn ends
 *   sedate    an enemy in sight: a dart at a shot's odds and `aim` more; a hit puts it to sleep; all ap, a round
 *   kit       itself or an ally beside, once each: a full clip and `armor` more for the fight
 */
import { edgeKey, SIDES, type Side } from '@eb/core';
import { type Arena, active, beside, fieldOf, foesOf, type Rolls, sees, unitOf, welded } from './field.ts';
import { percent } from './fire.ts';
import { dartOdds } from './odds.ts';
import type { Battle, OrderKind, OrderRecord, Told, Unit } from './types.ts';

/** The crew's turn ends a mark lasts, the one it was made in counted. */
const MARK_TURNS = 2;

/** Whom each kind reaches: a foe in sight, an ally beside, itself, itself or an ally beside, or a door. */
const REACHES: Readonly<Record<OrderKind, 'enemy' | 'ally' | 'self' | 'kit' | 'door'>> = {
  suppress: 'enemy',
  weld: 'door',
  patch: 'ally',
  hustle: 'self',
  mark: 'enemy',
  sedate: 'enemy',
  kit: 'kit',
};

export const orderOf = (arena: Arena, unit: Unit): OrderRecord | null =>
  unit.order === null ? null : arena.order(unit.order);

const patchable = (unit: Unit) =>
  unit.status === 'down' || unit.status === 'stable' || (unit.status === 'active' && unit.hp < unit.most);

/** What the unit's order could reach now: units' ids, or for a weld its tile's sides. [] when it has none. */
export function orderTargets(arena: Arena, battle: Battle, unit: Unit): string[] {
  const order = orderOf(arena, unit);
  if (!order || unit.uses < 1) return [];
  const others = battle.units.filter((u) => u.id !== unit.id);
  switch (REACHES[order.kind]) {
    case 'enemy': {
      if ((order.kind === 'suppress' || order.kind === 'sedate') && (unit.gun === null || unit.ammo < 1)) return [];
      const grid = fieldOf(arena, battle);
      return foesOf(battle, unit)
        .filter((u) => sees(arena, grid, unit.at, u.at))
        .map((u) => u.id);
    }
    case 'ally':
      return others.filter((u) => u.side === unit.side && beside(unit.at, u.at) && patchable(u)).map((u) => u.id);
    case 'kit':
      return [unit, ...others.filter((u) => u.side === unit.side && beside(unit.at, u.at))]
        .filter((u) => active(u) && !u.kitted && u.gun !== null)
        .map((u) => u.id);
    case 'self':
      return [unit.id];
    case 'door':
      return SIDES.filter(
        (side) => arena.grid.edge(unit.at[0], unit.at[1], side) === 'door' && !welded(battle, unit.at, side),
      );
  }
}

/** Gives the unit's order. Returns why not, or null. */
export function doOrder(
  arena: Arena,
  battle: Battle,
  unit: Unit,
  aim: { target?: unknown; side?: unknown },
  told: Told[],
  rolls: Rolls,
): string | null {
  const order = orderOf(arena, unit);
  if (!order) return `${unit.id} has no order of their own.`;
  if (unit.uses < 1) return `${unit.id} has no ${order.kind} left this fight.`;
  if (order.kind === 'weld') return weld(arena, battle, unit, order, aim.side, told);
  const target = order.kind === 'hustle' ? unit : unitOf(battle, aim.target);
  if (!target || !orderTargets(arena, battle, unit).includes(target.id))
    return `${unit.id}'s ${order.kind} can't reach that.`;
  unit.uses -= 1;
  const said = { type: 'ordered', kind: order.kind, unit: unit.id, target: target.id };
  const number = (key: 'aim' | 'hp' | 'ap' | 'armor') => order[key] ?? 0;
  switch (order.kind) {
    case 'suppress':
      unit.ap = 0;
      unit.ammo -= 1;
      target.suppressed = number('aim');
      told.push({ ...said, aim: number('aim') });
      return null;
    case 'patch': {
      const up = target.status !== 'active';
      const hp = up ? Math.min(target.most, number('hp')) : Math.min(target.most, target.hp + number('hp'));
      told.push({ ...said, hp, healed: up ? hp : hp - target.hp, up });
      if (up) {
        target.status = 'active';
        target.bleed = 0;
        target.ap = 0;
      }
      target.hp = hp;
      unit.ap -= 1;
      return null;
    }
    case 'hustle':
      unit.ap += number('ap');
      told.push({ ...said, ap: number('ap') });
      return null;
    case 'mark':
      unit.ap -= 1;
      target.mark = { aim: number('aim'), turns: MARK_TURNS };
      told.push({ ...said, aim: number('aim') });
      return null;
    case 'sedate': {
      const odds = dartOdds(arena, battle, fieldOf(arena, battle), unit, target);
      unit.ap = 0;
      unit.ammo -= 1;
      const hit = percent(rolls, odds.hit);
      battle.misses[unit.side] = hit.pass ? 0 : battle.misses[unit.side] + 1;
      if (hit.pass) {
        target.asleep = true;
        target.watch = false;
      }
      told.push({ ...said, chance: odds.hit, roll: hit.roll, hit: hit.pass });
      return null;
    }
    case 'kit': {
      const clip = arena.gun(target.gun as string).clip;
      unit.ap -= 1;
      target.armor += number('armor');
      target.ammo = clip;
      target.kitted = true;
      told.push({ ...said, armor: number('armor'), ammo: clip });
      return null;
    }
  }
}

function weld(
  arena: Arena,
  battle: Battle,
  unit: Unit,
  order: OrderRecord,
  side: unknown,
  told: Told[],
): string | null {
  if (!SIDES.includes(side as Side) || arena.grid.edge(unit.at[0], unit.at[1], side as Side) !== 'door')
    return `There's no door on that side of ${unit.id}.`;
  if (welded(battle, unit.at, side as Side)) return 'That door is welded shut already.';
  const key = edgeKey(unit.at, side as Side);
  unit.uses -= 1;
  unit.ap -= 1;
  battle.doors = battle.doors.filter((door) => door !== key);
  const until = battle.round + (order.rounds ?? 1) - 1;
  battle.welds = [...battle.welds, { key, until }];
  told.push({ type: 'ordered', kind: 'weld', unit: unit.id, at: unit.at, side, until });
  return null;
}

/** A unit's side's turn begins: one asleep gets no ap. */
export function wakeTurn(unit: Unit, told: Told[]): void {
  if (!unit.asleep) return;
  unit.ap = 0;
  told.push({ type: 'asleep', unit: unit.id });
}

/** A side's turn ends: its units shake off suppression and wake, and at the crew's, marks wear a turn. */
export function endOrders(battle: Battle, side: Unit['side'], told: Told[]): void {
  for (const unit of battle.units) {
    if (unit.side === side) {
      unit.suppressed = null;
      if (unit.asleep) {
        unit.asleep = false;
        told.push({ type: 'woke', unit: unit.id });
      }
    }
    if (side === 'crew' && unit.mark)
      unit.mark = unit.mark.turns > 1 ? { ...unit.mark, turns: unit.mark.turns - 1 } : null;
  }
}

/** A new round begins: the welds past their last round give way, shut, in the order made. */
export function endWelds(battle: Battle, told: Told[]): void {
  const given = battle.welds.filter((weld) => weld.until < battle.round);
  if (given.length === 0) return;
  battle.welds = battle.welds.filter((weld) => weld.until >= battle.round);
  for (const { key } of given) told.push({ type: 'unwelded', key });
}
