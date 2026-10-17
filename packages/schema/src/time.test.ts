import {
  type CalendarDef,
  createGame,
  createRecordStore,
  defineModule,
  type Effect,
  type GameState,
  timeModule,
} from '@eb/core';
import { describe, expect, it } from 'vitest';
import { cancelTimerEffect, defineRecordType, scheduleEffect, schemaIssues, waitEffect, z } from './index.ts';

const calendar: CalendarDef = { ticksPerDay: 24, units: { hours: 1, weeks: 168 } };
const effect: z.ZodType<Effect> = z.lazy(() =>
  z.discriminatedUnion('effect', [
    waitEffect(calendar),
    scheduleEffect(effect, calendar),
    cancelTimerEffect(),
    z.strictObject({ effect: z.literal('note') }),
  ]),
);
const issues = (value: unknown) => schemaIssues(effect, value).map(({ path, message }) => `${path}: ${message}`);

// The runtime the schemas stand in front of: does the time module take the effect?
const sim = { content: createRecordStore({}) };
const probe = defineModule({
  id: 'probe',
  init: () => ({}),
  actions: { apply: (ctx, action) => ctx.apply(action.effect as Effect) },
  effects: { note() {} },
  modes: { play: { actions: ['*'] } },
});
const game = createGame({ modules: [timeModule({ calendar }), probe], start: 'play' });
const runs = (value: Effect) => {
  try {
    game.reduce(game.init('t', sim) as GameState, { type: 'probe/apply', effect: value }, sim);
    return true;
  } catch {
    return false;
  }
};

describe('time effect schemas', () => {
  it.each([
    { effect: 'wait', hours: 8 },
    { effect: 'wait', days: 1, ticks: 2 },
    { effect: 'schedule', after: { days: 3 }, effects: [{ effect: 'note' }] },
    { effect: 'schedule', after: { hours: 1 }, every: { weeks: 1 }, timer: 'wages', effects: [] },
    { effect: 'schedule', after: { ticks: 1 }, effects: [{ effect: 'schedule', after: { days: 1 }, effects: [] }] },
    { effect: 'cancel-timer', timer: 'wages' },
    { effect: 'schedule', after: { days: 1 }, when: { fact: 'time.pending', args: { timer: 'wages' } }, effects: [] },
  ])('accepts %j, as the time module does', (value) => {
    expect(issues(value)).toEqual([]);
    expect(runs(value)).toBe(true);
  });

  it.each([
    [{ effect: 'wait', months: 1 }, '/months: Unknown field "months"'],
    [{ effect: 'wait', hours: 1.5 }, '/hours: Invalid input: expected int, received number'],
    [{ effect: 'schedule', after: {}, effects: [] }, '/after: A length of at least one tick'],
    [{ effect: 'schedule', after: { days: 0 }, effects: [] }, '/after: A length of at least one tick'],
    [
      { effect: 'schedule', after: { days: 1 }, every: { hours: 0 }, effects: [] },
      '/every: A length of at least one tick',
    ],
    [
      { effect: 'schedule', after: { days: 1 }, timer: 'Debt', effects: [] },
      '/timer: A timer name is lowercase words joined by hyphens',
    ],
  ])('rejects %j, which the time module would throw on', (value, message) => {
    expect(issues(value)).toEqual([message]);
    expect(runs(value as Effect)).toBe(false);
  });

  it('fits in a record type', () => {
    const event = defineRecordType({
      type: 'event',
      title: 'Event',
      description: 'Something that happens.',
      schema: z.strictObject({ effects: z.array(effect) }),
    });
    expect(event.targets).toEqual([]);
  });
});
