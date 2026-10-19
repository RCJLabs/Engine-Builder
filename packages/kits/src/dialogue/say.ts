/**
 * Saying and going on (docs/specs/dialogue.md#saying): the cost paid, the option kept, one outcome
 * rolled, the talk ended or led on, then the effects, then the line it leads to shown. The roll
 * comes before the effects, unlike an event's, because the line it leads to decides whether the
 * talk ends first. An effect that refuses refuses the saying.
 */
import type { ModuleContext } from '@eb/core';
import { type Choosing, outcomeTable } from '../events/choices.ts';
import { own } from '../own.ts';
import { endTalk, showLine, talkingIn } from './open.ts';
import { namedLine } from './records.ts';
import type { DialogueSlice, TalkOutcome } from './types.ts';
import { openOptions, sayVerdict } from './view.ts';

type Ctx = ModuleContext<DialogueSlice>;

/** One draw of 1 to 100 from the kit's stream, the outcome the first whose running total of chances reaches it. */
function rollOutcome(ctx: Ctx, talk: string, option: string, outcomes: readonly TalkOutcome[]): TalkOutcome {
  const roll = ctx.rng('outcome').int(1, 100);
  const row = outcomeTable(outcomes).find((each) => roll <= each.to);
  if (row === undefined) throw new Error(`A roll of ${roll} past the table: the chances add up to 100`);
  ctx.emit('rolled', { talk, option, outcome: row.index, roll });
  return row.outcome as unknown as TalkOutcome;
}

export function say(ctx: Ctx, choosing: Choosing, id: unknown) {
  const open = talkingIn(ctx);
  if (open === undefined) return ctx.refuse('not-talking');
  const { talk, line } = open;
  const verdict = sayVerdict(choosing, ctx.read(), open, id);
  if (!verdict.ok) return ctx.refuse(verdict.reason, verdict.data);
  const option = verdict.choice;
  if (choosing.costs && option.cost && Object.keys(option.cost).length > 0) {
    ctx.apply({ effect: 'pay-cost', cost: option.cost });
  }
  const draft = ctx.write();
  const said = own(draft.said, talk) ?? [];
  if (!said.includes(option.id)) draft.said[talk] = [...said, option.id].sort();
  ctx.emit('said', { talk, line, option: option.id });
  const outcome = option.outcomes ? rollOutcome(ctx, talk, option.id, option.outcomes) : undefined;
  const next = outcome?.next ?? option.next;
  // Ended first, so a mode or a talk the effects open comes next rather than under a talk that is over.
  if (next === undefined) endTalk(ctx, choosing);
  for (const effect of option.effects ?? []) ctx.apply(effect);
  for (const effect of outcome?.effects ?? []) ctx.apply(effect);
  if (next !== undefined) showLine(ctx, talk, next);
}

export function goOn(ctx: Ctx, choosing: Choosing) {
  const open = talkingIn(ctx);
  if (open === undefined) return ctx.refuse('not-talking');
  if (openOptions(choosing, ctx.read(), open).length > 0) return ctx.refuse('has-options');
  const { next } = namedLine(ctx.content, open.talk, open.line);
  if (next === undefined) endTalk(ctx, choosing);
  else showLine(ctx, open.talk, next);
}
