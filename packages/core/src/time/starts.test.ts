import { describe, expect, it } from 'vitest';
import { createRecordStore } from '../records.ts';
import { type Beat, createGame, defineModule, type Effect, type GameState } from '../sim/index.ts';
import { type CalendarDef, timeModule } from './index.ts';
import { MAX_DAYS } from './starts.ts';

interface Heard {
  heard: { day: number; at: number; notes: number }[];
  notes: number;
}

// Notes each day's start with the clock it hears it at, applies the effects an action carries,
// and on the day an action names, waits as a day's own pass might.
const hearer = (waitOn?: { day: number; days: number }) =>
  defineModule<Heard>({
    id: 'hearer',
    init: () => ({ heard: [], notes: 0 }),
    actions: {
      apply(ctx, action) {
        for (const effect of action.effects as Effect[]) ctx.apply(effect);
      },
    },
    effects: {
      note(ctx) {
        ctx.write().notes += 1;
      },
    },
    on: {
      '*': (ctx, event) => {
        if (event.type !== 'time/day-started') return;
        const day = event.day as number;
        const at = ctx.fact('time.tick') as number;
        ctx.write().heard.push({ day, at, notes: ctx.read().notes });
        if (waitOn?.day === day) ctx.apply({ effect: 'wait', days: waitOn.days });
      },
    },
    modes: { play: { actions: ['*'] } },
  });

const sim = { content: createRecordStore({}) };
const gameOf = (calendar: CalendarDef, waitOn?: { day: number; days: number }) => {
  const game = createGame({ modules: [timeModule({ calendar }), hearer(waitOn)], start: 'play' });
  return { game, start: game.init('starts', sim) };
};
const advance = (state: GameState, game: ReturnType<typeof gameOf>['game'], duration: Record<string, number>) => {
  const step = game.reduce(state, { type: 'time/advance', ...duration }, sim);
  expect(step.accepted).toBe(true);
  return step;
};
const starts = (beats: readonly Beat[]) =>
  beats.filter((b) => b.type.endsWith('-started')).map(({ type, ...args }) => [type.slice(5), args]);
const heard = (state: GameState) => (state.hearer as Heard).heard;

// Three-day weeks, a six-day year of two months, and two seasons.
const SMALL: CalendarDef = {
  ticksPerDay: 1,
  weekdays: ['ash', 'birch', 'cedar'],
  months: [
    { id: 'thaw', days: 2 },
    { id: 'green', days: 4 },
  ],
  seasons: [
    { id: 'cold', from: 0 },
    { id: 'warm', from: 3 },
  ],
};

describe('the start of each day', () => {
  it('starts a year, a season, a month and a week when they start, the largest first, then the day', () => {
    const { game, start } = gameOf(SMALL);
    expect(starts(advance(start, game, { days: 6 }).beats)).toEqual([
      ['day-started', { day: 1 }],
      ['month-started', { month: 'green' }],
      ['day-started', { day: 2 }],
      ['season-started', { season: 'warm' }],
      ['week-started', {}],
      ['day-started', { day: 3 }],
      ['day-started', { day: 4 }],
      ['day-started', { day: 5 }],
      ['year-started', { year: 2 }],
      ['season-started', { season: 'cold' }],
      ['month-started', { month: 'thaw' }],
      ['week-started', {}],
      ['day-started', { day: 6 }],
    ]);
  });

  it('is heard at its tick, before the timers due there, and the day the game starts in raises nothing', () => {
    // Four ticks a day, starting at the day's last tick: the first day starts one tick in.
    const { game, start } = gameOf({ ticksPerDay: 4, start: { tick: 3 } });
    const timed = game.reduce(
      start,
      {
        type: 'hearer/apply',
        effects: [{ effect: 'schedule', after: { ticks: 1 }, effects: [{ effect: 'note' }] }],
      },
      sim,
    ).state;
    const { state, beats } = advance(timed, game, { ticks: 9 });
    expect(heard(state)).toEqual([
      { day: 1, at: 1, notes: 0 },
      { day: 2, at: 5, notes: 1 },
      { day: 3, at: 9, notes: 1 },
    ]);
    expect(beats.map((b) => b.type).filter((t) => t !== 'time/scheduled')).toEqual([
      'time/day-started',
      'time/fired',
      'time/day-started',
      'time/day-started',
      'time/passed',
    ]);
    expect(
      starts(advance(gameOf({ ticksPerDay: 4 }).start, gameOf({ ticksPerDay: 4 }).game, { ticks: 3 }).beats),
    ).toEqual([]);
  });

  it('goes on from where a wait inside a day’s start left the clock, starting no day twice', () => {
    const { game, start } = gameOf({ ticksPerDay: 1 }, { day: 1, days: 2 });
    const { state } = advance(start, game, { days: 5 });
    expect(heard(state).map((h) => [h.day, h.at])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
    ]);
  });

  it('declares only the starts its calendar has', () => {
    const declared = (calendar: CalendarDef) =>
      Object.keys(gameOf(calendar).game.events())
        .filter((id) => id.endsWith('-started'))
        .sort();
    expect(declared({ ticksPerDay: 24 })).toEqual(['time/day-started']);
    expect(declared(SMALL)).toEqual([
      'time/day-started',
      'time/month-started',
      'time/season-started',
      'time/week-started',
      'time/year-started',
    ]);
    expect(gameOf(SMALL).game.events()['time/season-started']).toEqual({
      args: { season: { type: 'enum', values: ['cold', 'warm'] } },
      label: 'A season starts',
    });
  });

  it('throws past 100,000 days in one advance', () => {
    const { game, start } = gameOf({ ticksPerDay: 1 });
    expect(advance(start, game, { days: MAX_DAYS }).state.time).toMatchObject({ tick: MAX_DAYS });
    expect(() => game.reduce(start, { type: 'time/advance', days: MAX_DAYS + 1 }, sim)).toThrow(
      `More than ${MAX_DAYS} days started in one advance`,
    );
  });
});
