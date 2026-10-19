/**
 * A module's start (M3.6, docs/specs/sim.md#modules): run once as a new game begins, after every
 * init, with a handler's context, its draws kept and the state left at step 0.
 */
import { describe, expect, it } from 'vitest';
import { createRecordStore } from '../records.ts';
import { createGame, defineModule } from './index.ts';

const sim = { content: createRecordStore({}) };

const log = defineModule<{ lines: string[] }>({
  id: 'log',
  init: () => ({ lines: [] }),
  effects: {
    note(ctx, effect) {
      ctx.write().lines.push(effect.line as string);
      ctx.emit('noted', { line: effect.line as string });
    },
  },
  events: { noted: { args: { line: { type: 'text' } } } },
  actions: { wait: () => {} },
  modes: { day: { actions: ['log/wait'] } },
});

const opener = defineModule<{ heard: number; roll: number }>({
  id: 'opener',
  init: () => ({ heard: 0, roll: 0 }),
  start(ctx) {
    ctx.apply({ effect: 'note', line: 'the game begins' });
    ctx.write().roll = ctx.rng('dice').int(1, 6);
    ctx.attempt(() => ctx.refuse('not-yet'));
  },
  on: {
    'log/noted': (ctx) => {
      ctx.write().heard += 1;
    },
  },
});

describe('a module’s start', () => {
  it('applies effects and raises events once every slice exists, keeping its draws, at step 0', () => {
    const game = createGame({ modules: [log, opener], start: 'day' });
    const state = game.init('seed', sim);
    expect(state.log).toEqual({ lines: ['the game begins'] });
    expect((state.opener as { heard: number }).heard).toBe(1);
    expect(state.kernel.step).toBe(0);
    expect(Object.keys(state.kernel.streams)).toEqual(['opener/dice']);
    // The same seed starts the same way.
    expect(game.init('seed', sim)).toEqual(state);
    expect(game.reduce(state, { type: 'log/wait' }, sim).state.kernel.step).toBe(1);
  });

  it('can’t be refused, and must be a function', () => {
    const stubborn = defineModule<object>({ id: 'stubborn', init: () => ({}), start: (ctx) => ctx.refuse('no') });
    const game = createGame({ modules: [log, stubborn], start: 'day' });
    expect(() => game.init('seed', sim)).toThrow("A module's start was refused: no");
    const bad = defineModule<object>({ id: 'bad', init: () => ({}), start: 'soon' as never });
    expect(() => createGame({ modules: [log, bad], start: 'day' })).toThrow('Module "bad": start must be a function');
  });
});
