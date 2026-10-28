// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// Cover on a battle map. Each side of a unit's tile gives cover from what is
// there: a wall, the hull, a hatch or a closed door is full cover, and
// otherwise the tile beyond gives its own (data/tiles.json: half for a crate
// or a console, full for a locker or machinery). Cover on a side counts
// against an attacker on that side of the unit, so the north side's counts
// against anyone north of it. The best that counts is the unit's cover
// against that attacker; with none, the unit is flanked (ROADMAP §4.3).
import { SIDES, type Side, step } from './grid.ts';
import { type BattleLike, edgeAt, type Rules, tileRule } from './terrain.ts';

export type Cover = 'half' | 'full';
type Tile = [number, number];

const LEVEL: Record<Cover, number> = { half: 1, full: 2 };

// { cover: null | 'half' | 'full', flanked } for a unit at `at` against an
// attacker at `from`, both [x, y].
export function coverFrom(battle: BattleLike, at: Tile, from: Tile, rules: Rules): { cover: Cover | null; flanked: boolean } {
  let cover: Cover | null = null;
  for (const side of SIDES) {
    if (!facing(side, at, from)) continue;
    const here = coverOnSide(battle, at, side, rules);
    if (here && (!cover || LEVEL[here] > LEVEL[cover])) cover = here;
  }
  return { cover, flanked: cover === null };
}

// The cover on one side of a tile, whoever it is against: null, 'half' or
// 'full'.
export function coverOnSide(battle: BattleLike, [x, y]: Tile, side: Side, rules: Rules): Cover | null {
  if (edgeAt(battle, x, y, side) !== null) return 'full';
  return tileRule(battle, ...step(x, y, side), rules).cover ?? null;
}

// True if `from` is on the given side of `at`.
function facing(side: Side, [x, y]: Tile, [fx, fy]: Tile): boolean {
  if (side === 'n') return fy < y;
  if (side === 's') return fy > y;
  if (side === 'e') return fx > x;
  return fx < x;
}
