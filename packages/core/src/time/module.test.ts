import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRecordStore } from '../records.ts';
import { ActionError, createGame, defineModule, type Effect, type GameState, type Module } from '../sim/index.ts';
import { stateHash } from '../stateHash.ts';
import { type TimeOptions, type TimeSlice, timeModule } from './index.ts';

interface Probe {
  credits: number;
  notes: { n: number; at: number }[];
}

// Applies the effects an action carries, and notes when each `note` runs.
const probe = defineModule<Probe>({
  id: 'probe',
  init: () => ({ credits: 5, notes: [] }),
  actions: {
    apply(ctx, action) {
      for (const effect of action.effects as Effect[]) ctx.apply(effect);
    },
  },
  effects: {
    note(ctx, effect) {
      ctx.write().notes.push({ n: effect.n as number, at: ctx.fact('time.tick') as number });
    },
    // Writes first, then refuses, so an undo has something to undo.
    spend(ctx, effect) {
      const slice = ctx.write();
      slice.credits -= effect.amount as number;
      if (slice.credits < 0) ctx.refuse('broke', { credits: slice.credits });
    },
    dice(ctx) {
      ctx.write().notes.push({ n: ctx.rng('dice').int(1, 6), at: ctx.fact('time.tick') as number });
    },
  },
  modes: { play: { actions: ['*'] } },
});

const options: TimeOptions = {
  calendar: {
    ticksPerDay: 24,
    units: { hours: 1 },
    phases: [
      { id: 'day', from: 6 },
      { id: 'night', from: 20 },
    ],
    daysPerYear: 4,
    seasons: [
      { id: 'wet', from: 0 },
      { id: 'dry', from: 2 },
    ],
  },
  realTime: { msPerTick: 1000, maxElapseMs: 60_000 },
};
const sim = { content: createRecordStore({}) };
const gameWith = (time: Module) => createGame({ modules: [time, probe], start: 'play' });
const game = gameWith(timeModule(options));
const start = game.init('time', sim);

const run = (state: GameState, ...actions: Record<string, unknown>[]) => {
  let current = state;
  const beats = [];
  for (const action of actions) {
    const step = game.reduce(current, action as { type: string }, sim);
    expect(step.accepted).toBe(true);
    beats.push(...step.beats);
    current = step.state;
  }
  return { state: current, beats };
};
const apply = (...effects: Effect[]) => ({ type: 'probe/apply', effects });
const later = (hours: number, effects: Effect[], more: Record<string, unknown> = {}): Effect => ({
  effect: 'schedule',
  after: { hours },
  effects,
  ...more,
});
const note = (n: number): Effect => ({ effect: 'note', n });
const time = (state: GameState) => state.time as TimeSlice;
const notes = (state: GameState) => (state.probe as Probe).notes;

