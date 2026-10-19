/**
 * How quests end (docs/specs/quests.md#checking): done, or failed by a stage that fails, by
 * fail-when, by days or by fail-quest; success before failure in one check; and content that
 * loops for ever stopped by the kernel rather than holding the game.
 */
import type { GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { dockGame, set } from '../../test/dock.ts';
import type { QuestsSlice } from './types.ts';

const { start, apply, run, rest, fact } = dockGame;
const quests = (state: GameState) => (state.quests as QuestsSlice).quests;
const types = (beats: readonly { type: string }[]) => beats.map((b) => b.type).filter((t) => t.startsWith('quests/'));
const days = (state: GameState, n: number) => {
  let next = state;
  for (let i = 0; i < n; i++) next = rest(next).state;
  return next;
};

describe('a quest fails', () => {
  it('when it reaches a stage that fails, its log the reason', () => {
    const refused = run(start(), set('refused'));
    expect(types(refused.beats)).toEqual(['quests/objective-done', 'quests/staged', 'quests/failed']);
    expect(refused.beats.at(-1)).toEqual({
      type: 'quests/failed',
      quest: 'debt',
      why: 'You refused, and her crew found you.',
    });
    expect(quests(refused.state).debt).toMatchObject({ state: 'failed', stage: 'hunted', log: ['owed', 'hunted'] });
  });

  it('when its stage’s fail-when holds, with the stage’s why', () => {
    const alarmed = apply(start(), set('posted'), set('alarm'));
    expect(quests(alarmed).bounty).toMatchObject({
      state: 'failed',
      stage: 'hunt',
      why: 'The alarm brought the guards.',
    });
  });

  it('when its stage’s days have started, counted from when the stage was reached', () => {
    const two = days(start(), 2);
    expect(quests(two).debt).toMatchObject({ state: 'active', days: 2 });
    const third = rest(two);
    expect(types(third.beats)).toEqual(['quests/failed']);
    expect(quests(third.state).debt).toMatchObject({ state: 'failed', why: 'The broker came to collect.', days: 3 });

    const late = apply(days(start(), 2), { effect: 'start-quest', quest: 'watch' });
    expect(quests(rest(late).state).watch).toMatchObject({ state: 'active', days: 1 });
  });

  it('by fail-quest, with its why or “It was given up.”; nothing to a quest not active', () => {
    const given = run(start(), { effect: 'fail-quest', quest: 'debt' });
    expect(given.beats.at(-1)).toEqual({ type: 'quests/failed', quest: 'debt', why: 'It was given up.' });
    const why = apply(start(), { effect: 'fail-quest', quest: 'debt', why: 'You left the dock.' });
    expect(quests(why).debt?.why).toBe('You left the dock.');

    const waiting = run(start(), { effect: 'fail-quest', quest: 'courier' });
    expect([types(waiting.beats), quests(waiting.state).courier]).toEqual([[], undefined]);
    const paid = apply(start(), set('paid'));
    expect(types(run(paid, { effect: 'fail-quest', quest: 'debt' }).beats)).toEqual([]);
    expect(quests(paid).debt?.state).toBe('done');
  });
});

describe('a quest is done', () => {
  it('rather than failed when its objectives are done in the check its deadline comes due', () => {
    const watching = apply(start(), { effect: 'start-quest', quest: 'watch' });
    const second = rest(rest(watching).state);
    expect(types(second.beats)).toEqual(['quests/objective-done', 'quests/done']);
    expect(quests(second.state).watch).toMatchObject({ state: 'done', days: 2, counts: { nights: 2 } });
  });

  it('and stays so: no event moves it again', () => {
    const paid = apply(start(), set('paid'));
    const later = days(apply(paid, set('refused')), 4);
    expect(quests(later).debt).toEqual(quests(paid).debt);
    expect(fact(later, 'quests.state', { quest: 'debt' })).toBe('done');
  });
});

describe('content that loops', () => {
  it('stops in the kernel’s error, 64 events deep, rather than holding the game', () => {
    expect(() => apply(start(), set('loop'), { effect: 'start-quest', quest: 'loop' })).toThrow(/64 deep/);
  });
});
