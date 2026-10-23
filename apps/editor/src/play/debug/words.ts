/**
 * The debug tools' words (M4.9), as plain functions: the calendar's +1 buttons, Replay's report,
 * a quest line's truth, and a named state's slot.
 */
import { type CalendarDef, calendarOf, type Effect } from '@eb/core';
import type { ReplayReport } from './protocol.ts';

export interface TimeStep {
  /** The calendar's unit, as `wait` takes it: "days". */
  readonly unit: string;
  readonly label: string;
}

const singular = (unit: string) => (unit.endsWith('s') ? unit.slice(0, -1) : unit);

/**
 * One +1 button for each length the calendar has, shortest first. Units of one length share a
 * button, named by the unit the calendar names rather than its ticks: a day of one tick is "+1 day".
 */
export function timeSteps(calendar: CalendarDef): TimeStep[] {
  const bySize = new Map<number, string>();
  for (const [unit, size] of Object.entries(calendarOf(calendar).units)) {
    if (!bySize.has(size) || bySize.get(size) === 'ticks') bySize.set(size, unit);
  }
  return [...bySize].sort(([a], [b]) => a - b).map(([, unit]) => ({ unit, label: `+1 ${singular(unit)}` }));
}

const shown = (value: unknown) => (value === undefined ? 'nothing' : JSON.stringify(value));

const listed = (names: readonly string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/** What Replay found, in a sentence or two. */
export function replayWords(report: ReplayReport): string {
  if (report.kind === 'same') {
    if (report.steps === 0) return 'There were no steps to play again: the start is the same.';
    return report.steps === 1 ? 'The one step plays out the same.' : `All ${report.steps} steps play out the same.`;
  }
  if (report.kind === 'refused') {
    return `Step ${report.at} (${report.label}) is refused now: ${report.reason}. The game stands before it.`;
  }
  const { place } = report;
  const where = place.path === '' ? `the ${place.slice} slice` : `in ${place.slice}, ${place.path}`;
  const what = `${where} was ${shown(place.was)}, now ${shown(place.now)}`;
  const also = place.also.length > 0 ? `; ${listed(place.also)} changed too` : '';
  const head = report.at === 0 ? 'The start differs' : `Step ${report.at} (${report.label}) plays out differently`;
  return `${head}: ${what}${also}.`;
}

/** A value in a line of words: JSON for an object or a list, else as it is. */
export const valueText = (value: unknown): string =>
  typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);

/** An effect in words: its name, then its fields as key=value. */
export function effectWords(effect: Effect): string {
  const { effect: name, ...fields } = effect;
  return [name, ...Object.entries(fields).map(([key, value]) => `${key}=${valueText(value)}`)].join(' ');
}

/** A quest line's truth, where it has one. */
export const holdsWords = (holds: boolean | null | undefined): string =>
  holds === true ? 'holds' : holds === false ? 'doesn’t hold' : holds === null ? 'can’t tell' : '';

/** A named state's slot: its name in kebab-case, as a save slot is named. Undefined for a name with no letters or digits. */
export function slotOf(name: string): string | undefined {
  const slot = name
    .toLowerCase()
    // Accents come apart from their letters and go: "Égal" is "egal".
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return slot === '' ? undefined : slot;
}
