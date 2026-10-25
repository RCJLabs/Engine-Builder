import { createGame, createRecordStore, defineModule, type Module } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { timeKit } from './module.ts';

const walk = defineModule({ id: 'walk', init: () => ({}), modes: { out: { actions: ['time/*'] } } });
const sim = { content: createRecordStore({}) };
const MINUTES = { ticksPerDay: 1440 };

function played(time: Module, ...elapses: number[]) {
  const game = createGame({ modules: [time, walk], start: 'out' });
  let state = game.init('clock', sim);
  const steps = elapses.map((ms) => {
    const step = game.reduce(state, { type: 'time/elapse', ms }, sim);
    state = step.state;
    return step;
  });
  return { tick: (state.time as { tick: number }).tick, steps };
}

describe('the time kit with a clock (M6.3)', () => {
  it('follows the walk’s real time at its rate: at 20x a tick a minute lasts 3 s', () => {
    // The carry adds elapses up: a second at a time, as the walk sends them.
    expect(played(timeKit(MINUTES, { rate: 20 }), 1000, 1000, 1000).tick).toBe(1);
    expect(played(timeKit(MINUTES, { rate: 20 }), 1000, 1000, 999).tick).toBe(0);
    expect(played(timeKit(MINUTES, { rate: 20 }), 1000, 1000, 1000, 1000, 1000, 1000).tick).toBe(2);
    expect(played(timeKit(MINUTES, { rate: 60 }), 1000).tick).toBe(1);
  });

  it('counts at most 2 s an elapse, so a stage gone wrong can’t jump the clock', () => {
    const { tick, steps } = played(timeKit(MINUTES, { rate: 60 }), 10_000);
    expect(tick).toBe(2);
    expect(steps[0]?.beats).toContainEqual(expect.objectContaining({ type: 'time/capped', ms: 10_000, counted: 2000 }));
  });

  it('has no elapse without a clock, as before M6.3', () => {
    expect(() => played(timeKit(MINUTES), 1000)).toThrow('Unknown action "time/elapse"');
  });

  it('throws for a clock its calendar can’t run, which E080 and readPack keep from a game', () => {
    expect(() => timeKit(MINUTES, { rate: 7 })).toThrow("A clock at 7x can't run this calendar");
  });
});
