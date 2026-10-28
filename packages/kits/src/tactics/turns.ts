/**
 * A battle set out, and its actions and turns (M7.5, D87, docs/specs/tactics.md#actions; from space-wrecked's
 * src/sim/battle.js createBattle, act, doAction, endTurn and startTurn). Every action works on a copy and
 * tells what happened; a refused one changes nothing. A side's turn also ends by itself once none of its
 * units has an ap left.
 */
import { edgeKey, SIDES, type Side } from '@eb/core';
import { type Arena, active, beside, fieldOf, type Rolls, sees, shutDoor, unitOf } from './field.ts';
import { decide, fire } from './fire.ts';
import { doOrder, endOrders, endWelds, wakeTurn } from './orders.ts';
import type { Battle, Move, Team, Told, Unit } from './types.ts';
import { move } from './walk.ts';

/** A unit as a battle sets it out: its actor's numbers, read as the battle starts. */
export interface Setting {
  readonly side: Team;
  readonly actor: string;
  readonly at: readonly [number, number];
  readonly hp: number;
  readonly most: number;
  readonly aim: number;
  readonly defense: number;
  readonly armor: number;
  readonly mobility: number;
  readonly gun: string | null;
  readonly order: string | null;
}

/** A battle set out, its first side's turn begun. */
export function createBattle(
  arena: Arena,
  setup: { battle: string; first: Team; units: readonly Setting[] },
): { battle: Battle; told: Told[] } {
  const counts = { crew: 0, foes: 0 };
  const units = setup.units.map((set): Unit => {
    counts[set.side] += 1;
    return {
      id: `${set.side === 'crew' ? 'c' : 'e'}${counts[set.side]}`,
      side: set.side,
      actor: set.actor,
      at: [set.at[0], set.at[1]],
      hp: Math.min(set.hp, set.most),
      most: Math.max(1, set.most),
      aim: set.aim,
      defense: set.defense,
      armor: set.armor,
      mobility: Math.max(1, set.mobility),
      gun: set.gun,
      ammo: set.gun === null ? 0 : arena.gun(set.gun).clip,
      order: set.order,
      uses: set.order === null ? 0 : arena.order(set.order).uses,
      ap: 0,
      watch: false,
      status: 'active',
      bleed: 0,
      mark: null,
      suppressed: null,
      asleep: false,
      kitted: false,
    };
  });
  const battle: Battle = {
    battle: setup.battle,
    side: setup.first,
    first: setup.first,
    round: 1,
    misses: { crew: 0, foes: 0 },
    doors: [],
    welds: [],
    units,
    winner: null,
  };
  const told: Told[] = [];
  startTurn(arena, battle, told);
  return { battle, told };
}

/** A deep copy to change: a battle is plain data. */
export const draft = (battle: Battle): Battle => JSON.parse(JSON.stringify(battle)) as Battle;

/** Applies one action to a copy. Returns the copy and what it told, or why it was refused. */
export function act(
  arena: Arena,
  battle: Battle,
  action: Move,
  rolls: Rolls,
): { ok: true; battle: Battle; told: Told[] } | { ok: false; error: string } {
  if (battle.winner) return { ok: false, error: 'The battle is over.' };
  const next = draft(battle);
  const told: Told[] = [];
  let error: string | null = null;
  if (action.type === 'end') endTurn(arena, next, told);
  else {
    const unit = unitOf(next, action.unit);
    error = readyToAct(next, unit, action.unit) ?? doAction(arena, next, unit as Unit, action, told, rolls);
    if (!error && !next.winner && !next.units.some((u) => u.side === next.side && active(u) && u.ap > 0))
      endTurn(arena, next, told);
  }
  return error ? { ok: false, error } : { ok: true, battle: next, told };
}

function readyToAct(battle: Battle, unit: Unit | undefined, id: unknown): string | null {
  if (!unit) return `There is no unit "${String(id)}".`;
  if (unit.side !== battle.side) return `It isn't the ${unit.side}' turn.`;
  if (!active(unit)) return `${unit.id} is ${unit.status}.`;
  if (unit.ap < 1) return `${unit.id} has no ap left this turn.`;
  return null;
}

