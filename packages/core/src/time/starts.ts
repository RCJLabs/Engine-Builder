/**
 * The start-of events (docs/specs/time.md, M3.5, D43): which ticks start a day, and what else the
 * day starts with it, so content can run a day's pass (Landnam's passDay) and react to dates
 * (Ludus's festivals, Dirtbag's bills) without a script.
 */
import type { Domain } from '../logic/types.ts';
import type { EventInfo } from '../sim/events.ts';
import { type Calendar, dateAt } from './calendar.ts';

/** Days one advance may start before a wait that long is taken for a typo. */
export const MAX_DAYS = 100_000;

/** The first tick after `tick` that starts a day. */
export function nextDayStart(calendar: Calendar, tick: number): number {
  const ofDay = (calendar.startTick + tick) % calendar.ticksPerDay;
  return tick + calendar.ticksPerDay - ofDay;
}

/** What the day at `tick` starts, the largest first: the year, a season, the month, the week, then the day. */
export function startsAt(calendar: Calendar, tick: number): [string, Record<string, unknown>][] {
  const date = dateAt(calendar, tick);
  const { weekdays } = calendar.def;
  const starts: [string, Record<string, unknown>][] = [];
  if (date.dayOfYear === 0) starts.push(['year-started', { year: date.year }]);
  if (calendar.seasons.some((season) => season.from === date.dayOfYear)) {
    starts.push(['season-started', { season: date.season }]);
  }
  if (date.dayOfMonth === 1) starts.push(['month-started', { month: date.month }]);
  if (weekdays && date.day % weekdays.length === 0) starts.push(['week-started', {}]);
  starts.push(['day-started', { day: date.day }]);
  return starts;
}

/** The start-of events this calendar can raise, for rows to react to. */
export function startEvents(calendar: Calendar): Record<string, EventInfo> {
  const { def, daysPerYear, seasons } = calendar;
  const oneOf = (values: readonly string[]): Domain => ({ type: 'enum', values });
  return {
    ...(daysPerYear === undefined
      ? {}
      : { 'year-started': { args: { year: { type: 'int', min: 1 } }, label: 'A year starts' } }),
    ...(seasons.length > 0
      ? { 'season-started': { args: { season: oneOf(seasons.map((s) => s.id)) }, label: 'A season starts' } }
      : {}),
    ...(def.months
      ? { 'month-started': { args: { month: oneOf(def.months.map((m) => m.id)) }, label: 'A month starts' } }
      : {}),
    ...(def.weekdays ? { 'week-started': { args: {}, label: 'A week starts' } } : {}),
    'day-started': { args: { day: { type: 'int', min: 0 } }, label: 'A day starts' },
  };
}
