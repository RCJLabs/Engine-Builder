/**
 * Reaching stages and doing objectives (docs/specs/quests.md#checking): a stage logs and applies
 * its effects; count and condition objectives are done once; Leads to comes before Then; a stage
 * whose objectives all lead somewhere moves only by one of them.
 */
import type { GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { dockGame, dockWith, flagOn, set, withQuest } from '../../test/dock.ts';
import type { QuestsSlice } from './types.ts';

const { start, apply, run, scrap, fact } = dockGame;
const quests = (state: GameState) => (state.quests as QuestsSlice).quests;
const types = (beats: readonly { type: string }[]) => beats.map((b) => b.type).filter((t) => t.startsWith('quests/'));
const hunting = () => apply(start(), set('posted'));

describe('reaching a stage', () => {
  it('logs it, empties its progress, raises staged and applies its effects', () => {
    const paid = run(start(), set('paid'));
    expect(types(paid.beats)).toEqual(['quests/objective-done', 'quests/staged', 'quests/done']);
    expect(paid.beats.find((b) => b.type === 'quests/staged')).toEqual({
      type: 'quests/staged',
      quest: 'debt',
      stage: 'square',
    });
    expect(quests(paid.state).debt).toEqual({
      state: 'done',
      stage: 'square',
      log: ['owed', 'square'],
      done: [],
      counts: {},
      days: 0,
    });
    expect(fact(paid.state, 'flag.number', { flag: 'rep' })).toBe(1);
  });

  it('keeps each stage once in the log, last reached last', () => {
    const records = withQuest('patrol', {
      name: 'Patrol',
      'at-start': true,
      stages: [
        { id: 'north', objectives: [{ id: 'n', text: 'North', 'done-when': flagOn('ready'), next: 'south' }] },
        { id: 'south', objectives: [{ id: 's', text: 'South', 'done-when': flagOn('loop'), next: 'north' }] },
      ],
    });
    const dock = dockWith(records);
    const south = dock.apply(dock.start(), set('ready'));
    expect(quests(south).patrol?.log).toEqual(['north', 'south']);
    const back = dock.apply(south, { effect: 'set-flag', flag: 'ready', to: false }, set('loop'));
    expect(quests(back).patrol).toMatchObject({ stage: 'north', log: ['south', 'north'] });
  });
});

describe('a count objective', () => {
  it('counts the events with its argument values, and is done at its target', () => {
    let state = hunting();
    state = scrap(state, 'crate').state;
    expect(fact(state, 'quests.count', { quest: 'bounty', objective: 'scrap' })).toBe(0);
    state = scrap(state, 'drone').state;
    state = scrap(state, 'drone').state;
    expect(fact(state, 'quests.count', { quest: 'bounty', objective: 'scrap' })).toBe(2);
    const third = scrap(state, 'drone');
    expect(types(third.beats)).toEqual(['quests/objective-done']);
    expect(third.beats.at(-1)).toEqual({
      type: 'quests/objective-done',
      quest: 'bounty',
      stage: 'hunt',
      objective: 'scrap',
    });
    expect(quests(third.state).bounty).toMatchObject({ done: ['scrap'], counts: { scrap: 3 } });
  });

  it('stops counting once done, and starts again from nothing at a new stage', () => {
    let state = hunting();
    for (let i = 0; i < 4; i++) state = scrap(state, 'drone').state;
    expect(quests(state).bounty?.counts).toEqual({ scrap: 3 });

    const courier = apply(start(), { effect: 'start-quest', quest: 'courier' });
    const grabbed = scrap(courier, 'crate').state;
    expect(quests(grabbed).courier).toMatchObject({ stage: 'deliver', counts: {}, done: [] });
  });
});

describe('a condition objective', () => {
  it('is done once its condition holds, and stays done when it stops holding', () => {
    const reported = apply(hunting(), set('met-chief'));
    expect(quests(reported).bounty?.done).toEqual(['report']);
    const unsaid = apply(reported, { effect: 'set-flag', flag: 'met-chief', to: false });
    expect(quests(unsaid).bounty?.done).toEqual(['report']);
    expect(types(run(unsaid, set('met-chief')).beats)).toEqual([]);
  });

  it('is done at once when it holds as its stage is reached', () => {
    const state = apply(start(), set('met-chief'), { effect: 'set-stage', quest: 'courier', stage: 'deliver' });
    expect(quests(state).courier).toMatchObject({ state: 'done', stage: 'deliver' });
  });
});

describe('where a stage goes', () => {
  it('Then, once every objective without a Leads to is done; done when it has no Then', () => {
    let state = apply(hunting(), set('met-chief'));
    for (let i = 0; i < 2; i++) state = scrap(state, 'drone').state;
    expect(quests(state).bounty?.stage).toBe('hunt');
    const last = scrap(state, 'drone');
    expect(types(last.beats)).toEqual([
      'quests/objective-done',
      'quests/staged',
      'quests/done',
      'quests/started',
      'quests/staged',
    ]);
    expect(quests(last.state).bounty).toMatchObject({ state: 'done', stage: 'paid-out', log: ['hunt', 'paid-out'] });
  });

  it('Leads to before Then, when both are done in one check', () => {
    const forked = apply(start(), { effect: 'start-quest', quest: 'fork' }, set('ready'));
    expect(quests(forked).fork).toMatchObject({ state: 'done', stage: 'out', log: ['choose', 'out'] });
  });

  it('by one of its objectives when they all lead somewhere, never by Then', () => {
    const records = withQuest('debt', {
      ...dockGame.sim.content.get('quest', 'debt'),
      stages: [
        {
          id: 'owed',
          objectives: [{ id: 'pay', text: 'Pay', 'done-when': flagOn('paid'), next: 'square' }],
          next: 'hunted',
        },
        { id: 'square' },
        { id: 'hunted', fails: true },
      ],
    });
    const dock = dockWith(records);
    const waiting = dock.apply(dock.start(), set('alarm'));
    expect(quests(waiting).debt).toMatchObject({ state: 'active', stage: 'owed' });
    expect(quests(dock.apply(waiting, set('paid'))).debt).toMatchObject({ state: 'done', stage: 'square' });
  });

  it('on through stages with no objectives in one check', () => {
    const records = withQuest('relay', {
      name: 'Relay',
      stages: [
        { id: 'a', next: 'b' },
        { id: 'b', next: 'c' },
        { id: 'c', next: 'd' },
        { id: 'd', log: 'Relayed.' },
      ],
    });
    const dock = dockWith(records);
    const relayed = dock.run(dock.start(), { effect: 'start-quest', quest: 'relay' });
    expect(quests(relayed.state).relay).toMatchObject({ state: 'done', stage: 'd', log: ['a', 'b', 'c', 'd'] });
    expect(types(relayed.beats)).toEqual([
      'quests/started',
      'quests/staged',
      'quests/staged',
      'quests/staged',
      'quests/staged',
      'quests/done',
    ]);
  });
});
