/**
 * Opening events (docs/specs/events.md#effects): an event opens in the mode `choosing`, or waits
 * its turn while another is open, so a consequence or a chain landing mid-event is never refused
 * or lost (D45).
 */
import type { ModuleContext } from '@eb/core';
import { own } from '../own.ts';
import { eventRecord } from './records.ts';
import { CHOOSING, type EventsSlice } from './types.ts';

type Ctx = ModuleContext<EventsSlice>;

function show(ctx: Ctx, event: string): void {
  const draft = ctx.write();
  draft.open = event;
  draft.seen[event] = (own(draft.seen, event) ?? 0) + 1;
  ctx.modes.push(CHOOSING, { event });
  ctx.emit('opened', { event });
}

/** Opens the event now, or puts it last among those waiting while another is open. */
export function openEvent(ctx: Ctx, event: unknown): void {
  eventRecord(ctx.content, event);
  if (ctx.read().open === undefined) show(ctx, event as string);
  else ctx.write().waiting.push(event as string);
}

/** Opens the first event waiting, once none is open. */
export function openNext(ctx: Ctx): void {
  const slice = ctx.read();
  const [next] = slice.waiting;
  if (slice.open !== undefined || next === undefined) return;
  ctx.write().waiting.shift();
  show(ctx, next);
}

/** The open event, while the mode is `choosing`: what `events/choose` chooses in. */
export function choosingIn(ctx: Ctx): string | undefined {
  const { open } = ctx.read();
  return ctx.modes.current.id === CHOOSING ? open : undefined;
}

/**
 * Closes the open event as a choice is made: the mode comes off, the choice is counted and kept,
 * and the choice is noted for the receipts of consequences its effects book.
 */
export function closeEvent(ctx: Ctx, event: string, choice: string): void {
  ctx.modes.pop();
  const draft = ctx.write();
  delete draft.open;
  draft.choices += 1;
  const made = own(draft.chose, event) ?? [];
  if (!made.includes(choice)) draft.chose[event] = [...made, choice].sort();
  draft.choosing = { event, choice };
}
