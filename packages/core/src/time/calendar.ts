/**
 * Calendars: how a tick count reads as a day, a part of the day, a weekday, a month, a season
 * and a year (docs/specs/time.md). Whole numbers only, with no Date and no time zones: a game's
 * calendar is its own, the same on every device.
 */
import { NAME_PATTERN } from '../logic/values.ts';

export interface CalendarDef {
  /** Ticks in a day: 24 when a tick is an hour, 1 when a tick is a day. */
  readonly ticksPerDay: number;
  /** More named lengths of time, in ticks, for content to use: `{ "hours": 1, "weeks": 168 }`. `ticks` and `days` are always there. */
  readonly units?: Readonly<Record<string, number>>;
  /** Parts of the day by the tick they start at, in order: `[{ "id": "day", "from": 6 }, { "id": "night", "from": 20 }]`. The last runs past midnight into the first. */
  readonly phases?: readonly { readonly id: string; readonly from: number }[];
  /** The days of the week, in order: the game starts on the first. */
  readonly weekdays?: readonly string[];
  /** The months, in order, with their lengths in days. Their total is the year. */
  readonly months?: readonly { readonly id: string; readonly days: number }[];
  /** The length of a year in days, for a calendar without months. */
  readonly daysPerYear?: number;
  /** Seasons by the day of the year they start (0 is the first day), or by a month and its day (1 is the first). The last runs past the year's end into the first. */
  readonly seasons?: readonly {
    readonly id: string;
    readonly from: number | { readonly month: string; readonly day?: number };
  }[];
  /** Where the game starts: the year (from 1), the day of that year (from 0) and the tick of that day. */
  readonly start?: { readonly year?: number; readonly day?: number; readonly tick?: number };
}

/** A checked calendar, with everything worked out once. */
export interface Calendar {
  readonly def: CalendarDef;
  readonly ticksPerDay: number;
  /** Every unit's length in ticks, `ticks` and `days` included. */
  readonly units: Readonly<Record<string, number>>;
  readonly daysPerYear: number | undefined;
  /** The ticks from year 1, day 0, tick 0 to the game's start. */
  readonly startTick: number;
  /** Seasons with their first day of the year, in order. */
  readonly seasons: readonly { readonly id: string; readonly from: number }[];
}

/** What a tick reads as. Fields the calendar doesn't define are left out. */
export interface CalendarDate {
  /** Ticks since the game started. */
  readonly tick: number;
  /** Days since the day the game started on: the morning after a start at dusk is day 1. */
  readonly day: number;
  /** The tick of the day, from 0. */
  readonly ofDay: number;
  readonly phase?: string;
  readonly weekday?: string;
  readonly year?: number;
  /** From 0. */
  readonly dayOfYear?: number;
  readonly month?: string;
  /** From 1. */
  readonly dayOfMonth?: number;
  readonly season?: string;
}

/** Checks a calendar and works out its parts. Throws on a programmer error. */
export function calendarOf(def: CalendarDef): Calendar {
  const fail = (problem: string): never => {
    throw new Error(`Calendar: ${problem}`);
  };
  const positive = (n: unknown, what: string) => {
    if (!Number.isSafeInteger(n) || (n as number) < 1) fail(`${what} must be a whole number, at least 1`);
    return n as number;
  };
  const ticksPerDay = positive(def.ticksPerDay, 'ticksPerDay');
  const units: Record<string, number> = { ticks: 1, days: ticksPerDay };
  for (const [name, ticks] of Object.entries(def.units ?? {})) {
    if (!NAME_PATTERN.test(name)) fail(`"${name}" is not a valid unit name`);
    if (name in units) fail(`"${name}" is already a unit`);
    units[name] = positive(ticks, `units.${name}`);
  }
  if (def.phases) checkStarts(def.phases, ticksPerDay, 'phases', fail);
  if (def.weekdays) names(def.weekdays, 'weekdays', fail);
  if (def.months && def.daysPerYear !== undefined) fail('give months or daysPerYear, not both');
  if (def.months)
    names(
      def.months.map((m) => m.id),
      'months',
      fail,
    );
  for (const month of def.months ?? []) positive(month.days, `the days of ${month.id}`);
  const daysPerYear = def.months ? def.months.reduce((sum, m) => sum + m.days, 0) : def.daysPerYear;
  if (def.daysPerYear !== undefined) positive(def.daysPerYear, 'daysPerYear');
  const seasons = (def.seasons ?? []).map((season) => ({ id: season.id, from: seasonStart(def, season.from, fail) }));
  if (seasons.length > 0) {
    if (daysPerYear === undefined) fail('seasons need months or daysPerYear');
    checkStarts(seasons, daysPerYear as number, 'seasons', fail);
  }
  const startTick = startOf(def, ticksPerDay, daysPerYear, fail);
  return Object.freeze({ def, ticksPerDay, units: Object.freeze(units), daysPerYear, startTick, seasons });
}

