/**
 * project.json's calendar as a form sees it (M3.5, D43): its fields as a type file, so the record
 * form's fields draw it, and its problems, which are project.json's under /calendar. The engine's
 * calendarSchema checks it; these are the words beside each box. A season that starts on a month
 * (docs/specs/time.md) is written in project.json by hand: its box shows it as written.
 */
import { MANIFEST_FILE } from '@eb/compiler';
import { MAX_RATE } from '@eb/core';
import type { Diagnostic, TypeFile } from '@eb/schema';

const name = { kind: 'text', label: 'Name' } as const;

export const CALENDAR_FILE: TypeFile = {
  title: 'Calendar',
  fields: {
    ticksPerDay: {
      kind: 'int',
      min: 1,
      optional: true,
      label: 'Ticks a day',
      description: 'How many ticks make a day: 24 makes a tick an hour. Left empty, a tick is a day.',
    },
    units: {
      kind: 'map',
      of: { kind: 'int', min: 1 },
      optional: true,
      label: 'Lengths of time',
      description:
        'More lengths for Wait and timers, in ticks: hours 1 and weeks 168 when a tick is an hour. Ticks and days are always there.',
    },
    phases: {
      kind: 'list',
      of: { kind: 'group', fields: { id: name, from: { kind: 'int', min: 0, label: 'Starts at tick' } } },
      optional: true,
      label: 'Parts of the day',
      description: 'In order, each from the tick of the day it starts at. The last runs past midnight into the first.',
    },
    weekdays: {
      kind: 'list',
      of: { kind: 'text' },
      optional: true,
      label: 'Days of the week',
      description: 'In order: the game starts on the first.',
    },
    months: {
      kind: 'list',
      of: { kind: 'group', fields: { id: name, days: { kind: 'int', min: 1, label: 'Days' } } },
      optional: true,
      label: 'Months',
      description: 'In order, with their days. Together they make the year.',
    },
    daysPerYear: {
      kind: 'int',
      min: 1,
      optional: true,
      label: 'Days a year',
      description: 'For a year without months.',
    },
    seasons: {
      kind: 'list',
      of: {
        kind: 'group',
        fields: { id: name, from: { kind: 'int', min: 0, label: 'Starts on day', description: 'Of the year, from 0' } },
      },
      optional: true,
      label: 'Seasons',
      description: 'In order. The last runs past the year’s end into the first. Needs months or days a year.',
    },
    start: {
      kind: 'group',
      optional: true,
      label: 'Start',
      description: 'Where in the calendar the game starts.',
      fields: {
        year: { kind: 'int', min: 1, optional: true, label: 'Year', description: 'From 1' },
        day: { kind: 'int', min: 0, optional: true, label: 'Day of the year', description: 'From 0' },
        tick: { kind: 'int', min: 0, optional: true, label: 'Tick of the day', description: 'From 0' },
      },
    },
  },
};

const AT = '/calendar';

/** project.json's problems with its calendar, each at its place in the calendar ('' for the whole of it). */
export function calendarProblems(problems: readonly Diagnostic[]): Diagnostic[] {
  return problems
    .filter((d) => d.file === MANIFEST_FILE && (d.path === AT || d.path.startsWith(`${AT}/`)))
    .map((d) => ({ ...d, path: d.path.slice(AT.length) }));
}

/** project.json's clock (M6.3, D75) as a form sees it: its one field, the rate it runs at while a space is walked. */
export const CLOCK_FILE: TypeFile = {
  title: 'Clock',
  fields: {
    rate: {
      kind: 'int',
      min: 0,
      max: MAX_RATE,
      optional: true,
      label: 'Clock rate',
      description:
        'Game seconds a real second while a space is walked: 20 makes a day 72 real minutes, 600 an hour 6 real seconds. 0 stops it. Left empty, 20.',
    },
  },
};

/** project.json's problems with its clock, at its place in the clock: W149, of a clock left out, at its rate. */
export function clockProblems(problems: readonly Diagnostic[]): Diagnostic[] {
  return problems.flatMap((d) => {
    if (d.file !== MANIFEST_FILE) return [];
    if (d.code === 'W149') return [{ ...d, path: '/rate' }];
    return d.path === '/clock' || d.path.startsWith('/clock/') ? [{ ...d, path: d.path.slice('/clock'.length) }] : [];
  });
}
