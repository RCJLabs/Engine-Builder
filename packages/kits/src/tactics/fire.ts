/**
 * A shot rolled, and what it does (M7.5, D87, docs/specs/tactics.md#the-rules-in-the-engine; from
 * space-wrecked's src/sim/battle.js fire, hurt, decide and win). Three draws a hit and one a miss, in
 * Space-Wrecked's order: the hit, then the crit, then the damage.
 */
import { type Arena, fieldOf, type Rolls } from './field.ts';
import { shotOdds } from './odds.ts';
import type { Battle, Team, Told, Unit } from './types.ts';

/** A roll of 0 to 99 that passes below the chance, so 0 never does and 100 always does. */
export function percent(rolls: Rolls, chance: number): { pass: boolean; roll: number } {
  const roll = rolls.int(0, 99);
  return { pass: roll < chance, roll };
}

/** One shot, from a unit with a gun and a round, overwatch's or not. */
export function fire(
  arena: Arena,
  battle: Battle,
  shooter: Unit,
  target: Unit,
  watch: boolean,
  told: Told[],
  rolls: Rolls,
): void {
  const odds = shotOdds(arena, battle, fieldOf(arena, battle), shooter, target, watch);
  const gun = arena.gun(shooter.gun as string);
  shooter.ammo -= 1;
  const hit = percent(rolls, odds.hit);
  const shot = {
    type: 'shot',
    unit: shooter.id,
    target: target.id,
    watch,
    chance: odds.hit,
    roll: hit.roll,
    hit: hit.pass,
    band: odds.band,
    cover: odds.cover,
  };
  if (!hit.pass) {
    battle.misses[shooter.side] += 1;
    told.push(shot);
    return;
  }
  battle.misses[shooter.side] = 0;
  const crit = percent(rolls, odds.crit);
  const roll = rolls.int(gun.damage.least, gun.damage.most);
  const damage = Math.max(1, roll + (crit.pass ? gun['crit-damage'] : 0) - target.armor);
  told.push({ ...shot, critChance: odds.crit, critRoll: crit.roll, crit: crit.pass, damage });
  hurt(arena, battle, target, damage, told);
}

/** Damage taken. At 0 the crew go down and bleed; the foes die. */
export function hurt(arena: Arena, battle: Battle, unit: Unit, damage: number, told: Told[]): void {
  unit.hp = Math.max(0, unit.hp - damage);
  if (unit.hp > 0) return;
  unit.ap = 0;
  unit.watch = false;
  if (unit.side === 'crew') {
    unit.status = 'down';
    unit.bleed = arena.numbers.bleed;
    told.push({ type: 'down', unit: unit.id, bleed: unit.bleed });
  } else {
    unit.status = 'dead';
    told.push({ type: 'dead', unit: unit.id });
  }
  decide(battle, told);
}

/** Over once one side has no one standing: the crew win when the foes have none. No draws. */
export function decide(battle: Battle, told: Told[]): void {
  if (battle.winner) return;
  const standing = (side: Team) => battle.units.some((u) => u.side === side && u.status === 'active');
  if (!standing('foes')) win(battle, 'crew', told);
  else if (!standing('crew')) win(battle, 'foes', told);
}

function win(battle: Battle, winner: Team, told: Told[]): void {
  battle.winner = winner;
  told.push({ type: 'over', winner });
}
