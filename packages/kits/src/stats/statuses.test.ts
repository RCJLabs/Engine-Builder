import { createRecordStore, type GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { kitted, RECORDS } from '../../test/barracks.ts';

const { apply, attempt, fact, game, sim, start, step } = kitted;
const has = (state: GameState, actor: string, status: string) => fact(state, 'stats.has', { actor, status });
const aim = (state: GameState, actor = 'ana') => fact(state, 'stats.value', { actor, stat: 'aim' });
const wait = (state: GameState, days = 1) => step(state, { type: 'barracks/wait', days });
const held = (state: GameState) => (state.stats as { actors: Record<string, { statuses?: object }> }).actors;

describe('statuses', () => {
  it('stack to their cap, each stack applying the modifiers once more, and say so', () => {
    const once = attempt(start(), { effect: 'add-status', actor: 'bo', status: 'bleeding' });
    expect(has(once.state, 'bo', 'bleeding')).toBe(1);
    expect(aim(once.state, 'bo')).toBe(44);
    expect(once.beats).toContainEqual({ type: 'stats/status-added', actor: 'bo', status: 'bleeding', stacks: 1 });
    const four = apply(once.state, { effect: 'add-status', actor: 'bo', status: 'bleeding', stacks: 3 });
    expect(has(four, 'bo', 'bleeding')).toBe(3);
    expect(aim(four, 'bo')).toBe(24);
    // Steady has no cap of its own: one stack, however often it is added.
    const steady = apply(start(), { effect: 'add-status', actor: 'bo', status: 'steady', stacks: 2 });
    expect(has(steady, 'bo', 'steady')).toBe(1);
  });

  it('count one stack of each the actor’s record lists, until removed', () => {
    const state = start();
    expect(has(state, 'ana', 'steady')).toBe(1);
    const removed = attempt(state, { effect: 'remove-status', actor: 'ana', status: 'steady' });
    expect(has(removed.state, 'ana', 'steady')).toBe(0);
    expect(aim(removed.state)).toBe(70);
    expect(removed.beats).toContainEqual({ type: 'stats/status-removed', actor: 'ana', status: 'steady', stacks: 0 });
    expect(held(removed.state)).toEqual({ ana: { statuses: { steady: { stacks: 0 } } } });
    // Added back, she is as her record has her, and the slice holds nothing.
    expect(held(apply(removed.state, { effect: 'add-status', actor: 'ana', status: 'steady' }))).toEqual({});
  });

  it('come off a stack at a time, or all at once, and nothing happens to one not there', () => {
    const three = apply(start(), { effect: 'add-status', actor: 'bo', status: 'bleeding', stacks: 3 });
    const two = attempt(three, { effect: 'remove-status', actor: 'bo', status: 'bleeding', stacks: 1 });
    expect(has(two.state, 'bo', 'bleeding')).toBe(2);
    expect(two.beats).toContainEqual({ type: 'stats/status-removed', actor: 'bo', status: 'bleeding', stacks: 2 });
    const none = apply(two.state, { effect: 'remove-status', actor: 'bo', status: 'bleeding' });
    expect(has(none, 'bo', 'bleeding')).toBe(0);
    expect(held(none)).toEqual({});
    const again = attempt(none, { effect: 'remove-status', actor: 'bo', status: 'bleeding' });
    expect(again.beats.some((b) => b.type === 'stats/status-removed')).toBe(false);
  });

  it('that last days run out as the days pass, all their stacks at once', () => {
    let state = apply(start(), { effect: 'add-status', actor: 'bo', status: 'bleeding', stacks: 2 });
    state = wait(state, 2);
    expect(has(state, 'bo', 'bleeding')).toBe(2);
    const ended = game.reduce(state, { type: 'barracks/wait', days: 1 }, sim);
    expect(has(ended.state, 'bo', 'bleeding')).toBe(0);
    expect(ended.beats).toContainEqual({ type: 'stats/status-removed', actor: 'bo', status: 'bleeding', stacks: 0 });
    expect(held(ended.state)).toEqual({});
  });

  it('that last ticks run out by the tick', () => {
    const dazed = apply(start(), { effect: 'add-status', actor: 'ana', status: 'dazed' });
    expect(aim(dazed)).toBe(38);
    expect(has(wait(dazed), 'ana', 'dazed')).toBe(0);
  });

  it('applied again, take the later end, and one with stacks and no end outlasts any time', () => {
    let state = apply(start(), { effect: 'add-status', actor: 'bo', status: 'bleeding' });
    state = wait(state, 2);
    // A day before it ends, applied again: it now ends three days from today.
    state = apply(state, { effect: 'add-status', actor: 'bo', status: 'bleeding' });
    state = wait(state, 2);
    expect(has(state, 'bo', 'bleeding')).toBe(2);
    expect(has(wait(state), 'bo', 'bleeding')).toBe(0);
    // Ana's steady comes from her record: no time, so a timed one on top would never end it.
    const timed = {
      ...RECORDS,
      status: { ...RECORDS.status, steady: { ...RECORDS.status.steady, lasts: { days: 1 } } },
    };
    const content = createRecordStore(timed as never);
    let ana = game.init('barracks', { content });
    ana = game.reduce(
      ana,
      { type: 'barracks/do', effects: [{ effect: 'add-status', actor: 'ana', status: 'steady' }] },
      { content },
    ).state;
    ana = game.reduce(ana, { type: 'barracks/wait', days: 5 }, { content }).state;
    expect(game.fact(ana, 'stats.has', { actor: 'ana', status: 'steady' }, { content })).toBe(1);
  });

  it('are counted by tag', () => {
    const state = apply(
      start(),
      { effect: 'add-status', actor: 'bo', status: 'bleeding', stacks: 2 },
      { effect: 'add-status', actor: 'bo', status: 'dazed' },
      { effect: 'add-status', actor: 'bo', status: 'steady' },
    );
    expect(fact(state, 'stats.tagged', { actor: 'bo', tag: 'injury' })).toBe(3);
    expect(fact(state, 'stats.tagged', { actor: 'ana', tag: 'injury' })).toBe(0);
  });

  it('preview their stacks before and after', () => {
    expect(
      game.preview(
        start(),
        [
          { effect: 'add-status', actor: 'bo', status: 'bleeding', stacks: 5 },
          { effect: 'remove-status', actor: 'ana', status: 'steady' },
        ],
        sim,
      ),
    ).toEqual([
      { effect: 'add-status', actor: 'bo', status: 'bleeding', from: 0, to: 3 },
      { effect: 'remove-status', actor: 'ana', status: 'steady', from: 1, to: 0 },
    ]);
  });
});
