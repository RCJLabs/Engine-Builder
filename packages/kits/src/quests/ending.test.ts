/**
 * How quests end (docs/specs/quests.md#checking): done, or failed by a stage that fails, by
 * fail-when, by days or by fail-quest; success before failure in one check; and content that
 * loops for ever stopped by the kernel rather than holding the game.
 */
import { defineModule, type GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { dockGame, dockWith, flagOn, set, withQuest } from '../../test/dock.ts';
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

describe('a stage’s effects', () => {
  it('that refuse are undone with a beat saying why, and the action that moved the quest stands', () => {
    const broke = defineModule<Record<string, never>>({
      id: 'broke',
      init: () => ({}),
      effects: { 'pay-up': { run: (ctx) => ctx.refuse('not-enough', { need: 30 }) } },
    });
    const records = withQuest('fine', {
      name: 'The fine',
      'at-start': true,
      stages: [
        { id: 'due', objectives: [{ id: 'caught', text: 'Get caught', 'done-when': flagOn('alarm') }], next: 'paid' },
        {
          id: 'paid',
          log: 'You paid the fine.',
          effects: [{ effect: 'add-to-flag', flag: 'rep', by: 1 }, { effect: 'pay-up' }],
        },
      ],
    });
    const dock = dockWith(records, [broke]);
    const caught = dock.run(dock.start(), set('alarm'));
    expect(caught.accepted).toBe(true);
    expect(caught.beats.filter((b) => b.type === 'quests/refused')).toEqual([
      { type: 'quests/refused', quest: 'fine', stage: 'paid', reason: 'not-enough' },
    ]);
    expect(quests(caught.state).fine).toMatchObject({ state: 'done', stage: 'paid' });
    expect(dock.fact(caught.state, 'flag.number', { flag: 'rep' })).toBe(0);
    expect(dock.fact(caught.state, 'flag.on', { flag: 'alarm' })).toBe(true);
  });
});

describe('a stage that fails', () => {
  it('fails the quest even when its effects raise events the kit hears first', () => {
    const records = withQuest('heist', {
      name: 'The heist',
      'at-start': true,
      stages: [
        { id: 'plan', objectives: [{ id: 'go', text: 'Go', 'done-when': flagOn('ready'), next: 'caught' }] },
        {
          id: 'caught',
          log: 'The guards were waiting.',
          effects: [set('alarm'), { effect: 'wait', days: 1 }],
          fails: true,
        },
      ],
    });
    const dock = dockWith(records);
    const caught = dock.apply(dock.start(), set('ready'));
    expect(quests(caught).heist).toMatchObject({ state: 'failed', stage: 'caught', why: 'The guards were waiting.' });
  });
});
