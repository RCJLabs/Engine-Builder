/**
 * Opening, showing and ending talks (docs/specs/dialogue.md#talking): a talk opens at the line its
 * first holding start gives, in the mode `talking`, or waits its turn while another is open. A
 * line shown is counted and its effects apply; an ending opens the next talk waiting.
 */
import type { DeepReadonly, ModuleContext } from '@eb/core';
import type { Choosing } from '../events/choices.ts';
import { own } from '../own.ts';
import { namedLine, talkRecord } from './records.ts';
import { type DialogueSlice, type OpenTalk, TALKING } from './types.ts';
import { openingLine, saidIn, shownOptions, wayOn } from './view.ts';

type Ctx = ModuleContext<DialogueSlice>;

/**
 * Moves the open talk to the line and shows it: counted, `heard` raised, then its effects. A line
 * without text that shows no option passes (M3.11): the talk goes on from it at once, to the line
 * its branches or Then give, or ends. E035 stops lines that pass to each other in a loop; past as
 * many passes as the talk has lines, it throws.
 */
export function showLine(ctx: Ctx, choosing: Choosing, talk: string, id: string): void {
  let at: string | undefined = id;
  for (let passes = 0; at !== undefined; passes++) {
    const line = namedLine(ctx.content, talk, at);
    if (passes > talkRecord(ctx.content, talk).lines.length) throw new Error(`The talk "${talk}" passes in a loop`);
    const draft = ctx.write();
    draft.open = { talk, line: at };
    const heard = own(draft.heard, talk) ?? {};
    draft.heard[talk] = { ...heard, [at]: (own(heard, at) ?? 0) + 1 };
    ctx.emit('heard', { talk, line: at });
    for (const effect of line.effects ?? []) ctx.apply(effect);
    if (line.text !== undefined || shownOptions(choosing, line, saidIn(ctx.read(), talk)).length > 0) return;
    at = wayOn(choosing, line);
    if (at === undefined) endTalk(ctx, choosing);
  }
}

/** Opens the talk at its first holding start's line; when none holds, `nothing-to-say` instead. */
function begin(ctx: Ctx, choosing: Choosing, talk: string): void {
  const line = openingLine(choosing, talkRecord(ctx.content, talk));
  if (line === undefined) {
    ctx.emit('nothing-to-say', { talk });
    return;
  }
  ctx.modes.push(TALKING, { talk });
  const draft = ctx.write();
  draft.talked[talk] = (own(draft.talked, talk) ?? 0) + 1;
  draft.open = { talk, line };
  ctx.emit('opened', { talk, line });
  showLine(ctx, choosing, talk, line);
}

/** Opens the talk now, or puts it last among those waiting while another is open. */
export function openTalk(ctx: Ctx, choosing: Choosing, talk: unknown): void {
  talkRecord(ctx.content, talk);
  if (ctx.read().open === undefined) begin(ctx, choosing, talk as string);
  else ctx.write().waiting.push(talk as string);
}

/**
 * Ends the open talk, whose mode is on top: the mode off, `ended` raised, then the first talk
 * waiting that has something to say opens.
 */
export function endTalk(ctx: Ctx, choosing: Choosing): void {
  const { open } = ctx.read();
  if (open === undefined) return;
  const { talk } = open;
  ctx.modes.pop();
  delete ctx.write().open;
  ctx.emit('ended', { talk });
  while (ctx.read().open === undefined && ctx.read().waiting.length > 0) {
    const next = ctx.write().waiting.shift() as string;
    begin(ctx, choosing, next);
  }
}

/** The open talk, while the mode is `talking`: what `dialogue/say` and `dialogue/go-on` act in. */
export function talkingIn(ctx: Ctx): DeepReadonly<OpenTalk> | undefined {
  return ctx.modes.current.id === TALKING ? ctx.read().open : undefined;
}
