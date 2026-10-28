/**
 * The odds of a shot, worked out exactly and part by part, so the number a player is shown is the number
 * rolled against (M7.5, D87, docs/specs/tactics.md#the-rules-in-the-engine; from space-wrecked's
 * src/sim/odds.js and orders.js's dartOdds):
 *   hit  = aim + the gun at this range − cover − defense − overwatch + suppressed + marked + forgiving
 *   crit = the gun's crit + the flanking bonus
 * each kept within 0 to 100. Range is between tile middles, in whole numbers: close up to `close` tiles,
 * mid up to `mid`, long beyond.
 */
import type { Cover, Tile, TileGrid } from '@eb/core';
import { type Arena, coverAt } from './field.ts';
import type { Battle, Numbers, Team, Unit } from './types.ts';

export type Band = 'close' | 'mid' | 'long';

/** A part of the odds, in percentage points: what it is, and the band or cover it is for. */
export interface Part {
  readonly why:
    | 'aim'
    | 'gun'
    | 'cover'
    | 'defense'
    | 'overwatch'
    | 'suppressed'
    | 'marked'
    | 'forgiving'
    | 'steady'
    | 'flanked';
  readonly value: number;
  readonly band?: Band;
  readonly cover?: Cover;
}

export interface Odds {
  readonly hit: number;
  readonly hitParts: readonly Part[];
  readonly crit: number;
  readonly critParts: readonly Part[];
  readonly band: Band;
  readonly cover: Cover;
  readonly flanked: boolean;
}

/** Who shoots, as the odds read them. */
export type Shooter = Pick<Unit, 'side' | 'at' | 'aim' | 'gun' | 'suppressed'>;
/** Who is shot at. */
export type Target = Pick<Unit, 'side' | 'at' | 'defense' | 'mark'>;

export function rangeBand(from: Tile, to: Tile, numbers: Numbers): Band {
  const [dc, dr] = [to[0] - from[0], to[1] - from[1]];
  const d2 = dc * dc + dr * dr;
  if (d2 <= numbers.close * numbers.close) return 'close';
  if (d2 <= numbers.mid * numbers.mid) return 'mid';
  return 'long';
}

/** The crew's bonus for its misses in a row, with forgiving odds on. The foes never get it. */
export function forgivingBonus(arena: Arena, battle: Pick<Battle, 'misses'>, side: Team): number {
  if (!arena.forgiving || side !== 'crew') return 0;
  const { numbers } = arena;
  return Math.min(battle.misses.crew * numbers['forgiving-step'], numbers['forgiving-most']);
}

const total = (parts: readonly Part[]): number =>
  Math.max(
    0,
    Math.min(
      100,
      parts.reduce((sum, part) => sum + part.value, 0),
    ),
  );

/** The odds of `shooter`, which has a gun, hitting `target`, on the grid as the battle's doors leave it. */
export function shotOdds(
  arena: Arena,
  battle: Pick<Battle, 'misses'>,
  grid: TileGrid,
  shooter: Shooter,
  target: Target,
  watch = false,
): Odds {
  const { numbers } = arena;
  const gun = arena.gun(shooter.gun as string);
  const band = rangeBand(shooter.at, target.at, numbers);
  const { cover, flanked } = coverAt(grid, target.at, shooter.at);
  const hitParts: Part[] = [
    { why: 'aim', value: shooter.aim },
    { why: 'gun', band, value: gun.accuracy[band] },
  ];
  if (cover !== 'none')
    hitParts.push({ why: 'cover', cover, value: -numbers[cover === 'full' ? 'full-cover' : 'half-cover'] });
  if (target.defense) hitParts.push({ why: 'defense', value: -target.defense });
  if (watch) hitParts.push({ why: 'overwatch', value: -numbers.overwatch });
  if (shooter.suppressed !== null) hitParts.push({ why: 'suppressed', value: shooter.suppressed });
  if (target.mark && target.side !== shooter.side) hitParts.push({ why: 'marked', value: target.mark.aim });
  const forgiving = forgivingBonus(arena, battle, shooter.side);
  if (forgiving) hitParts.push({ why: 'forgiving', value: forgiving });
  const critParts: Part[] = [{ why: 'gun', value: gun.crit }];
  if (flanked) critParts.push({ why: 'flanked', value: numbers['flank-crit'] });
  return { hit: total(hitParts), hitParts, crit: total(critParts), critParts, band, cover, flanked };
}

/** A sedative dart's odds: a shot's, and the order's own aim as a part of its own when it has any. */
export function dartOdds(
  arena: Arena,
  battle: Pick<Battle, 'misses'>,
  grid: TileGrid,
  shooter: Shooter & Pick<Unit, 'order'>,
  target: Target,
): Odds {
  const odds = shotOdds(arena, battle, grid, shooter, target);
  const steady = shooter.order === null ? 0 : (arena.order(shooter.order).aim ?? 0);
  if (!steady) return odds;
  const hitParts = [...odds.hitParts, { why: 'steady', value: steady } as const];
  return { ...odds, hitParts, hit: total(hitParts) };
}
