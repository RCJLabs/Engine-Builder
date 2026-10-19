/**
 * A step's beats in words (M4.2, D52, docs/specs/input.md#feedback): each beat is said by the first
 * feedback line that matches it, its holes filled from the beat's arguments, a record's id as the
 * record's name. The worker does this with the step's records, so the page never reads the sim's
 * state, and a line says only what its beat carries.
 */
import { type Beat, canonicalJson, type EventCatalog, type RecordStore } from '@eb/core';
import type { Feedback, FeedbackLine, Said } from '../format/feedback.ts';
import { type Segment, splitTemplate } from '../format/template.ts';
import { nameOf } from './words.ts';

interface Ready {
  readonly line: FeedbackLine;
  /** Undefined when the words don't split, which the compiler has said (E047): they are shown as written. */
  readonly segments: readonly Segment[] | undefined;
}

/** Whether the beat's arguments equal every one the line matches on. */
const matches = (line: FeedbackLine, beat: Beat) =>
  Object.entries(line.where ?? {}).every(
    ([name, wanted]) => Object.hasOwn(beat, name) && canonicalJson(beat[name]) === canonicalJson(wanted),
  );

/** The game's feedback made ready once: its lines by the event they are on, in the file's order. */
export function feedbackSayer(
  feedback: Feedback,
  events: EventCatalog,
): (beats: readonly Beat[], content: RecordStore) => Said[] {
  const byEvent = new Map<string, Ready[]>();
  for (const line of feedback.lines) {
    const split = splitTemplate(line.say);
    const ready = { line, segments: split.ok ? split.segments : undefined };
    byEvent.set(line.on, [...(byEvent.get(line.on) ?? []), ready]);
  }
  return (beats, content) => {
    const said: Said[] = [];
    for (const beat of beats) {
      const found = byEvent.get(beat.type)?.find(({ line }) => matches(line, beat));
      if (found === undefined) continue;
      const text = found.segments ? fillBeat(found.segments, beat, events[beat.type]?.args, content) : found.line.say;
      said.push({ text, to: found.line.to ?? 'both' });
    }
    return said;
  };
}

function fillBeat(
  segments: readonly Segment[],
  beat: Beat,
  args: EventCatalog[string]['args'],
  content: RecordStore,
): string {
  return segments
    .map((segment) => {
      if (segment.kind === 'text') return segment.text;
      // Only an argument is read: a fact or a view's field is E048, so it shows as no value.
      if (segment.kind !== 'field') return '—';
      const value = beat[segment.name];
      const domain = args?.[segment.name];
      if (domain?.type === 'ref') return nameOf(content, domain.to, value) ?? String(value);
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '—';
    })
    .join('');
}
