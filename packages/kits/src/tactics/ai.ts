/**
 * The foes' AI, and the crew's in a bot's hands (M7.5, D87, docs/specs/tactics.md#the-rules-in-the-engine;
 * from space-wrecked's src/sim/ai.js): the next action for the side to play, a unit at a time, as a player
 * would, with no randomness. For the first unit with an ap left, every plan it could make this turn: stay,
 * move or dash, then shoot at a foe it sees, watch, or nothing; or breach a shut door beside it and shoot or
 * watch through. Each is scored, Space-Wrecked's way, in whole numbers: harm in millionths of a hit point,
 * and the score in tenths of those, so 0.8 and 0.2 are 8 and 2.
 *   score = 10 × attack − 8 × (threat + risk) − (a shot ? 0 : 2,000,000 × steps)
 * A shot worth taking beats any plan without one unless it is reckless, and no plan ends in the open, seen
 * with no cover, without a shot worth the risk. Ties go to the plan found first; near ties may part from
 * Space-Wrecked's doubles.
 */
import { edgeKey, SIDES, type Side, type Spot, sideToward, type Tile, type TileGrid, tileKey } from '@eb/core';
import {
  type Arena,
  active,
  apFor,
  budgetOf,
  coverAt,
  type Doors,
  fieldOf,
  foesOf,
  reachOf,
  same,
  sees,
  shutDoor,
  stepsAway,
} from './field.ts';
import { shotOdds } from './odds.ts';
import { orderAction } from './orderAi.ts';
import type { Battle, Move, Unit } from './types.ts';

/** A kill, on top of its damage, in hit points: one less gun. */
const KILL = 4;
/** Watching with a foe that could step into sight, and with none that close, in millionths. */
const WATCH = 1_000_000;
const IDLE = 300_000;
/** A foe this many steps off could come into sight; one it can't walk to is this far. */
const WATCH_STEPS = 8;
const FAR = 99;
/** Harm that makes a shot worth taking, and worth standing in the open for, in millionths. */
export const MIN_SHOT = 400_000;
export const OPEN_SHOT = 1_000_000;
/** How much worse than holding back a shot may score and still go first: 3 hit points, in score's units. */
export const RECKLESS = 30_000_000;
const STEP = 2_000_000;

export type Then =
  | { readonly type: 'shoot'; readonly target: string; readonly flanked: boolean }
  | { readonly type: 'watch' };

export interface Plan {
  readonly to: Tile;
  /** The ap it takes to get set: 0 to stay, 1 to move or open a door, 2 to dash. */
  readonly ap: number;
  /** The side of the door it opens first, or null. */
  readonly open: Side | null;
  readonly path: readonly Tile[];
  readonly after: Then | null;
  /** Expected harm, in millionths: its shot, and the shots and overwatch it would take. */
  readonly attack: number;
  readonly threat: number;
  readonly risk: number;
  readonly steps: number;
  /** The foes who would see it there with no cover between. */
  readonly exposed: readonly string[];
  readonly score: number;
}

type Body = Pick<Unit, 'side' | 'at' | 'aim' | 'gun' | 'suppressed' | 'defense' | 'mark' | 'armor' | 'hp'>;

/** The harm `shooter` can be expected to do with one shot at `target`, kept to its hp, a kill counted extra. */
export function harm(arena: Arena, battle: Battle, grid: TileGrid, shooter: Body, target: Body, watch = false): number {
  if (shooter.gun === null) return 0;
  const odds = shotOdds(arena, battle, grid, shooter, target, watch);
  if (!odds.hit) return 0;
  const gun = arena.gun(shooter.gun);
  const { least, most } = gun.damage;
  let sum = 0;
  for (let roll = least; roll <= most; roll++) {
    for (const [weight, extra] of [
      [100 - odds.crit, 0],
      [odds.crit, gun['crit-damage']],
    ] as const) {
      const dealt = Math.max(1, roll + extra - target.armor);
      sum += weight * (Math.min(dealt, target.hp) + (dealt >= target.hp ? KILL : 0));
    }
  }
  return Math.floor((odds.hit * sum * 100) / (most - least + 1));
}

const isShot = (plan: Plan) => plan.after?.type === 'shoot';

