/**
 * How quests start (docs/specs/quests.md#starting): with the game, once a condition holds, by
 * start-quest and by set-stage; and a quest that has started never starts again.
 */
import type { GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { dockGame, dockWith, flagOn, RECORDS, set, withQuest } from '../../test/dock.ts';
import type { QuestsSlice } from './types.ts';

const { start, apply, run, fact } = dockGame;
const quests = (state: GameState) => (state.quests as QuestsSlice).quests;
const types = (beats: readonly { type: string }[]) => beats.map((b) => b.type).filter((t) => t.startsWith('quests/'));

describe('a quest starts', () => {
  it('with the game when it is at-start, at its first stage, logged', () => {
    expect(quests(start())).toEqual({
      debt: { state: 'active', stage: 'owed', log: ['owed'], done: [], counts: {}, days: 0 },
    });
  });

  it('once its starts-when holds, heard as the event that makes it hold is', () => {
    const state = start();
    expect(fact(state, 'quests.state', { quest: 'bounty' })).toBe('waiting');
    const posted = run(state, set('posted'));
    expect(types(posted.beats)).toEqual(['quests/started', 'quests/staged']);
    expect(posted.beats.find((b) => b.type === 'quests/started')).toEqual({
      type: 'quests/started',
      quest: 'bounty',
      stage: 'hunt',
    });
    expect(quests(posted.state).bounty).toMatchObject({ state: 'active', stage: 'hunt', log: ['hunt'] });
  });

  it('with the game when its starts-when holds already', () => {
    const records = withQuest('early', {
      name: 'Early',
      'starts-when': { not: flagOn('posted') },
      stages: [{ id: 'one', objectives: [{ id: 'wait', text: 'Wait', 'done-when': flagOn('posted') }] }],
    });
    expect(quests(dockWith(records).start()).early).toMatchObject({ state: 'active', stage: 'one' });
  });

  it('once another quest it waits on is done: the kit hears its own events', () => {
    const hunted = apply(start(), set('posted'), set('met-chief'));
    expect(fact(hunted, 'quests.state', { quest: 'trusted' })).toBe('waiting');
    let state = hunted;
    for (let i = 0; i < 3; i++) state = dockGame.scrap(state, 'drone').state;
    expect(quests(state).bounty?.state).toBe('done');
    expect(quests(state).trusted).toMatchObject({ state: 'active', stage: 'earn' });
  });

  it('by start-quest, at its first stage; by set-stage, at that stage', () => {
    const started = run(start(), { effect: 'start-quest', quest: 'courier' });
    expect(types(started.beats)).toEqual(['quests/started', 'quests/staged']);
    expect(quests(started.state).courier).toMatchObject({ state: 'active', stage: 'pickup', log: ['pickup'] });

    const staged = run(start(), { effect: 'set-stage', quest: 'courier', stage: 'deliver' });
    expect(staged.beats.find((b) => b.type === 'quests/started')).toMatchObject({ quest: 'courier', stage: 'deliver' });
    expect(quests(staged.state).courier).toMatchObject({ state: 'active', stage: 'deliver', log: ['deliver'] });
  });

  it('once: start-quest leaves a quest that is active, done or failed as it is', () => {
    const active = apply(start(), { effect: 'start-quest', quest: 'courier' });
    const again = run(active, { effect: 'start-quest', quest: 'courier' });
    expect(types(again.beats)).toEqual([]);
    expect(again.state.quests).toBe(active.quests);

    const done = apply(start(), set('ready'), { effect: 'start-quest', quest: 'fork' });
    expect(quests(done).fork?.state).toBe('done');
    expect(types(run(done, { effect: 'start-quest', quest: 'fork' }).beats)).toEqual([]);
    expect(types(run(done, { effect: 'set-stage', quest: 'fork', stage: 'choose' }).beats)).toEqual([]);

    const failed = apply(start(), set('refused'));
    expect(quests(failed).debt?.state).toBe('failed');
    expect(run(failed, { effect: 'start-quest', quest: 'debt' }).state.quests).toBe(failed.quests);
  });

  it('only as a quest the content has, at a stage it has', () => {
    expect(() => apply(start(), { effect: 'start-quest', quest: 'heist' })).toThrow('No quest "heist"');
    expect(() => apply(start(), { effect: 'set-stage', quest: 'courier', stage: 'lost' })).toThrow(
      'The quest "courier" has no stage "lost"',
    );
  });

  it('leaves the slice shared when an event moves no quest', () => {
    const state = start();
    expect(run(state, set('alarm')).state.quests).toBe(state.quests);
  });

  it('not while its start is unknown: a waiting quest’s stage has no value', () => {
    const records = withQuest('shadow', {
      name: 'Shadow',
      'starts-when': { fact: 'quests.stage', args: { quest: 'courier' }, op: '==', value: 'pickup' },
      stages: [{ id: 'follow', objectives: [{ id: 'wait', text: 'Wait', 'done-when': flagOn('loop') }] }],
    });
    const dock = dockWith(records);
    const state = dock.apply(dock.start(), set('posted'));
    expect(quests(state).shadow).toBeUndefined();
    const courier = dock.apply(state, { effect: 'start-quest', quest: 'courier' });
    expect(quests(courier).shadow?.state).toBe('active');
  });

  it('with the game in a game with no quest at the start, once its starts-when holds already', () => {
    const records = {
      ...RECORDS,
      quest: {
        early: {
          name: 'Early',
          'starts-when': { not: flagOn('posted') },
          stages: [{ id: 'one', objectives: [{ id: 'wait', text: 'Wait', 'done-when': flagOn('posted') }] }],
        },
      },
    };
    expect(quests(dockWith(records).start()).early).toMatchObject({ state: 'active', stage: 'one' });
  });
});
