/** The dialogue kit's records, read by id: validation stops content naming one that isn't there (E005, E035, E042). */
import type { RecordStore } from '@eb/core';
import { type Line, TALK, type TalkOption, type TalkRecord } from './types.ts';

export function talkRecord(content: RecordStore, id: unknown): TalkRecord {
  if (typeof id !== 'string' || !content.has(TALK, id)) throw new Error(`No talk "${String(id)}"`);
  return content.get(TALK, id) as TalkRecord;
}

/** The talk's line of that id, or undefined. */
export const lineOf = (talk: TalkRecord, id: unknown): Line | undefined => talk.lines.find((line) => line.id === id);

/** The talk's option of that id, in whichever line it is: option ids are once in a talk (E035). */
export function optionOf(talk: TalkRecord, id: unknown): TalkOption | undefined {
  for (const line of talk.lines) {
    const option = line.options?.find((each) => each.id === id);
    if (option) return option;
  }
  return undefined;
}

/** The line, or a thrown error: E035 stops a talk leading to a line it doesn't have, E042 a condition naming one. */
export function namedLine(content: RecordStore, talk: unknown, id: unknown): Line {
  const line = lineOf(talkRecord(content, talk), id);
  if (!line) throw new Error(`The talk "${String(talk)}" has no line "${String(id)}"`);
  return line;
}

/** The option, or a thrown error: E042 stops a condition naming one its talk doesn't have. */
export function namedOption(content: RecordStore, talk: unknown, id: unknown): TalkOption {
  const option = optionOf(talkRecord(content, talk), id);
  if (!option) throw new Error(`The talk "${String(talk)}" has no option "${String(id)}"`);
  return option;
}