/** Every plan for `unit` this turn, scored. */
export function plansFor(arena: Arena, battle: Battle, unit: Unit): Plan[] {
  const foes = foesOf(battle, unit);
  const away = stepsAway(
    arena,
    battle,
    foes.map((f) => f.at),
  );
  const plans: Plan[] = [];
  const consider = (doors: Doors, spot: Spot, ap: number, open: Side | null) => {
    const grid = fieldOf(arena, doors);
    const there = { ...unit, at: spot.tile };
    const seenBy = foes.filter((f) => sees(arena, grid, f.at, spot.tile));
    const base = {
      to: spot.tile,
      ap,
      open,
      path: spot.path,
      threat: seenBy.reduce((sum, f) => sum + harm(arena, battle, grid, f, there), 0),
      risk: overwatchRisk(arena, battle, unit, spot.path, foes),
      steps: away.get(tileKey(spot.tile)) ?? FAR,
      exposed: seenBy.filter((f) => coverAt(grid, spot.tile, f.at).flanked).map((f) => f.id),
    };
    if (unit.ap - ap < 1 || unit.gun === null) {
      plans.push({ ...base, after: null, attack: 0, score: 0 });
      return;
    }
    // Sight goes both ways: whoever sees it there, it can shoot.
    for (const foe of seenBy) {
      const shot = { type: 'shoot', target: foe.id, flanked: coverAt(grid, foe.at, spot.tile).flanked } as const;
      plans.push({ ...base, after: shot, attack: harm(arena, battle, grid, there, foe), score: 0 });
    }
    plans.push({ ...base, after: { type: 'watch' }, attack: base.steps <= WATCH_STEPS ? WATCH : IDLE, score: 0 });
  };
  for (const spot of reachOf(arena, battle, unit, budgetOf(unit)).values()) {
    consider(
      { doors: doorsOpened(arena, battle.doors, spot.path), welds: battle.welds },
      spot,
      spot.cost === 0 ? 0 : apFor(unit, spot.cost),
      null,
    );
  }
  // Breaching: a shut door beside it opened, then a shot or a watch through it.
  if (unit.ap >= 2) {
    const here: Spot = { tile: unit.at, cost: 0, path: [unit.at] };
    for (const side of SIDES) {
      if (!shutDoor(arena, battle, unit.at, side)) continue;
      consider({ doors: opened(battle.doors, unit.at, side), welds: battle.welds }, here, 1, side);
    }
  }
  return plans.map((plan) => ({
    ...plan,
    score: 10 * plan.attack - 8 * (plan.threat + plan.risk) - (isShot(plan) ? 0 : STEP * plan.steps),
  }));
}

/**
 * The plan to make. Plans that end in the open are allowed only for a shot worth the risk and better than
 * any covered plan has, or when no plan is covered. Of those allowed, the best-scoring shot worth taking,
 * or else the best score; the first on a tie.
 */
export function bestPlan(plans: readonly Plan[]): Plan {
  const covered = plans.filter((p) => p.exposed.length === 0);
  const coveredShot = Math.max(Number.NEGATIVE_INFINITY, ...covered.filter(isShot).map((p) => p.attack));
  const allowed = plans.filter(
    (p) =>
      p.exposed.length === 0 || covered.length === 0 || (isShot(p) && p.attack >= OPEN_SHOT && p.attack > coveredShot),
  );
  const holding = Math.max(Number.NEGATIVE_INFINITY, ...allowed.filter((p) => !isShot(p)).map((p) => p.score));
  const shots = allowed.filter((p) => isShot(p) && p.attack >= MIN_SHOT && p.score >= holding - RECKLESS);
  return (shots.length > 0 ? shots : allowed).reduce((best, plan) => (plan.score > best.score ? plan : best));
}

/** The next action for the side to play: `end` once none of it has an ap left. */
export function aiAction(arena: Arena, battle: Battle): Move {
  const unit = battle.units.find((u) => u.side === battle.side && active(u) && u.ap > 0);
  if (!unit) return { type: 'end' };
  const order = orderAction(arena, battle, unit);
  if (order) return order;
  if (unit.gun !== null && unit.ammo < 1) return { type: 'reload', unit: unit.id };
  const plan = bestPlan(plansFor(arena, battle, unit));
  if (plan.open) return { type: 'open', unit: unit.id, side: plan.open };
  if (!same(plan.to, unit.at)) return { type: 'move', unit: unit.id, to: plan.to };
  if (plan.after?.type === 'shoot') return { type: 'shoot', unit: unit.id, target: plan.after.target };
  if (plan.after?.type === 'watch') return { type: 'watch', unit: unit.id };
  return { type: 'end' };
}

/** The open doors with one more: the door on that side of the tile. */
function opened(doors: readonly string[], at: Tile, side: Side): string[] {
  const key = edgeKey(at, side);
  return doors.includes(key) ? [...doors] : [...doors, key].sort();
}

/** The open doors once a walk along `path` has opened the shut ones on its way. */
function doorsOpened(arena: Arena, doors: readonly string[], path: readonly Tile[]): string[] {
  let now = [...doors];
  for (let i = 1; i < path.length; i++) now = throughDoor(arena, now, path[i - 1] as Tile, path[i] as Tile);
  return now;
}

function throughDoor(arena: Arena, doors: string[], from: Tile, to: Tile): string[] {
  const side = sideToward(from, to);
  return arena.grid.edge(from[0], from[1], side) === 'door' ? opened(doors, from, side) : doors;
}

/**
 * The fire a walk along `path` would draw: each foe on overwatch shoots at the first tile on it that it
 * sees (not one shared with someone, where it holds fire), doors opening as the walk reaches them.
 */
function overwatchRisk(arena: Arena, battle: Battle, unit: Unit, path: readonly Tile[], foes: readonly Unit[]): number {
  const watching = new Set(foes.filter((f) => f.watch));
  let risk = 0;
  let doors = [...battle.doors];
  for (let i = 1; i < path.length && watching.size > 0; i++) {
    const tile = path[i] as Tile;
    doors = throughDoor(arena, doors, path[i - 1] as Tile, tile);
    if (battle.units.some((u) => u.id !== unit.id && u.status !== 'dead' && same(u.at, tile))) continue;
    const grid = fieldOf(arena, { doors, welds: battle.welds });
    for (const foe of watching) {
      if (!sees(arena, grid, foe.at, tile)) continue;
      risk += harm(arena, battle, grid, foe, { ...unit, at: tile }, true);
      watching.delete(foe);
    }
  }
  return risk;
}
