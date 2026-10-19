/**
 * What a talk shows and what can be said (docs/specs/dialogue.md#what-a-line-shows): the line it is
 * at, or would open at, and its options with the events kit's verdict and view, so locks, costs
 * and odds read as an event's do, and what is shown open is what saying accepts.
 */
import type { Condition, DeepReadonly, Effect, EffectPreview } from '@eb/core';
import { type ChoiceVerdict, type Choosing, choiceShown, verdictOn } from '../events/choices.ts';
import { own } from '../own.ts';
import { lineOf, talkRecord } from './records.ts';
import type { DialogueSlice, Line, OpenTalk, TalkOption, TalkRecord } from './types.ts';

type Slice = DeepReadonly<DialogueSlice>;

const holds = (choosing: Choosing, condition: Condition | undefined) =>
  condition === undefined || choosing.check(condition) === true;

/** The line a talk's starts open it at: the first start whose If holds. */
export const openingLine = (choosing: Choosing, talk: TalkRecord): string | undefined =>
  talk.starts.find((start) => holds(choosing, start.if))?.line;

/** What has been said in a talk. */
export const saidIn = (slice: Slice, talk: string): readonly string[] => own(slice.said, talk) ?? [];

/** The options a line shows: those whose If holds, less a once option already said. */
export const shownOptions = (choosing: Choosing, line: Line, said: readonly string[]): readonly TalkOption[] =>
  (line.options ?? []).filter(
    (option) => holds(choosing, option.if) && !(option.once === true && said.includes(option.id)),
  );

/** The options the open talk's line shows now; none when it is at a line its talk lacks (E035 stops that). */
export function openOptions(choosing: Choosing, slice: Slice, open: DeepReadonly<OpenTalk>): readonly TalkOption[] {
  const line = lineOf(talkRecord(choosing.content, open.talk), open.line);
  return line ? shownOptions(choosing, line, saidIn(slice, open.talk)) : [];
}

/** Whether the option of that id can be said now, at the open talk's line. */
export function sayVerdict(
  choosing: Choosing,
  slice: Slice,
  open: DeepReadonly<OpenTalk>,
  id: unknown,
): ChoiceVerdict<TalkOption> {
  const option = openOptions(choosing, slice, open).find((each) => each.id === id);
  return verdictOn(choosing, option, id, { missing: 'no-such-option', at: { talk: open.talk }, key: 'option' });
}

/** The options that can be said now, in the line's order: what `dialogue/say` offers. */
export function sayOptions(choosing: Choosing, slice: Slice): { option: string }[] {
  const { open } = slice;
  if (open === undefined) return [];
  return openOptions(choosing, slice, open)
    .filter((option) => sayVerdict(choosing, slice, open, option.id).ok)
    .map((option) => ({ option: option.id }));
}

/** What a talk shows: the open talk's line, or the line its starts would open another at, with its options. */
export function talkView(choosing: Choosing, slice: Slice, id: unknown, preview: (e: Effect) => EffectPreview) {
  const talk = talkRecord(choosing.content, id);
  const { open } = slice;
  const at = open !== undefined && open.talk === id ? open.line : openingLine(choosing, talk);
  const line = lineOf(talk, at);
  if (!line) return { talk: id };
  const speaker = line.speaker ?? talk.speaker;
  const shown = shownOptions(choosing, line, saidIn(slice, id as string));
  const odds = talk['show-odds'] === true;
  return {
    talk: id,
    line: line.id,
    ...(speaker === undefined ? {} : { speaker }),
    text: line.text,
    ...(shown.length > 0
      ? { options: shown.map((option) => choiceShown(choosing, option, odds, preview)) }
      : { 'go-on': line.next === undefined ? 'end' : 'next' }),
  };
}
