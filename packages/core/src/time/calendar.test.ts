import { describe, expect, it } from 'vitest';
import { type CalendarDef, calendarOf, dateAt, ticksOf } from './index.ts';

// A short year so a test can walk every tick of several: three months of ten days.
const def: CalendarDef = {
  ticksPerDay: 24,
  units: { hours: 1, weeks: 168 },
  phases: [
    { id: 'dawn', from: 5 },
    { id: 'day', from: 7 },
    { id: 'dusk', from: 19 },
    { id: 'night', from: 21 },
  ],
  weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  months: [
    { id: 'thaw', days: 10 },
    { id: 'bloom', days: 10 },
    { id: 'frost', days: 10 },
  ],
  seasons: [
    { id: 'spring', from: { month: 'thaw', day: 5 } },
    { id: 'summer', from: 12 },
    { id: 'winter', from: { month: 'frost' } },
  ],
  start: { year: 2, day: 28, tick: 20 },
};
const calendar = calendarOf(def);

describe('dateAt', () => {
  it('starts where the calendar says, at dusk two days before the new year', () => {
    expect(dateAt(calendar, 0)).toEqual({
      tick: 0,
      day: 0,
      ofDay: 20,
      phase: 'dusk',
      weekday: 'mon',
      year: 2,
      dayOfYear: 28,
      month: 'frost',
      dayOfMonth: 9,
      season: 'winter',
    });
  });

  it('counts the morning after a start at dusk as day 1, and runs night past midnight', () => {
    expect(dateAt(calendar, 4)).toMatchObject({
      day: 1,
      ofDay: 0,
      phase: 'night',
      dayOfYear: 29,
      dayOfMonth: 10,
      weekday: 'tue',
    });
  });

  it('runs the last season past the new year into the first', () => {
    expect(dateAt(calendar, 4 + 24)).toMatchObject({
      year: 3,
      dayOfYear: 0,
      month: 'thaw',
      dayOfMonth: 1,
      season: 'winter',
    });
    expect(dateAt(calendar, 4 + 24 * 5)).toMatchObject({ dayOfYear: 4, dayOfMonth: 5, season: 'spring' });
  });

  it('agrees with a clock that counts every tick for four years', () => {
    // An independent walk: bump the hour, and carry into day, weekday, month, year and season.
    let ofDay = 20;
    let day = 0;
    let weekday = 0;
    let year = 2;
    let dayOfYear = 28;
    for (let tick = 0; tick < 24 * 30 * 4; tick++) {
      const month = Math.floor(dayOfYear / 10);
      const season = dayOfYear >= 20 || dayOfYear < 4 ? 'winter' : dayOfYear >= 12 ? 'summer' : 'spring';
      const phase = ofDay >= 21 || ofDay < 5 ? 'night' : ofDay >= 19 ? 'dusk' : ofDay >= 7 ? 'day' : 'dawn';
      expect(dateAt(calendar, tick)).toEqual({
        tick,
        day,
        ofDay,
        phase,
        weekday: def.weekdays?.[weekday],
        year,
        dayOfYear,
        month: def.months?.[month]?.id,
        dayOfMonth: (dayOfYear % 10) + 1,
        season,
      });
      if (++ofDay < 24) continue;
      ofDay = 0;
      day++;
      weekday = (weekday + 1) % 7;
      if (++dayOfYear < 30) continue;
      dayOfYear = 0;
      year++;
    }
  });

  it('gives only tick, day and the tick of the day for a bare calendar', () => {
    expect(dateAt(calendarOf({ ticksPerDay: 1 }), 41)).toEqual({ tick: 41, day: 41, ofDay: 0 });
  });
});

describe('ticksOf', () => {
  it('adds up units, ticks and days always among them', () => {
    expect(ticksOf(calendar, { days: 2, hours: 3 })).toBe(51);
    expect(ticksOf(calendar, { weeks: 1, ticks: 1 })).toBe(169);
    expect(ticksOf(calendar, {})).toBe(0);
  });

  it.each([
    [{ months: 1 }, 'Unknown unit of time "months": the calendar has ticks, days, hours, weeks'],
    [{ days: -1 }, 'days must be a whole number, at least 0'],
    [{ hours: 1.5 }, 'hours must be a whole number, at least 0'],
    [{ weeks: 2 ** 50 }, 'That duration is too long to count in ticks'],
  ])('throws for %j', (duration, message) => {
    expect(() => ticksOf(calendar, duration)).toThrow(message);
  });
});

describe('calendarOf', () => {
  it.each([
    ['no ticks in a day', { ticksPerDay: 0 }, 'ticksPerDay must be a whole number, at least 1'],
    ['a unit named days', { ticksPerDay: 24, units: { days: 24 } }, '"days" is already a unit'],
    ['a bad unit name', { ticksPerDay: 24, units: { Hours: 1 } }, '"Hours" is not a valid unit name'],
    [
      'phases out of order',
      {
        ticksPerDay: 24,
        phases: [
          { id: 'b', from: 9 },
          { id: 'a', from: 3 },
        ],
      },
      'phases must be in order of their starts',
    ],
    ['a phase past the day', { ticksPerDay: 24, phases: [{ id: 'a', from: 24 }] }, 'phases: a must start from 0 to 23'],
    ['a name twice', { ticksPerDay: 1, weekdays: ['mon', 'mon'] }, 'weekdays name one twice'],
    ['no weekdays', { ticksPerDay: 1, weekdays: [] }, 'weekdays must not be empty'],
    [
      'months and daysPerYear',
      { ticksPerDay: 1, months: [{ id: 'a', days: 3 }], daysPerYear: 3 },
      'give months or daysPerYear, not both',
    ],
    [
      'seasons without a year',
      { ticksPerDay: 1, seasons: [{ id: 'a', from: 0 }] },
      'seasons need months or daysPerYear',
    ],
    [
      'a season in no month',
      { ticksPerDay: 1, months: [{ id: 'a', days: 3 }], seasons: [{ id: 's', from: { month: 'b' } }] },
      'no month "b" for a season to start in',
    ],
    [
      'a season past its month',
      { ticksPerDay: 1, months: [{ id: 'a', days: 3 }], seasons: [{ id: 's', from: { month: 'a', day: 4 } }] },
      'a has no day 4',
    ],
    ['a start past the day', { ticksPerDay: 24, start: { tick: 24 } }, 'start.tick must be from 0 to 23'],
    ['a later year without one', { ticksPerDay: 1, start: { year: 2 } }, 'start.year needs months or daysPerYear'],
    [
      'a start past the year',
      { ticksPerDay: 1, daysPerYear: 3, start: { day: 3 } },
      'start.day must be a day of the year, from 0',
    ],
  ] as [string, CalendarDef, string][])('throws for %s', (_name, bad, message) => {
    expect(() => calendarOf(bad)).toThrow(message);
  });
});
