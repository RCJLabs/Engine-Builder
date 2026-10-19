/**
 * Decks (docs/specs/events.md#decks): which event comes up, drawn by weight among those that can
 * come. A draw's stream is worked out from the game's salt, the deck and its count of draws, so
 * one deck's draws never shift another's or a roll's (Afterglass's visitors keep a stream of
 * their own for this), and only the count is saved.
 */
import { type DeepReadonly, type ModuleContext, Rng } from '@eb/core';
import { own } from '../own.ts';
import { openEvent } from './open.ts';
import { deckRecord } from './records.ts';
import type { DeckEntry, DeckRecord, DeckState, EventsSlice } from './types.ts';

type Ctx = ModuleContext<EventsSlice>;

const NO_DRAWS: DeckState = { draws: 0, recent: [] };

/** The deck's draws so far, and its last `recent` draws as its record now counts them. */
function stateOf(slice: DeepReadonly<EventsSlice>, deck: string, record: DeckRecord) {
  const state = own(slice.decks, deck) ?? NO_DRAWS;
  const keep = record.recent ?? 0;
  return { draws: state.draws, recent: keep > 0 ? state.recent.slice(-keep) : [] };
}

/** Whether the entry's event can come now: not open or waiting, not once and seen, not drawn lately, its If holding. */
function canCome(ctx: Ctx, entry: DeckEntry, recent: readonly string[]): boolean {
  const slice = ctx.read();
  const { event } = entry;
  if (slice.open === event || slice.waiting.includes(event) || recent.includes(event)) return false;
  if (entry.once === true && (own(slice.seen, event) ?? 0) > 0) return false;
  return entry.if === undefined || ctx.check(entry.if) === true;
}

/** Draws an event from the deck and opens it, or says nothing could come. */
export function drawEvent(ctx: Ctx, deck: unknown): void {
  const record = deckRecord(ctx.content, deck);
  const id = deck as string;
  const slice = ctx.read();
  const { draws, recent } = stateOf(slice, id, record);
  const live = record.events.filter((entry) => canCome(ctx, entry, recent));
  if (live.length === 0) {
    ctx.emit('nothing-drawn', { deck: id });
    return;
  }
  const boost = record.unseen ?? 1;
  const weights = live.map((entry) => (entry.weight ?? 1) * ((own(slice.seen, entry.event) ?? 0) === 0 ? boost : 1));
  const { event } = live[Rng.create(`${slice.salt}/${id}/${draws}`).weightedIndex(weights)] as DeckEntry;
  const keep = record.recent ?? 0;
  ctx.write().decks[id] = { draws: draws + 1, recent: keep > 0 ? [...recent, event].slice(-keep) : [] };
  ctx.emit('drawn', { deck: id, event });
  openEvent(ctx, event);
}
