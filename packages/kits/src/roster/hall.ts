/**
 * Halls (docs/specs/roster.md#actions): a hall opens in the mode `hiring`, where hiring the offer
 * in a slot is an action. The action and the options it offers share one verdict, so what is
 * offered is what is accepted, as the economy kit's shops do.
 */
import type { DeepReadonly, FactArgs, ModeFrame, ModuleContext, RecordStore } from '@eb/core';
import { lowest, resourceRecord } from '../economy/amounts.ts';
import { own } from '../own.ts';
import { makeRecruit, roomOf } from './members.ts';
import { hallRecord, type Offer, offerAt, roundOf } from './offers.ts';
import { HIRING, type Rolled, type RosterSlice } from './types.ts';

/** The hall a mode is for: its data's `hall`, as open-hall pushes it. */
export function hallIn(mode: ModeFrame): string | undefined {
  const data = mode.data as { hall?: unknown } | undefined;
  return mode.id === HIRING && typeof data?.hall === 'string' ? data.hall : undefined;
}

/** What a hire reads, from an action's context or its options' view. */
export interface Hiring {
  readonly content: RecordStore;
  readonly slice: DeepReadonly<RosterSlice>;
  fact(id: string, args?: FactArgs): unknown;
  /** Whether fees are charged: only with the economy kit on (W117). */
  readonly fees: boolean;
}

export type HireVerdict =
  | { readonly ok: true; readonly offer: Offer }
  | { readonly ok: false; readonly reason: string; readonly data: Readonly<Record<string, unknown>> };

const no = (reason: string, data: Readonly<Record<string, unknown>>): HireVerdict => ({ ok: false, reason, data });

/** The first resource of a fee the party is short of, as the economy kit's pay-cost finds it. */
function shortOf(hiring: Hiring, fee: Readonly<Record<string, number>>) {
  for (const resource of Object.keys(fee).sort()) {
    const need = fee[resource] as number;
    const have = hiring.fact('economy.amount', { resource }) as number;
    if (have - need < lowest(resourceRecord(hiring.content, resource))) return { resource, have, need };
  }
  return undefined;
}

/** Whether the offer in a slot can be hired now: a slot of the hall, not hired this round, room, and the fee. */
export function hireVerdict(hiring: Hiring, hall: string, slot: unknown): HireVerdict {
  const offers = hallRecord(hiring.content, hall).offers ?? 1;
  if (!Number.isSafeInteger(slot) || (slot as number) < 0 || (slot as number) >= offers) {
    return no('no-such-slot', { hall, slot: String(slot) });
  }
  if (own(hiring.slice.halls, hall)?.hired?.includes(slot as number))
    return no('hired', { hall, slot: slot as number });
  if ((roomOf(hiring, hiring.slice) ?? 1) < 1) return no('roster-full', { hall, slot: slot as number });
  const offer = offerAt(hiring.content, hiring.slice, hall, slot as number);
  const short = hiring.fees ? shortOf(hiring, offer.fee) : undefined;
  if (short) return no('cant-afford', { hall, slot: slot as number, ...short });
  return { ok: true, offer };
}

/** The slots that can be hired now, in order. */
export function hireOptions(hiring: Hiring, hall: string): { slot: number }[] {
  const offers = hallRecord(hiring.content, hall).offers ?? 1;
  const slots: { slot: number }[] = [];
  for (let slot = 0; slot < offers; slot++) if (hireVerdict(hiring, hall, slot).ok) slots.push({ slot });
  return slots;
}

/** Hires the offer in a slot: its fee paid, it joins as a new recruit, and its slot is hired for the round. */
export function hire(ctx: ModuleContext<RosterSlice>, hiring: Hiring, slot: unknown) {
  const hall = hallIn(ctx.modes.current);
  if (hall === undefined) return ctx.refuse('not-hiring');
  const verdict = hireVerdict(hiring, hall, slot);
  if (!verdict.ok) return ctx.refuse(verdict.reason, verdict.data);
  const { offer } = verdict;
  if (hiring.fees && Object.keys(offer.fee).length > 0) ctx.apply({ effect: 'pay-cost', cost: offer.fee });
  const rolled: Rolled = {
    recruit: offer.recruit,
    name: offer.name,
    ...(offer.stats ? { stats: offer.stats } : {}),
    ...(offer.traits ? { traits: offer.traits } : {}),
  };
  const round = roundOf(ctx.read(), hall);
  const hired = [...(own(ctx.read().halls, hall)?.hired ?? []), offer.slot];
  const actor = makeRecruit(ctx, rolled);
  (ctx.write().halls as Record<string, unknown>)[hall] = { round, hired };
  ctx.emit('hired', { hall, slot: offer.slot, actor });
}

/** Opens a hall in the mode `hiring`. Refused while a hall is open. */
export function openHall(ctx: ModuleContext<RosterSlice>, hall: unknown) {
  hallRecord(ctx.content, hall);
  const open = hallIn(ctx.modes.current);
  if (open !== undefined) return ctx.refuse('already-in-hall', { hall: open });
  ctx.modes.push(HIRING, { hall });
  ctx.emit('hall-opened', { hall: hall as string });
}

/** Starts a hall's next round: new offers, none of them hired. */
export function refreshHall(ctx: ModuleContext<RosterSlice>, hall: unknown): void {
  hallRecord(ctx.content, hall);
  const round = roundOf(ctx.read(), hall as string) + 1;
  (ctx.write().halls as Record<string, unknown>)[hall as string] = { round };
}

export function leaveHall(ctx: ModuleContext<RosterSlice>) {
  const hall = hallIn(ctx.modes.current);
  if (hall === undefined) return ctx.refuse('not-hiring');
  ctx.modes.pop();
  ctx.emit('hall-left', { hall });
}
