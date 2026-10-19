/**
 * Choosing (docs/specs/events.md#the-action): the cost paid, the event closed, the choice's
 * effects applied, one outcome rolled, the consequences counting choices landed, then the next
 * event waiting opened. An effect of the choice that refuses refuses the choice.
 */
import type { ModuleContext } from '@eb/core';
import { type Choosing, choiceVerdict, outcomeTable } from './choices.ts';
import { landDue } from './laters.ts';
import { choosingIn, closeEvent, openNext } from './open.ts';
import type { Choice, EventsSlice, Outcome } from './types.ts';

type Ctx = ModuleContext<EventsSlice>;

/** One draw of 1 to 100 from the kit's stream, the outcome the first whose running total of chances reaches it. */
function rollOutcome(ctx: Ctx, event: string, choice: Choice, outcomes: readonly Outcome[]): void {
  const roll = ctx.rng('outcome').int(1, 100);
  const row = outcomeTable(outcomes).find((each) => roll <= each.to);
  if (row === undefined) throw new Error(`A roll of ${roll} past the table: the chances add up to 100`);
  ctx.emit('rolled', { event, choice: choice.id, outcome: row.index, roll });
  for (const effect of (row.outcome as unknown as Outcome).effects) ctx.apply(effect);
}

export function choose(ctx: Ctx, choosing: Choosing, id: unknown) {
  const event = choosingIn(ctx);
  if (event === undefined) return ctx.refuse('not-choosing');
  const verdict = choiceVerdict(choosing, event, id);
  if (!verdict.ok) return ctx.refuse(verdict.reason, verdict.data);
  const { choice } = verdict;
  if (choosing.costs && choice.cost && Object.keys(choice.cost).length > 0) {
    ctx.apply({ effect: 'pay-cost', cost: choice.cost });
  }
  closeEvent(ctx, event, choice.id);
  ctx.emit('chosen', { event, choice: choice.id });
  for (const effect of choice.effects ?? []) ctx.apply(effect);
  if (choice.outcomes) rollOutcome(ctx, event, choice, choice.outcomes);
  delete ctx.write().choosing;
  const made = ctx.read().choices;
  landDue(ctx, (due) => 'choices' in due && due.choices <= made);
  openNext(ctx);
}