describe('the time module', () => {
  it('moves time only when an action moves it, and reads it through the calendar', () => {
    const { state, beats } = run(start, { type: 'time/advance', hours: 5 });
    expect(time(state).tick).toBe(5);
    expect(beats).toEqual([{ type: 'time/passed', from: 0, to: 5 }]);
    expect(game.fact(state, 'time.phase', undefined, sim)).toBe('night');
    expect(game.fact(run(state, { type: 'time/advance', days: 2 }).state, 'time.season', undefined, sim)).toBe('dry');
  });

  it('fires timers by due tick, then in the order scheduled, with the clock at each one', () => {
    const { state, beats } = run(start, apply(later(3, [note(1)]), later(1, [note(2)]), later(3, [note(3)])), {
      type: 'time/advance',
      hours: 4,
    });
    expect(notes(state)).toEqual([
      { n: 2, at: 1 },
      { n: 1, at: 3 },
      { n: 3, at: 3 },
    ]);
    expect(beats.filter((b) => b.type === 'time/fired').map((b) => b.timer)).toEqual(['#1', '#0', '#2']);
    expect(time(state)).toMatchObject({ tick: 4, timers: [] });
  });

  it('keeps timers that are not due, and says how long they have left', () => {
    const scheduled = run(start, apply(later(3, [note(1)], { timer: 'contract' })), {
      type: 'time/advance',
      hours: 2,
    }).state;
    expect(notes(scheduled)).toEqual([]);
    expect(game.fact(scheduled, 'time.left', { timer: 'contract' }, sim)).toBe(1);
    expect(game.fact(scheduled, 'time.pending', { timer: 'contract' }, sim)).toBe(true);
    const done = run(scheduled, { type: 'time/advance', hours: 1 }).state;
    expect(notes(done)).toEqual([{ n: 1, at: 3 }]);
    expect(game.fact(done, 'time.left', { timer: 'contract' }, sim)).toBeUndefined();
  });

  it('repeats a timer, and lets its own effects cancel it', () => {
    const wages = later(24, [note(1)], { timer: 'wages', every: { days: 1 } });
    const once = later(1, [note(2), { effect: 'cancel-timer', timer: 'once' }], { timer: 'once', every: { hours: 1 } });
    const { state } = run(start, apply(wages, once), { type: 'time/advance', days: 3 });
    expect(notes(state)).toEqual([
      { n: 2, at: 1 },
      { n: 1, at: 24 },
      { n: 1, at: 48 },
      { n: 1, at: 72 },
    ]);
    expect(time(state).timers.map((t) => [t.id, t.due])).toEqual([['wages', 96]]);
  });

  it('skips a firing whose condition no longer holds, and keeps repeating the timer', () => {
    const daily = later(1, [note(1)], { every: { hours: 1 }, when: { fact: 'time.phase', op: '==', value: 'day' } });
    const { state, beats } = run(start, apply(daily), { type: 'time/advance', hours: 7 });
    expect(notes(state)).toEqual([
      { n: 1, at: 6 },
      { n: 1, at: 7 },
    ]);
    expect(beats.filter((b) => b.type === 'time/skipped').map((b) => b.at)).toEqual([1, 2, 3, 4, 5]);
  });

  it('replaces a timer scheduled again under its name, as a cooldown restarts', () => {
    const cooldown = later(5, [], { timer: 'cooldown' });
    const { state } = run(start, apply(cooldown), { type: 'time/advance', hours: 2 }, apply(cooldown));
    expect(time(state).timers.map((t) => [t.id, t.due])).toEqual([['cooldown', 7]]);
  });

  it('drops a consequence that refuses, undoing what it did, and still passes time', () => {
    const debt = later(1, [note(1), { effect: 'spend', amount: 10 }], { timer: 'debt' });
    const { state, beats } = run(start, apply(debt, later(2, [note(2)])), { type: 'time/advance', hours: 3 });
    expect(beats.filter((b) => b.type.startsWith('time/') && b.type !== 'time/scheduled')).toEqual([
      { type: 'time/refused', timer: 'debt', at: 1, reason: 'broke' },
      { type: 'time/fired', timer: '#1', at: 2 },
      { type: 'time/passed', from: 0, to: 3 },
    ]);
    expect(state.probe).toEqual({ credits: 5, notes: [{ n: 2, at: 2 }] });
    expect(time(state).tick).toBe(3);
  });

  it('never moves time back when a timer waits past the end', () => {
    const { state, beats } = run(start, apply(later(1, [{ effect: 'wait', hours: 10 }])), {
      type: 'time/advance',
      hours: 2,
    });
    expect(time(state).tick).toBe(11);
    expect(beats.filter((b) => b.type === 'time/passed')).toEqual([
      { type: 'time/passed', from: 1, to: 11 },
      { type: 'time/passed', from: 0, to: 11 },
    ]);
  });

  it('throws on a timer that fires more than 10,000 times in one advance', () => {
    const state = run(start, apply(later(1, [], { every: { ticks: 1 } }))).state;
    expect(run(state, { type: 'time/advance', ticks: 9_999 }).state.time).toMatchObject({ tick: 9_999 });
    expect(() => game.reduce(state, { type: 'time/advance', ticks: 10_001 }, sim)).toThrow(
      'More than 10000 timers fired',
    );
  });

  it('refuses an advance in units the calendar lacks', () => {
    expect(game.reduce(start, { type: 'time/advance', months: 1 }, sim).beats).toEqual([
      { type: 'rejected', action: 'time/advance', reason: 'bad-duration' },
    ]);
  });
});

describe('wall-clock time', () => {
  it('turns milliseconds into ticks, carrying what falls short of a tick', () => {
    const once = run(start, { type: 'time/elapse', ms: 1500 }).state;
    expect(time(once)).toMatchObject({ tick: 1, carry: 500 });
    expect(time(run(once, { type: 'time/elapse', ms: 600 }).state)).toMatchObject({ tick: 2, carry: 100 });
  });

  it('counts up to the cap and drops the rest', () => {
    const { state, beats } = run(start, { type: 'time/elapse', ms: 90_500 });
    expect(time(state)).toMatchObject({ tick: 60, carry: 0 });
    expect(beats[0]).toEqual({ type: 'time/capped', ms: 90_500, counted: 60_000 });
  });

  it.each([
    [-5, 'clock-went-back'],
    [1.5, 'bad-elapsed'],
    ['1000', 'bad-elapsed'],
  ])('refuses %j ms with %s', (ms, reason) => {
    expect(game.reduce(start, { type: 'time/elapse', ms }, sim).beats[0]).toMatchObject({ type: 'rejected', reason });
  });

  it('gives the same state for a stretch settled at once or in pieces', () => {
    const timer = fc.record({
      hours: fc.integer({ min: 1, max: 40 }),
      every: fc.option(fc.integer({ min: 1, max: 9 }), { nil: undefined }),
      dice: fc.boolean(),
    });
    const pieces = fc.array(fc.integer({ min: 0, max: 7_000 }), { minLength: 1, maxLength: 8 });
    fc.assert(
      fc.property(fc.array(timer, { maxLength: 6 }), pieces, (timers, split) => {
        const schedules = timers.map((t, i) =>
          later(t.hours, [t.dice ? { effect: 'dice' } : note(i)], t.every ? { every: { hours: t.every } } : {}),
        );
        const scheduled = run(start, apply(...schedules)).state;
        const total = split.reduce((sum, ms) => sum + ms, 0);
        const whole = run(scheduled, { type: 'time/elapse', ms: total }).state;
        const parts = run(scheduled, ...split.map((ms) => ({ type: 'time/elapse', ms }))).state;
        // The action count differs by design; everything else must not.
        const same = { ...parts, kernel: { ...parts.kernel, step: whole.kernel.step } };
        expect(stateHash(same)).toBe(stateHash(whole));
      }),
      { numRuns: 300 },
    );
  });

  it('has no elapse action in a game that never follows the wall clock', () => {
    const turns = gameWith(timeModule({ calendar: { ticksPerDay: 1 } }));
    expect(() => turns.reduce(turns.init('turns', sim), { type: 'time/elapse', ms: 1 }, sim)).toThrow(ActionError);
  });
});

