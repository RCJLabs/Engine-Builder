/**
 * The roster's members (docs/specs/roster.md): its settings, its cap, joining and leaving, the
 * recruits it makes, and ranks on the ladder with the statuses they give. A member who leaves is
 * kept as gone with why (D44), so what names it can still be read.
 */
import type { DeepReadonly, FactArgs, ModuleContext, RecordStore } from '@eb/core';
import { bandAt, bandIndex, reachedBand } from '../bands.ts';
import { own } from '../own.ts';
import { ACTOR } from '../stats/types.ts';
import { recruitId } from './offers.ts';
import { type Ladder, type Rank, ROSTER_RECORD, type Rolled, type RosterRecord, type RosterSlice } from './types.ts';

type Ctx = ModuleContext<RosterSlice>;

/** What reads the roster: content, and facts (the cap's flag, the ladder stat's value). */
export interface Reading {
  readonly content: RecordStore;
  fact(id: string, args?: FactArgs): unknown;
}

/** The roster's settings: its one record, or none. Validation allows one (E035); the first by id is read. */
export function rosterRecord(content: RecordStore): RosterRecord | undefined {
  const [id] = content.ids(ROSTER_RECORD);
  return id === undefined ? undefined : content.get<RosterRecord>(ROSTER_RECORD, id);
}

/** The most members at once: its number flag's value, else its cap; no limit without either. */
export function capOf(view: Reading): number | undefined {
  const roster = rosterRecord(view.content);
  const flag = roster?.['cap-flag'];
  if (flag !== undefined) return view.fact('flag.number', { flag }) as number | undefined;
  return roster?.cap;
}

/** Places left on the roster, or undefined with no cap. */
export function roomOf(view: Reading, slice: DeepReadonly<RosterSlice>): number | undefined {
  const cap = capOf(view);
  return cap === undefined ? undefined : Math.max(0, cap - slice.members.length);
}

const isFull = (view: Reading, slice: DeepReadonly<RosterSlice>) => (roomOf(view, slice) ?? 1) < 1;

const RANKS = 'The rank ladder';

function ladderOf(content: RecordStore): Ladder {
  const ladder = rosterRecord(content)?.ranks;
  if (!ladder) throw new Error('The roster has no ranks');
  return ladder;
}

const ladderValue = (view: Reading, ladder: Ladder, actor: string) =>
  view.fact('stats.value', { actor, stat: ladder.stat }) as number;

/** An actor's rank: the last of the ladder's bands its ladder stat's value has reached. None with no ladder. */
export function rankOf(view: Reading, actor: string): Rank | undefined {
  const ladder = rosterRecord(view.content)?.ranks;
  return ladder ? bandAt(ladder.bands, ladderValue(view, ladder, actor)) : undefined;
}

/** Whether an actor's ladder stat is at or past where the rank begins. A rank the ladder lacks throws (E040). */
export function reachedRank(view: Reading, actor: string, rank: unknown): boolean {
  const ladder = ladderOf(view.content);
  return reachedBand(ladder.bands, RANKS, rank, ladderValue(view, ladder, actor));
}

/** How many members have reached the rank. A rank the ladder lacks throws, members or not. */
export function rankedCount(view: Reading, slice: DeepReadonly<RosterSlice>, rank: unknown): number {
  bandIndex(ladderOf(view.content).bands, RANKS, rank);
  return slice.members.filter((actor) => reachedRank(view, actor, rank)).length;
}

/**
 * Gives a member its rank's status, taking the old rank's off when it moved, and says so. A
 * member's first rank, as it joins or as the game starts, is given without a rank-changed.
 */
export function settleRank(ctx: Ctx, actor: string): void {
  const ladder = rosterRecord(ctx.content)?.ranks;
  if (!ladder) return;
  const rank = rankOf(ctx, actor);
  const before = own(ctx.read().ranks, actor);
  if (rank?.id === before) return;
  const old = ladder.bands.find((band) => band.id === before);
  if (old?.status && old.status !== rank?.status) ctx.apply({ effect: 'remove-status', actor, status: old.status });
  if (rank?.status && rank.status !== old?.status) ctx.apply({ effect: 'add-status', actor, status: rank.status });
  const ranks = ctx.write().ranks as Record<string, string>;
  if (rank) ranks[actor] = rank.id;
  else delete ranks[actor];
  if (before !== undefined && rank !== undefined) ctx.emit('rank-changed', { actor, from: before, to: rank.id });
}

/** An actor joins and is given its rank's status. Nothing for a member; refused when the roster is full. */
export function join(ctx: Ctx, actor: string) {
  const slice = ctx.read();
  if (slice.members.includes(actor)) return;
  if (isFull(ctx, slice)) return ctx.refuse('roster-full', { actor });
  const draft = ctx.write();
  (draft.members as string[]).push(actor);
  delete (draft.gone as Record<string, string>)[actor];
  ctx.emit('joined', { actor });
  settleRank(ctx, actor);
}

/** A member leaves, kept as gone with why, and keeps the status its rank gave it. Nothing for one not on the roster. */
export function leave(ctx: Ctx, actor: string, why: string): void {
  if (!ctx.read().members.includes(actor)) return;
  const draft = ctx.write() as { members: readonly string[]; gone: Record<string, string> };
  draft.members = draft.members.filter((member) => member !== actor);
  draft.gone[actor] = why;
  ctx.emit('left', { actor, why });
}

/** Makes a rolled recruit a record and a member under the next number. Refused when the roster is full. */
export function makeRecruit(ctx: Ctx, rolled: Rolled): string {
  const slice = ctx.read();
  if (isFull(ctx, slice)) return ctx.refuse('roster-full', { recruit: rolled.recruit });
  const id = recruitId(rolled.recruit, slice.next);
  // Validation stops a written actor with an id a recruit could have (E035), so this is content gone wrong.
  if (ctx.content.has(ACTOR, id)) throw new Error(`Recruit "${id}" would take the id of a written actor`);
  const draft = ctx.write() as { next: number; made: Record<string, Rolled> };
  draft.next = slice.next + 1;
  draft.made[id] = rolled;
  join(ctx, id);
  return id;
}
