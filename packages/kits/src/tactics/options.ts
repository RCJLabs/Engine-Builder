/**
 * Every action the rules allow the side to play now (M7.5, D87, docs/specs/tactics.md#actions), for bots and
 * menus: a move to each tile its ap reach, a shot at each foe it sees, a watch, a reload, a steady, a door
 * opened, its order at each target, in the units' order; and the end of the turn. Each is one `act` accepts.
 */
import { SIDES } from '@eb/core';
import { type Arena, active, beside, budgetOf, fieldOf, foesOf, reachOf, sees, shutDoor } from './field.ts';
import { orderOf, orderTargets } from './orders.ts';
import type { Battle, Move, Unit } from './types.ts';

const cache = new WeakMap<Battle, readonly Move[]>();

export function optionsOf(arena: Arena, battle: Battle): readonly Move[] {
  const made = cache.get(battle);
  if (made) return made;
  const out: Move[] = [];
  if (!battle.winner) {
    for (const unit of battle.units) {
      if (unit.side === battle.side && active(unit) && unit.ap > 0) out.push(...unitOptions(arena, battle, unit));
    }
    out.push({ type: 'end' });
  }
  cache.set(battle, out);
  return out;
}

function unitOptions(arena: Arena, battle: Battle, unit: Unit): Move[] {
  const out: Move[] = [];
  for (const spot of reachOf(arena, battle, unit, budgetOf(unit)).values()) {
    if (spot.cost > 0) out.push({ type: 'move', unit: unit.id, to: spot.tile });
  }
  if (unit.gun !== null && unit.ammo > 0) {
    const grid = fieldOf(arena, battle);
    for (const foe of foesOf(battle, unit)) {
      if (sees(arena, grid, unit.at, foe.at)) out.push({ type: 'shoot', unit: unit.id, target: foe.id });
    }
    out.push({ type: 'watch', unit: unit.id });
  }
  if (unit.gun !== null && unit.ammo < arena.gun(unit.gun).clip) out.push({ type: 'reload', unit: unit.id });
  for (const ally of battle.units) {
    if (ally.side === unit.side && ally.status === 'down' && beside(unit.at, ally.at))
      out.push({ type: 'steady', unit: unit.id, target: ally.id });
  }
  for (const side of SIDES) if (shutDoor(arena, battle, unit.at, side)) out.push({ type: 'open', unit: unit.id, side });
  const order = orderOf(arena, unit);
  for (const target of orderTargets(arena, battle, unit)) {
    if (order?.kind === 'weld') out.push({ type: 'order', unit: unit.id, side: target });
    else if (order?.kind === 'hustle') out.push({ type: 'order', unit: unit.id });
    else out.push({ type: 'order', unit: unit.id, target });
  }
  return out;
}
