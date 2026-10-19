/**
 * Quests that repeat (docs/specs/quests.md#repeats): a fresh run by start-quest, set-stage, or a
 * start that has stopped holding and holds again; slots filled afresh; past runs counted in the
 * entry, the journal and quests.times; and a quest that doesn't repeat runs once.
 */
import type { GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { fameAtLeast, withBoard } from '../../test/board.ts';
import { flagOn, set } from '../../test/dock.ts';
import type { QuestsSlice } from './types.ts';

const quests = (state: GameState) => (state.quests as QuestsSlice).quests;
const start = (quest: string) => ({ effect: 'start-quest', quest });
const off = (flag: string) => ({ effect: 'set-flag', flag, to: false });
const job = (more: object = {}) => ({
  name: 'Odd job',
  repeats: true,
  slots: [{ id: 'man', type: 'flag', where: fameAtLeast('man', 2), pick: 'random' }],
  stages: [
    {
      id: 'work',
      log: '{man} works.',
      objectives: [
        { id: 'win', text: 'Win', 'done-when': flagOn('ready') },
        { id: 'lose', text: 'Or lose', 'done-when': flagOn('alarm'), next: 'lost' },
      ],
    },
    { id: 'lost', fails: true, log: 'Lost.' },
  ],
  ...more,
});

describe('a quest that repeats', () => {
  it('runs again by start-quest once it has ended, fresh, its past runs counted', () => {
    const board = withBoard({ job: job() });
    const won = board.apply(board.start(), start('job'), set('ready'));
    expect(quests(won).job).toMatchObject({ state: 'done' });
    const again = board.apply(won, off('ready'), start('job'));
    expect(quests(again).job).toMatchObject({
      state: 'active',
      stage: 'work',
      log: ['work'],
      times: { done: 1, failed: 0 },
    });
    const lost = board.apply(again, set('alarm'));
    expect(quests(lost).job).toMatchObject({ state: 'failed', times: { done: 1, failed: 0 } });
    expect(board.fact(lost, 'quests.times', { quest: 'job', state: 'done' })).toBe(1);
    expect(board.fact(lost, 'quests.times', { quest: 'job', state: 'failed' })).toBe(1);
    expect(board.journal(lost, 'job')).toMatchObject({ state: 'failed', times: { done: 1, failed: 1 } });
  });

  it('does nothing to start-quest while it runs, and a quest that doesn’t repeat runs once', () => {
    const board = withBoard({ job: job(), once: job({ repeats: undefined }) });
    const running = board.apply(board.start(), start('job'), start('once'));
    expect(quests(board.apply(running, start('job')))).toEqual(quests(running));
    const ended = board.apply(running, set('ready'));
    expect(quests(board.apply(ended, off('ready'), start('once'))).once?.state).toBe('done');
  });

  it('runs again by set-stage, at that stage', () => {
    const board = withBoard({ job: job() });
    const won = board.apply(board.start(), start('job'), set('ready'));
    const again = board.apply(won, { effect: 'set-stage', quest: 'job', stage: 'lost' });
    expect(quests(again).job).toMatchObject({ state: 'failed', stage: 'lost', times: { done: 1, failed: 0 } });
  });

  it('fills its slots afresh each run', () => {
    const board = withBoard({ job: job() });
    let state = board.start('fresh');
    const filled = new Set<string>();
    for (let run = 0; run < 12; run++) {
      state = board.apply(state, start('job'));
      filled.add(quests(state).job?.slots?.man as string);
      // Two actions: events are heard once an action's work is over, when ready would be off again.
      state = board.apply(board.apply(state, set('ready')), off('ready'));
    }
    expect(filled.size).toBeGreaterThan(1);
    expect(quests(state).job?.times).toEqual({ done: 11, failed: 0 });
  });

  it('starts again by its start only once that has stopped holding, so one done at once doesn’t loop', () => {
    const board = withBoard({
      shift: {
        name: 'A shift',
        repeats: true,
        'starts-when': flagOn('posted'),
        stages: [{ id: 'clock-in', log: 'Clocked in.' }],
      },
    });
    const posted = board.apply(board.start(), set('posted'));
    expect(quests(posted).shift).toMatchObject({ state: 'done' });
    expect(quests(board.apply(posted, set('ready'))).shift?.times).toBeUndefined();
    const unposted = board.apply(posted, off('posted'));
    expect(quests(unposted).shift).toMatchObject({ again: true });
    expect(quests(board.apply(unposted, set('posted'))).shift?.times).toEqual({ done: 1, failed: 0 });
  });
});