function doAction(
  arena: Arena,
  battle: Battle,
  unit: Unit,
  action: Exclude<Move, { type: 'end' }>,
  told: Told[],
  rolls: Rolls,
) {
  switch (action.type) {
    case 'move':
      return move(arena, battle, unit, action.to, told, rolls);
    case 'shoot': {
      const target = unitOf(battle, action.target);
      if (!target || target.side === unit.side) return `${unit.id} can't shoot that.`;
      if (!active(target)) return `${target.id} is already down.`;
      if (unit.gun === null) return `${unit.id} has no gun.`;
      if (unit.ammo < 1) return `${unit.id} has to reload first.`;
      if (!sees(arena, fieldOf(arena, battle), unit.at, target.at)) return `${unit.id} can't see ${target.id}.`;
      unit.ap = 0;
      fire(arena, battle, unit, target, false, told, rolls);
      return null;
    }
    case 'watch':
      if (unit.gun === null) return `${unit.id} has no gun.`;
      if (unit.ammo < 1) return `${unit.id} has to reload first.`;
      unit.ap = 0;
      unit.watch = true;
      told.push({ type: 'watched', unit: unit.id });
      return null;
    case 'reload': {
      if (unit.gun === null) return `${unit.id} has no gun.`;
      const { clip } = arena.gun(unit.gun);
      if (unit.ammo >= clip) return `${unit.id}'s gun is full.`;
      unit.ap -= 1;
      unit.ammo = clip;
      told.push({ type: 'reloaded', unit: unit.id, ammo: clip });
      return null;
    }
    case 'steady': {
      const target = unitOf(battle, action.target);
      if (!target || target.side !== unit.side || target.status !== 'down')
        return `${unit.id} can only steady an ally who is down.`;
      if (!beside(unit.at, target.at)) return `${unit.id} has to be next to ${target.id}.`;
      unit.ap -= 1;
      target.status = 'stable';
      target.bleed = 0;
      told.push({ type: 'steadied', unit: unit.id, target: target.id });
      return null;
    }
    case 'open': {
      const side = action.side as Side;
      if (!SIDES.includes(side) || arena.grid.edge(unit.at[0], unit.at[1], side) !== 'door')
        return `There's no door on that side of ${unit.id}.`;
      if (!shutDoor(arena, battle, unit.at, side)) return 'That door is open already, or welded shut.';
      unit.ap -= 1;
      openDoor(battle, unit, side, told);
      return null;
    }
    case 'order':
      return doOrder(arena, battle, unit, action, told, rolls);
  }
}

function openDoor(battle: Battle, unit: Unit, side: Side, told: Told[]): void {
  battle.doors = [...battle.doors, edgeKey(unit.at, side)].sort();
  told.push({ type: 'opened', unit: unit.id, at: unit.at, side });
}

/** A side's turn ends, and with it what the other side's orders left on it. */
export function endTurn(arena: Arena, battle: Battle, told: Told[]): void {
  told.push({ type: 'ended', side: battle.side });
  for (const unit of battle.units) if (unit.side === battle.side) unit.ap = 0;
  endOrders(battle, battle.side, told);
  battle.side = battle.side === 'crew' ? 'foes' : 'crew';
  if (battle.side === battle.first) {
    battle.round += 1;
    endWelds(battle, told);
  }
  startTurn(arena, battle, told);
}

/**
 * A side's turn begins: its units' overwatch ends and their ap come back, but for those asleep; then, one
 * by one, the down bleed: at 0 they are out, or dead with permadeath.
 */
function startTurn(arena: Arena, battle: Battle, told: Told[]): void {
  told.push({ type: 'turn', side: battle.side, round: battle.round });
  for (const unit of battle.units) {
    if (unit.side !== battle.side || battle.winner) continue;
    if (active(unit)) {
      unit.watch = false;
      unit.ap = arena.numbers['action-points'];
      wakeTurn(unit, told);
    } else if (unit.status === 'down') {
      unit.bleed -= 1;
      if (unit.bleed > 0) told.push({ type: 'bled', unit: unit.id, bleed: unit.bleed });
      else {
        unit.status = arena.permadeath ? 'dead' : 'out';
        told.push({ type: 'out', unit: unit.id, dead: arena.permadeath });
      }
    }
  }
  decide(battle, told);
}
