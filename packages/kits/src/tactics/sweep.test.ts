/**
 * 200 boarding fights on Space-Wrecked's example ship (M7.5, D87, docs/specs/tactics.md#the-gate): the crew
 * by the kit's AI, the boarders pressing on, each fight held to the rules' invariants after every action,
 * every action the AI takes and one offered option a step accepted. The crew's wins are a reading.
 */
import { edgeKey, gridOf, sideToward, type Tile, tileKey, walkable } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { arenaOn, mulberry, set, shipTiles } from '../../test/tactics.ts';
import { aiAction, bestPlan, OPEN_SHOT, plansFor } from './ai.ts';
import { type Arena, coverAt, fieldOf, sees } from './field.ts';
import { optionsOf } from './options.ts';
import { orderAction } from './orderAi.ts';
import { pressAction } from './press.ts';
import { act, createBattle } from './turns.ts';
import type { Battle } from './types.ts';

const SEEDS = 200;
const ROUNDS = 30;

/** What must hold after every action, as a list of what doesn't. */
function broken(arena: Arena, battle: Battle): string[] {
  const out: string[] = [];
  const held = new Set<string>();
  for (const u of battle.units) {
    if (u.status !== 'dead') {
      if (held.has(tileKey(u.at))) out.push(`two units on ${u.at}`);
      held.add(tileKey(u.at));
    }
    if (!walkable(arena.grid, u.at)) out.push(`${u.id} off the floor at ${u.at}`);
    if (u.hp < 0 || u.hp > u.most) out.push(`${u.id} at ${u.hp} of ${u.most}`);
    if ((u.status === 'active') !== u.hp > 0) out.push(`${u.id} ${u.status} at ${u.hp}`);
    if (u.ap < 0 || (u.side !== battle.side && u.ap > 0)) out.push(`${u.id} with ${u.ap} ap out of turn`);
    if (u.gun !== null && (u.ammo < 0 || u.ammo > arena.gun(u.gun).clip)) out.push(`${u.id} with ${u.ammo} rounds`);
    if (u.uses < 0) out.push(`${u.id} with ${u.uses} uses`);
    if (u.watch && u.status !== 'active') out.push(`${u.id} watching while ${u.status}`);
  }
  const standing = (side: string) => battle.units.some((u) => u.side === side && u.status === 'active');
  if ((battle.winner !== null) !== (!standing('crew') || !standing('foes'))) out.push(`winner ${battle.winner}`);
  if ([...battle.doors].sort().join() !== battle.doors.join() || new Set(battle.doors).size !== battle.doors.length)
    out.push(`doors ${battle.doors}`);
  for (const key of [...battle.doors, ...battle.welds.map((w) => w.key)]) {
    const [c, r, side] = key.split(',');
    if (arena.grid.edge(Number(c), Number(r), side as 'n' | 'w') !== 'door') out.push(`${key} is no door`);
  }
  if (battle.misses.crew < 0 || battle.misses.foes < 0) out.push('misses below 0');
  return out;
}

/** Every plan the AI makes, and how many ended in the open, each with its reason checked. */
const planned = { decisions: 0, open: 0 };

/**
 * Never in the open without a reason (space-wrecked's tests/ai.test.js): when the plan the AI makes now
 * leaves its unit where a foe sees it with no cover between, worked out here from the rules and not taken
 * from the plan, either no plan was covered, or it is a shot worth the risk and better than any covered one.
 */
