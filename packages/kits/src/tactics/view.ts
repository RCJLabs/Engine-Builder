/**
 * A battle as the page shows it (M7.5, D87, docs/specs/tactics.md#the-stage): each unit as it stands, and on
 * the crew's turn what each of them may do now. The choices are optionsOf's, grouped by unit, so the page
 * offers only what the rules take; a move carries its path and action points from the same reach, and a shot
 * or a dart its odds from the same shotOdds and dartOdds the roll reads, so the odds shown are the odds rolled.
 */
import type { Side, Tile } from '@eb/core';
import { type Arena, apFor, budgetOf, fieldOf, reachOf, unitOf } from './field.ts';
import { dartOdds, type Odds, shotOdds } from './odds.ts';
import { optionsOf } from './options.ts';
import { orderOf } from './orders.ts';
import type { Battle, Move, OrderKind, Status, Team, Unit, Weld } from './types.ts';

export interface UnitView {
  readonly id: string;
  readonly side: Team;
  readonly actor: string;
  readonly at: Tile;
  readonly hp: number;
  readonly most: number;
  readonly ap: number;
  readonly ammo: number;
  /** Its gun's clip, 0 with no gun. */
  readonly clip: number;
  readonly status: Status;
  readonly watch: boolean;
  readonly bleed: number;
  readonly marked: boolean;
  readonly suppressed: boolean;
  readonly asleep: boolean;
  /** Its order's kind and the uses left, or null. */
  readonly order: { readonly kind: OrderKind; readonly name?: string; readonly uses: number } | null;
}

/** A shot's odds at one foe, part by part. */
export interface ShotView extends Odds {
  readonly target: string;
}

export interface StepView {
  readonly to: Tile;
  /** 1 within its mobility, 2 for a dash. */
  readonly ap: number;
  readonly path: readonly Tile[];
}

/** An order the unit may give now: at a unit, a door's side, or itself; a dart with its odds. */
export interface OrderChoice {
  readonly target?: string;
  readonly side?: Side;
  readonly odds?: Odds;
}

export interface ChoicesView {
  readonly unit: string;
  readonly moves: readonly StepView[];
  readonly shots: readonly ShotView[];
  readonly watch: boolean;
  readonly reload: boolean;
  readonly steady: readonly string[];
  readonly open: readonly Side[];
  readonly orders: readonly OrderChoice[];
}

export interface BattleView {
  readonly battle: string;
  readonly side: Team;
  readonly round: number;
  readonly doors: readonly string[];
  readonly welds: readonly Weld[];
  readonly units: readonly UnitView[];
  /** The crew's, each active one with ap left, on their turn; none on the foes'. */
  readonly choices: readonly ChoicesView[];
}

function unitView(arena: Arena, unit: Unit): UnitView {
  const order = orderOf(arena, unit);
  return {
    id: unit.id,
    side: unit.side,
    actor: unit.actor,
    at: [unit.at[0], unit.at[1]],
    hp: unit.hp,
    most: unit.most,
    ap: unit.ap,
    ammo: unit.ammo,
    clip: unit.gun === null ? 0 : arena.gun(unit.gun).clip,
    status: unit.status,
    watch: unit.watch,
    bleed: unit.bleed,
    marked: unit.mark !== null,
    suppressed: unit.suppressed !== null,
    asleep: unit.asleep,
    order: order === null ? null : { kind: order.kind, ...(order.name ? { name: order.name } : {}), uses: unit.uses },
  };
}

function choicesOf(arena: Arena, battle: Battle, unit: Unit, moves: readonly Move[]): ChoicesView {
  const grid = fieldOf(arena, battle);
  const reach = reachOf(arena, battle, unit, budgetOf(unit));
  const mine = moves.filter((m) => m.type !== 'end' && m.unit === unit.id);
  const of = <T extends Move['type']>(type: T) => mine.filter((m): m is Extract<Move, { type: T }> => m.type === type);
  const foe = (id: string) => unitOf(battle, id) as Unit;
  const sedate = orderOf(arena, unit)?.kind === 'sedate';
  return {
    unit: unit.id,
    moves: of('move').map(({ to }) => {
      const spot = reach.get(`${to[0]},${to[1]}`);
      return { to: [to[0], to[1]], ap: apFor(unit, spot?.cost ?? 0), path: spot?.path ?? [] };
    }),
    shots: of('shoot').map(({ target }) => ({ target, ...shotOdds(arena, battle, grid, unit, foe(target)) })),
    watch: of('watch').length > 0,
    reload: of('reload').length > 0,
    steady: of('steady').map((m) => m.target),
    open: of('open').map((m) => m.side as Side),
    orders: of('order').map(({ target, side }) => ({
      ...(target !== undefined ? { target } : {}),
      ...(side !== undefined ? { side: side as Side } : {}),
      ...(sedate && target !== undefined ? { odds: dartOdds(arena, battle, grid, unit, foe(target)) } : {}),
    })),
  };
}

export function battleView(arena: Arena, battle: Battle): BattleView {
  const moves = optionsOf(arena, battle);
  const playing = battle.side === 'crew' ? battle.units.filter((u) => u.side === 'crew') : [];
  return {
    battle: battle.battle,
    side: battle.side,
    round: battle.round,
    doors: [...battle.doors],
    welds: battle.welds.map((w) => ({ ...w })),
    units: battle.units.map((u) => unitView(arena, u)),
    choices: playing
      .filter((u) => moves.some((m) => m.type !== 'end' && m.unit === u.id))
      .map((u) => choicesOf(arena, battle, u, moves)),
  };
}