describe('previews, facts and options', () => {
  it('previews which timers a wait would fire, and when a timer would come due', () => {
    const state = run(
      start,
      apply(later(1, [], { timer: 'a' }), later(2, [], { timer: 'b', every: { hours: 2 } })),
    ).state;
    expect(game.preview(state, [{ effect: 'wait', hours: 5 }, later(3, [], { every: { days: 1 } })], sim)).toEqual([
      {
        effect: 'wait',
        to: 5,
        fires: [
          { timer: 'a', at: 1, times: 1 },
          { timer: 'b', at: 2, times: 2 },
        ],
      },
      { effect: 'schedule', due: 3, every: 24 },
    ]);
  });

  it('lists only the facts its calendar has, with their domains', () => {
    const catalog = game.catalog();
    expect(Object.keys(catalog).filter((id) => id.startsWith('time.'))).toEqual([
      'time.day',
      'time.day-of-year',
      'time.hour',
      'time.left',
      'time.of-day',
      'time.pending',
      'time.phase',
      'time.season',
      'time.tick',
      'time.year',
    ]);
    expect(catalog['time.phase']?.domain).toEqual({ type: 'enum', values: ['day', 'night'] });
    expect(catalog['time.of-day']?.domain).toEqual({ type: 'int', min: 0, max: 23 });
    // An hour a tick, and no minutes: the hour, and no clock's face.
    expect(catalog['time.hour']?.domain).toEqual({ type: 'int', min: 0, max: 23 });
    expect(catalog['time.clock']).toBeUndefined();
  });

  it('gives the hour and the clock’s face with hours and minutes (M6.3)', () => {
    const minutes = gameWith(
      timeModule({ calendar: { ticksPerDay: 1440, units: { minutes: 1, hours: 60 }, start: { tick: 545 } } }),
    );
    let state = minutes.init('clock', sim);
    expect(minutes.catalog()['time.clock']?.domain).toEqual({ type: 'text' });
    expect(minutes.catalog()['time.hour']?.domain).toEqual({ type: 'int', min: 0, max: 23 });
    expect(minutes.fact(state, 'time.hour', {}, sim)).toBe(9);
    expect(minutes.fact(state, 'time.clock', {}, sim)).toBe('09:05');
    // Past the half hour it is still nine.
    state = minutes.reduce(state, apply({ effect: 'wait', minutes: 30 }), sim).state;
    expect(minutes.fact(state, 'time.hour', {}, sim)).toBe(9);
    expect(minutes.fact(state, 'time.clock', {}, sim)).toBe('09:35');
    state = minutes.reduce(state, apply({ effect: 'wait', hours: 14, minutes: 27 }), sim).state;
    expect(minutes.fact(state, 'time.clock', {}, sim)).toBe('00:02');
  });

  it('starts with the timers the game gives it', () => {
    const withWages = gameWith(
      timeModule({ ...options, timers: [{ timer: 'wages', after: { days: 7 }, effects: [note(1)] }] }),
    );
    expect(time(withWages.init('wages', sim)).timers).toEqual([{ id: 'wages', due: 168, effects: [note(1)], seq: 0 }]);
  });

  it.each([
    ['no milliseconds per tick', { ...options, realTime: { msPerTick: 0, maxElapseMs: 10 } }, 'realTime.msPerTick'],
    ['no cap', { ...options, realTime: { msPerTick: 10, maxElapseMs: 0 } }, 'realTime.maxElapseMs'],
    ['a timer due now', { ...options, timers: [{ after: {}, effects: [] }] }, 'at least one tick later'],
    [
      'a timer with a bad name',
      { ...options, timers: [{ timer: 'Debt', after: { hours: 1 }, effects: [] }] },
      '"Debt" is not a valid timer name',
    ],
    [
      'a timer repeating every 0 ticks',
      { ...options, timers: [{ after: { hours: 1 }, every: { hours: 0 }, effects: [] }] },
      '"every" must be at least one tick',
    ],
  ] as [string, TimeOptions, string][])('throws for %s', (_name, bad, message) => {
    expect(() => gameWith(timeModule(bad)).init('bad', sim)).toThrow(message);
  });
});