function openWithReason(arena: Arena, battle: Battle): void {
  const unit = battle.units.find((u) => u.side === battle.side && u.status === 'active' && u.ap > 0);
  if (!unit || unit.ammo < 1 || orderAction(arena, battle, unit)) return;
  const grid = fieldOf(arena, battle);
  const foes = battle.units.filter((u) => u.side !== unit.side && u.status === 'active');
  // Pressing on, a foe that sees no one walks on without a plan.
  if (battle.side === 'foes' && !foes.some((f) => sees(arena, grid, unit.at, f.at))) return;
  const plans = plansFor(arena, battle, unit);
  const plan = bestPlan(plans);
  planned.decisions += 1;
  const doors = new Set(battle.doors);
  if (plan.open) doors.add(edgeKey(unit.at, plan.open));
  for (let i = 1; i < plan.path.length; i++) {
    const [from, to] = [plan.path[i - 1] as Tile, plan.path[i] as Tile];
    const side = sideToward(from, to);
    if (arena.grid.edge(from[0], from[1], side) === 'door') doors.add(edgeKey(from, side));
  }
  const field = fieldOf(arena, { doors: [...doors], welds: battle.welds });
  const exposed = foes.some((f) => sees(arena, field, f.at, plan.to) && coverAt(field, plan.to, f.at).flanked);
  if (!exposed) return;
  planned.open += 1;
  const covered = plans.filter((p) => p.exposed.length === 0);
  const bestCovered = Math.max(
    Number.NEGATIVE_INFINITY,
    ...covered.filter((p) => p.after?.type === 'shoot').map((p) => p.attack),
  );
  const reason =
    covered.length === 0 || (plan.after?.type === 'shoot' && plan.attack > bestCovered && plan.attack >= OPEN_SHOT);
  if (!reason) throw new Error(`${unit.id} at ${unit.at} to ${plan.to} in the open, ${JSON.stringify(plan.after)}`);
}

function fight(seed: number): { battle: Battle; actions: number; offered: number } {
  const arena = arenaOn(shipTiles(), { press: true });
  const rolls = mulberry(seed);
  // The golden battle's squad on the bridge and boarders at the hatch, Space-Wrecked's (x, y − 1).
  const units = [
    set('marine', [9, 1]),
    set('engineer', [9, 2]),
    set('medic', [10, 2]),
    set('pirate', [5, 3]),
    set('pirate', [6, 3]),
    set('brute', [4, 3]),
  ];
  let { battle } = createBattle(arena, { battle: 'boarding', first: 'crew', units });
  const pick = mulberry(seed + 1000);
  let [actions, offered] = [0, 0];
  while (!battle.winner && battle.round <= ROUNDS) {
    const options = optionsOf(arena, battle);
    const option = options[pick.int(0, options.length - 1)];
    const tried = option && act(arena, battle, option, mulberry(seed));
    if (!tried?.ok)
      throw new Error(
        `seed ${seed}: the offered ${JSON.stringify(option)} was refused: ${tried && !tried.ok ? tried.error : ''}`,
      );
    offered += 1;
    openWithReason(arena, battle);
    const action = battle.side === 'crew' ? aiAction(arena, battle) : pressAction(arena, battle);
    const result = act(arena, battle, action, rolls);
    if (!result.ok) throw new Error(`seed ${seed}: the AI's ${JSON.stringify(action)} was refused: ${result.error}`);
    battle = result.battle;
    actions += 1;
    const wrong = broken(arena, battle);
    if (wrong.length > 0) throw new Error(`seed ${seed} after ${JSON.stringify(action)}: ${wrong.join('; ')}`);
  }
  return { battle, actions, offered };
}

describe('200 boarding fights', () => {
  const fights = Array.from({ length: SEEDS }, (_, i) => fight(i + 1));

  it('end within 30 rounds, every action accepted and the rules holding after each', () => {
    expect(fights.every((f) => f.battle.winner !== null)).toBe(true);
    expect(fights.every((f) => f.offered > 0)).toBe(true);
  });

  it('never leave a unit in the open without a reason', () => {
    expect(planned.decisions).toBeGreaterThan(500);
  });

  it('are won by both sides, the crew most often', () => {
    const won = fights.filter((f) => f.battle.winner === 'crew').length;
    // A reading (2026-10-28, N=200): see ROADMAP's Readings.
    console.log(`tactics sweep: the crew won ${won} of ${SEEDS}; ${fights.reduce((s, f) => s + f.actions, 0)} actions`);
    expect(won).toBeGreaterThan(0);
    expect(won).toBeLessThan(SEEDS);
  });

  it('uses a grid that knows the ship', () => {
    expect(gridOf(shipTiles()).cols).toBe(11);
  });
});
