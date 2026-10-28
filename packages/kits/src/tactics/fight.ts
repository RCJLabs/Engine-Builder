/**
 * A battle in play (M7.5, D87, docs/specs/tactics.md#starting-and-ending): start-battle sets it out from its
 * record and its actors' stats, each action is the rules' act on the slice, the foes' turn is played by the
 * AI inside the step that hands it to them, and the end writes the crew's health back and runs win or lose.
 */
import type { Effect, ModuleContext, PackTiles } from '@eb/core';
import type { Arena, Rolls } from './field.ts';
import { playFoes } from './foes.ts';
import { arenaOf, battleRecord, kitOf, rulesRecord } from './records.ts';
import { act, createBattle, type Setting } from './turns.ts';
import {
  type Battle,
  FIGHTING_BATTLE,
  type Move,
  type Post,
  type TacticsSlice,
  type Team,
  type Told,
} from './types.ts';

type Ctx = ModuleContext<TacticsSlice>;
export type Tiles = Readonly<Record<string, PackTiles>>;

const rollsOf = (ctx: Ctx): Rolls => {
  const rng = ctx.rng('battle');
  return { int: (min, max) => rng.int(min, max) };
};

/** start-battle: the battle set out, its mode pushed, the first side's turn begun. */
export function startBattle(ctx: Ctx, tiles: Tiles, effect: Effect): void {
  const id = effect.battle as string;
  if (ctx.read().battle) ctx.refuse('battle-under-way');
  const record = battleRecord(ctx.content, id);
  const arena = arenaOf(ctx.content, tiles, id);
  const places = (tiles[record.space] as PackTiles).places;
  const settings = [
    ...record.crew.map((post) => settingOf(ctx, record.rules, 'crew', post, places)),
    ...record.foes.map((post) => settingOf(ctx, record.rules, 'foes', post, places)),
  ];
  const { battle, told } = createBattle(arena, { battle: id, first: record.first ?? 'crew', units: settings });
  const slice = ctx.write();
  slice.fought[id] = (slice.fought[id] ?? 0) + 1;
  ctx.modes.push(FIGHTING_BATTLE, { battle: id });
  ctx.emit('started', { battle: id });
  settle(ctx, arena, battle, told, rollsOf(ctx));
}

function settingOf(ctx: Ctx, rules: string, side: Team, post: Post, places: PackTiles['places']): Setting {
  const numbers = rulesRecord(ctx.content, rules);
  const value = (stat: string | undefined) =>
    stat === undefined ? 0 : (ctx.fact('stats.value', { actor: post.actor, stat }) as number);
  const at = Object.hasOwn(places, post.at) ? places[post.at] : undefined;
  if (!at) ctx.refuse('off-the-map', { at: post.at });
  const most = value(numbers.health);
  const hp =
    side === 'crew' ? (ctx.fact('stats.current', { actor: post.actor, stat: numbers.health }) as number) : most;
  return {
    side,
    actor: post.actor,
    at: at as readonly [number, number],
    hp,
    most,
    aim: value(numbers.aim),
    defense: value(numbers.defense),
    armor: value(numbers.armor),
    mobility: value(numbers.mobility),
    ...kitOf(ctx.content, post.actor),
  };
}

/** One of the crew's actions, and the foes' turn after it when it hands them one. */
export function playMove(ctx: Ctx, tiles: Tiles, move: Move): void {
  const battle = ctx.read().battle as Battle | null;
  if (!battle) ctx.refuse('no-battle');
  const now = battle as Battle;
  if (now.side !== 'crew') ctx.refuse('not-the-crew');
  const arena = arenaOf(ctx.content, tiles, now.battle);
  const rolls = rollsOf(ctx);
  const result = act(arena, now, move, rolls);
  // The rules' own words say why, for the stage's line.
  if (!result.ok) ctx.refuse('not-allowed', { why: result.error });
  else settle(ctx, arena, result.battle, result.told, rolls);
}

/** The foes' turn played when it is theirs, what happened told, and the battle kept or ended. */
function settle(ctx: Ctx, arena: Arena, start: Battle, told: Told[], rolls: Rolls): void {
  const foes = playFoes(arena, start, rolls);
  const battle = foes.battle;
  told.push(...foes.told);
  ctx.write().battle = battle;
  for (const { type, ...data } of told) if (type !== 'over') ctx.emit(type, data);
  if (battle.winner) finish(ctx, battle);
}

/** The battle won or lost: the crew's health written back, falls given, the counts, the mode, and win or lose. */
function finish(ctx: Ctx, battle: Battle): void {
  const record = battleRecord(ctx.content, battle.battle);
  const health = rulesRecord(ctx.content, record.rules).health;
  for (const unit of battle.units) {
    if (unit.side !== 'crew') continue;
    const now = ctx.fact('stats.current', { actor: unit.actor, stat: health }) as number;
    const ended = unit.status === 'out' || unit.status === 'dead' ? 0 : unit.hp;
    if (ended < now) ctx.apply({ effect: 'damage-stat', actor: unit.actor, stat: health, by: now - ended });
    if (ended > now) ctx.apply({ effect: 'heal-stat', actor: unit.actor, stat: health, by: ended - now });
    if ((unit.status === 'out' || unit.status === 'dead') && record.falls)
      ctx.apply({ effect: 'add-status', actor: unit.actor, status: record.falls });
  }
  const slice = ctx.write();
  const won = battle.winner === 'crew';
  const counts = won ? slice.won : slice.lost;
  counts[battle.battle] = (counts[battle.battle] ?? 0) + 1;
  slice.battle = null;
  if (ctx.modes.current.id === FIGHTING_BATTLE) ctx.modes.pop();
  ctx.emit(won ? 'won' : 'lost', { battle: battle.battle });
  for (const effect of (won ? record.win : record.lose) ?? []) ctx.apply(effect);
}
