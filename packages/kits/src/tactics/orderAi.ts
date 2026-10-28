/**
 * The order a crew member gives now, by a plain rule for each kind, or null (M7.5, D87; from space-wrecked's
 * src/sim/orderAi.js). The AI asks first, so a bot playing the crew gives orders as a careful player might;
 * the foes have none. "At the start of its turn" is with all its ap still to take.
 *   suppress  a foe in sight with a GOOD shot at the crew, when its own best shot is under GOOD
 *   weld      fresh, with no foe in sight and one within WELD_STEPS, while it or an ally beside is at half
 *             its hp or less: the door the nearest foe would come through
 *   patch     an ally beside who is down; else the most hurt by a patch's worth, when no shot is GOOD
 *   hustle    fresh, with a foe in sight but no GOOD shot from where it stands
 *   mark      fresh: of the foes in sight not marked yet, the one with the fewest hp
 *   sedate    of the foes in sight still awake, the one with the most hp, at a dart's odds of GOOD or better
 *   kit       fresh: an ally beside not kitted out yet, else itself
 */
import { type Side, step, type Tile, tileKey } from '@eb/core';
import { type Arena, active, beside, fieldOf, foesOf, sees, stepsAway, unitOf } from './field.ts';
import { dartOdds, shotOdds } from './odds.ts';
import { orderOf, orderTargets } from './orders.ts';
import type { Battle, Move, Unit } from './types.ts';

/** A chance to hit, in percent, worth a shot or a dart. */
export const GOOD = 40;
/** How near, in steps, a foe comes before a door is worth welding. */
export const WELD_STEPS = 6;

export function orderAction(arena: Arena, battle: Battle, unit: Unit): Move | null {
  const order = orderOf(arena, unit);
  if (!order || unit.uses < 1) return null;
  const reach = orderTargets(arena, battle, unit);
  if (reach.length === 0) return null;
  const fresh = unit.ap >= arena.numbers['action-points'];
  const targets = reach.map((id) => unitOf(battle, id)).filter((u): u is Unit => u !== undefined);
  const give = (target: Unit): Move => ({ type: 'order', unit: unit.id, target: target.id });
  const grid = fieldOf(arena, battle);
  switch (order.kind) {
    case 'suppress': {
      if (bestShot(arena, battle, unit) >= GOOD) return null;
      const crew = battle.units.filter((u) => u.side === unit.side && active(u));
      const threat = (foe: Unit) =>
        Math.max(
          0,
          ...crew.filter((c) => sees(arena, grid, foe.at, c.at)).map((c) => shotOdds(arena, battle, grid, foe, c).hit),
        );
      const worst = most(
        targets.filter((foe) => foe.suppressed === null),
        threat,
      );
      return worst && threat(worst) >= GOOD ? give(worst) : null;
    }
    case 'weld': {
      const hurt = battle.units.some(
        (u) => u.side === unit.side && active(u) && beside(u.at, unit.at) && u.hp * 2 <= u.most,
      );
      return fresh && hurt ? weldAction(arena, battle, unit, reach as Side[]) : null;
    }
    case 'patch': {
      const down = targets.find((ally) => !active(ally));
      if (down) return give(down);
      if (bestShot(arena, battle, unit) >= GOOD) return null;
      const hurt = most(
        targets.filter((ally) => ally.most - ally.hp >= (order.hp ?? 0)),
        (ally) => ally.most - ally.hp,
      );
      return hurt ? give(hurt) : null;
    }
    case 'hustle':
      return fresh && inSight(arena, battle, unit).length > 0 && bestShot(arena, battle, unit) < GOOD
        ? { type: 'order', unit: unit.id }
        : null;
    case 'mark': {
      if (!fresh) return null;
      const weakest = most(
        targets.filter((foe) => foe.mark === null),
        (foe) => -foe.hp,
      );
      return weakest ? give(weakest) : null;
    }
    case 'sedate': {
      const awake = targets.filter((foe) => !foe.asleep && dartOdds(arena, battle, grid, unit, foe).hit >= GOOD);
      const biggest = most(awake, (foe) => foe.hp);
      return biggest ? give(biggest) : null;
    }
    case 'kit': {
      if (!fresh) return null;
      const ally = targets.find((u) => u.id !== unit.id);
      return give(ally ?? unit);
    }
  }
}

/**
 * The door to weld: of the sides of its tile with one, the side whose far tile the nearest foe reaches
 * soonest, sooner than its own tile, with a foe within WELD_STEPS and none in sight. Null otherwise.
 */
function weldAction(arena: Arena, battle: Battle, unit: Unit, sides: readonly Side[]): Move | null {
  if (inSight(arena, battle, unit).length > 0) return null;
  const away = stepsAway(
    arena,
    battle,
    foesOf(battle, unit).map((f) => f.at),
  );
  const far = (tile: Tile) => away.get(tileKey(tile)) ?? Number.POSITIVE_INFINITY;
  const here = far(unit.at);
  if (here > WELD_STEPS) return null;
  const side = most(
    sides.filter((s) => far(step(unit.at, s)) < here),
    (s) => -far(step(unit.at, s)),
  );
  return side ? { type: 'order', unit: unit.id, side } : null;
}

/** The foes standing in its sight. */
const inSight = (arena: Arena, battle: Battle, unit: Unit): Unit[] => {
  const grid = fieldOf(arena, battle);
  return foesOf(battle, unit).filter((u) => sees(arena, grid, unit.at, u.at));
};

/** Its best chance to hit a foe in sight from where it stands: 0 with none, or no gun. */
function bestShot(arena: Arena, battle: Battle, unit: Unit): number {
  if (unit.gun === null) return 0;
  const grid = fieldOf(arena, battle);
  return Math.max(0, ...inSight(arena, battle, unit).map((foe) => shotOdds(arena, battle, grid, unit, foe).hit));
}

/** The item with the highest score, the first on a tie, or null. */
function most<T>(list: readonly T[], score: (item: T) => number): T | null {
  let best: T | null = null;
  let top = Number.NEGATIVE_INFINITY;
  for (const item of list) {
    const value = score(item);
    if (value > top) [best, top] = [item, value];
  }
  return best;
}