/** What `tick` (ticks since the start) reads as. */
export function dateAt(calendar: Calendar, tick: number): CalendarDate {
  const { def, ticksPerDay, daysPerYear, startTick } = calendar;
  const absolute = startTick + tick;
  const absoluteDay = Math.floor(absolute / ticksPerDay);
  const ofDay = absolute - absoluteDay * ticksPerDay;
  const day = absoluteDay - Math.floor(startTick / ticksPerDay);
  const date: Record<string, unknown> = { tick, day, ofDay };
  if (def.phases) date.phase = lastStarted(def.phases, ofDay);
  if (def.weekdays) date.weekday = def.weekdays[day % def.weekdays.length];
  if (daysPerYear !== undefined) {
    const dayOfYear = absoluteDay % daysPerYear;
    date.year = 1 + Math.floor(absoluteDay / daysPerYear);
    date.dayOfYear = dayOfYear;
    if (def.months) Object.assign(date, monthOf(def.months, dayOfYear));
    if (calendar.seasons.length > 0) date.season = lastStarted(calendar.seasons, dayOfYear);
  }
  return date as unknown as CalendarDate;
}

/** A duration such as `{ "days": 2, "hours": 6 }` in ticks. Throws on an unknown unit or a count that isn't a whole number. */
export function ticksOf(calendar: Calendar, duration: Readonly<Record<string, unknown>>): number {
  let ticks = 0;
  for (const [unit, count] of Object.entries(duration)) {
    const size = calendar.units[unit];
    if (size === undefined)
      throw new Error(`Unknown unit of time "${unit}": the calendar has ${Object.keys(calendar.units).join(', ')}`);
    if (!Number.isSafeInteger(count) || (count as number) < 0)
      throw new Error(`${unit} must be a whole number, at least 0`);
    ticks += (count as number) * size;
  }
  if (!Number.isSafeInteger(ticks)) throw new Error('That duration is too long to count in ticks');
  return ticks;
}

// The item whose start is the last one at or before `at`; before the first start, the last item,
// which runs on past the end (night past midnight, winter past the new year).
function lastStarted(items: readonly { readonly id: string; readonly from: number }[], at: number): string {
  let found = items[items.length - 1] as { id: string };
  for (const item of items) if (item.from <= at) found = item;
  return found.id;
}

function monthOf(months: readonly { readonly id: string; readonly days: number }[], dayOfYear: number) {
  let first = 0;
  for (const month of months) {
    if (dayOfYear < first + month.days) return { month: month.id, dayOfMonth: dayOfYear - first + 1 };
    first += month.days;
  }
  throw new Error('Unreachable: a day of the year past its months');
}

function seasonStart(
  def: CalendarDef,
  from: number | { month: string; day?: number },
  fail: (p: string) => never,
): number {
  if (typeof from === 'number') return from;
  let first = 0;
  for (const month of def.months ?? []) {
    if (month.id === from.month) {
      const day = from.day ?? 1;
      if (!Number.isSafeInteger(day) || day < 1 || day > month.days) fail(`${month.id} has no day ${day}`);
      return first + day - 1;
    }
    first += month.days;
  }
  return fail(`no month "${from.month}" for a season to start in`);
}

function checkStarts(
  items: readonly { id: string; from: number }[],
  size: number,
  what: string,
  fail: (p: string) => never,
) {
  names(
    items.map((item) => item.id),
    what,
    fail,
  );
  items.forEach((item, i) => {
    if (!Number.isSafeInteger(item.from) || item.from < 0 || item.from >= size)
      fail(`${what}: ${item.id} must start from 0 to ${size - 1}`);
    if (i > 0 && item.from <= (items[i - 1] as { from: number }).from) fail(`${what} must be in order of their starts`);
  });
}

function names(list: readonly string[], what: string, fail: (p: string) => never) {
  if (list.length === 0) fail(`${what} must not be empty`);
  for (const id of list) if (!NAME_PATTERN.test(id)) fail(`${what}: "${id}" is not a valid name`);
  if (new Set(list).size !== list.length) fail(`${what} name one twice`);
}

function startOf(
  def: CalendarDef,
  ticksPerDay: number,
  daysPerYear: number | undefined,
  fail: (p: string) => never,
): number {
  const { year = 1, day = 0, tick = 0 } = def.start ?? {};
  if (!Number.isSafeInteger(year) || year < 1) fail('start.year must be a whole number, at least 1');
  if (year > 1 && daysPerYear === undefined) fail('start.year needs months or daysPerYear');
  if (!Number.isSafeInteger(day) || day < 0 || (daysPerYear !== undefined && day >= daysPerYear))
    fail('start.day must be a day of the year, from 0');
  if (!Number.isSafeInteger(tick) || tick < 0 || tick >= ticksPerDay)
    fail(`start.tick must be from 0 to ${ticksPerDay - 1}`);
  return ((year - 1) * (daysPerYear ?? 0) + day) * ticksPerDay + tick;
}
