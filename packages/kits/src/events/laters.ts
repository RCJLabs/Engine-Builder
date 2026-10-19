/**
 * Consequences (docs/specs/events.md#consequences): effects booked to land after so many days,
 * choices or points of a number flag (D45). Each lands in an attempt of its own, as a timer does,
 * after its condition is checked again; one booked while a choice was being made keeps the event
 * and choice as its receipt.
 */
import {
  type Condition,
  type DeepReadonly,
  type Effect,
  type FactArgs,
  type ModuleContext,
  NAME_PATTERN,
} from '@eb/core';
import type { Due, EventsSlice, Later } from './types.ts';

type Ctx = ModuleContext<EventsSlice>;

/** What booking reads: the slice and the facts of the day and the flags. */
export interface Booking {
  readonly slice: DeepReadonly<EventsSlice>;
  fact(id: string, args?: FactArgs): unknown;
}

const isWhole = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 1;

/** When a consequence written now comes due. Throws on an `after` validation stops (E035). */
export function dueOf(booking: Booking, after: unknown): Due {
  const spec = (typeof after === 'object' && after !== null ? after : {}) as Record<string, unknown>;
  const kinds = ['days', 'choices', 'flag'].filter((kind) => spec[kind] !== undefined);
  if (kinds.length !== 1) throw new Error('later: "after" gives one of days, choices and flag');
  if (spec.by !== undefined && spec.flag === undefined) throw new Error('later: "by" counts a flag’s rise');
  if (spec.days !== undefined) {
    if (!isWhole(spec.days)) throw new Error('later: "days" is a whole number, 1 or more');
    return { day: (booking.fact('time.day') as number) + spec.days };
  }
  if (spec.choices !== undefined) {
    if (!isWhole(spec.choices)) throw new Error('later: "choices" is a whole number, 1 or more');
    return { choices: booking.slice.choices + spec.choices };
  }
  const by = spec.by ?? 1;
  if (!isWhole(by)) throw new Error('later: "by" is a whole number, 1 or more');
  const now = booking.fact('flag.number', { flag: spec.flag });
  if (typeof now !== 'number') throw new Error(`later: "${String(spec.flag)}" is not a number flag`);
  return { flag: spec.flag as string, at: now + by };
}

/** Books the consequence an effect writes, replacing any of the same id. */
export function book(ctx: Ctx, effect: Effect): void {
  const slice = ctx.read();
  const due = dueOf({ slice, fact: ctx.fact }, effect.after);
  if (!Array.isArray(effect.do)) throw new Error('later: "do" is a list of effects');
  if (effect.id !== undefined && (typeof effect.id !== 'string' || !NAME_PATTERN.test(effect.id))) {
    throw new Error(`later: "${String(effect.id)}" is not lowercase words joined by hyphens`);
  }
  const seq = slice.next;
  const id = (effect.id as string | undefined) ?? `#${seq}`;
  const later: Later = {
    id,
    seq,
    due,
    ...(effect.if === undefined ? {} : { if: effect.if as Condition }),
    do: [...(effect.do as Effect[])],
    ...(slice.choosing ? { from: { ...slice.choosing } } : {}),
  };
  const draft = ctx.write();
  draft.next = seq + 1;
  draft.laters = [...draft.laters.filter((each) => each.id !== id), later];
  ctx.emit('booked', { later: id });
}

/**
 * Lands every consequence `due` says has come, in the order booked: dropped when its If no longer
 * holds, else its effects applied as one attempt, which a refusal undoes with a beat saying why.
 */
export function landDue(ctx: Ctx, due: (when: DeepReadonly<Due>) => boolean): void {
  for (;;) {
    const later = ctx.read().laters.find((each) => due(each.due));
    if (later === undefined) return;
    const draft = ctx.write();
    draft.laters = draft.laters.filter((each) => each.seq !== later.seq);
    if (later.if !== undefined && ctx.check(later.if as Condition) !== true) {
      ctx.emit('dropped', { later: later.id });
      continue;
    }
    const result = ctx.attempt(() => {
      ctx.emit('landed', { later: later.id, event: later.from?.event ?? '', choice: later.from?.choice ?? '' });
      for (const effect of later.do) ctx.apply(effect as Effect);
    });
    if (!result.ok) ctx.emit('refused', { later: later.id, reason: result.reason });
  }
}

/** Cancels the consequence of that id; nothing for one not pending. */
export function cancelLater(ctx: Ctx, id: unknown): void {
  if (typeof id !== 'string' || !NAME_PATTERN.test(id)) {
    throw new Error(`cancel-later: "${String(id)}" is not lowercase words joined by hyphens`);
  }
  if (!ctx.read().laters.some((each) => each.id === id)) return;
  const draft = ctx.write();
  draft.laters = draft.laters.filter((each) => each.id !== id);
  ctx.emit('cancelled', { later: id });
}

/** The days, choices or points left before a pending consequence is due; undefined when none is. */
export function leftOf(booking: Booking, id: unknown): number | undefined {
  const later = booking.slice.laters.find((each) => each.id === id);
  if (later === undefined) return undefined;
  const { due } = later;
  const left =
    'day' in due
      ? due.day - (booking.fact('time.day') as number)
      : 'choices' in due
        ? due.choices - booking.slice.choices
        : due.at - (booking.fact('flag.number', { flag: due.flag }) as number);
  return Math.max(0, left);
}
