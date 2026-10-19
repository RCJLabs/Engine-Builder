/**
 * Timed jobs (docs/specs/quests.md#jobs): rolled as their stage is reached and kept as the time
 * module's timer, so other draws before the job is over can't change its outcome; the odds shown
 * are the table rolled; the stage waits; and leaving it, by set-stage, fail-quest or a slot gone,
 * calls the job off.
 */
import type { GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { fameAtLeast, withBoard } from '../../test/board.ts';
import { flagOn } from '../../test/dock.ts';
import type { QuestsSlice } from './types.ts';

const quests = (state: GameState) => (state.quests as QuestsSlice).quests;
const start = (quest: string) => ({ effect: 'start-quest', quest });
const wait = (days: number) => ({ effect: 'wait', days });
const RAID = {
  name: 'The raid',
  slots: [{ id: 'man', type: 'flag', where: fameAtLeast('man', 5), goes: true, keeps: fameAtLeast('man', 5) }],
  stages: [
    {
      id: 'raid',
      log: '{man} goes in.',
      job: {
        takes: { days: 2 },
        outcomes: [
          { chance: 70, text: '{man} gets out', next: 'clean' },
          { chance: 30, text: 'It goes wrong', next: 'caught' },
        ],
      },
    },
    { id: 'clean', log: 'Clean.' },
    { id: 'caught', log: 'Caught.', fails: true },
    { id: 'aside', objectives: [{ id: 'x', text: 'Wait', 'done-when': flagOn('loop') }] },
  ],
};
const board = withBoard({ raid: RAID });
const launched = (seed: string) => board.apply(board.start(seed), start('raid'));

describe('a job', () => {
  it('waits at its stage until its time is over, then goes where its outcome leads', () => {
    const state = launched('a');
    expect(quests(state).raid).toMatchObject({ state: 'active', stage: 'raid' });
    expect(board.fact(state, 'time.pending', { timer: 'quests-raid' })).toBe(true);
    const day = board.apply(state, wait(1));
    expect(quests(day).raid?.stage).toBe('raid');
    expect(['clean', 'caught']).toContain(quests(board.apply(day, wait(1))).raid?.stage);
  });

  it('is sealed as it is reached: draws on other streams before it ends change nothing', () => {
    const roll = {
      effect: 'roll',
      outcomes: [
        { chance: 50, effects: [] },
        { chance: 50, effects: [] },
      ],
    };
    for (let seed = 0; seed < 20; seed++) {
      const state = launched(`s${seed}`);
      const plain = board.apply(state, wait(2));
      const drawn = board.apply(state, roll, roll, roll, wait(2));
      expect(quests(drawn).raid?.stage).toBe(quests(plain).raid?.stage);
    }
  });

  it('ends as its odds say, over many seeds', () => {
    let clean = 0;
    const runs = 400;
    for (let seed = 0; seed < runs; seed++) {
      if (quests(board.apply(launched(`odds${seed}`), wait(2))).raid?.stage === 'clean') clean++;
    }
    // 70% of 400 is 280; three standard deviations either side is about 253 to 307.
    expect(clean).toBeGreaterThan(253);
    expect(clean).toBeLessThan(307);
  });

  it('shows its odds and the time left in the journal, never the outcome rolled', () => {
    const state = launched('shown');
    const journal = board.journal(state, 'raid');
    expect(journal.job).toEqual({
      outcomes: [
        { chance: 70, text: 'Bo gets out' },
        { chance: 30, text: 'It goes wrong' },
      ],
      left: 2,
    });
    expect(board.journal(board.apply(state, wait(1)), 'raid').job?.left).toBe(1);
    expect(JSON.stringify(journal)).not.toMatch(/clean|caught/);
  });

  it('is not rolled when its stage’s own effects move the quest on', () => {
    const moved = withBoard({
      raid: {
        ...RAID,
        stages: RAID.stages.map((stage, i) =>
          i === 0 ? { ...stage, effects: [{ effect: 'set-stage', quest: 'raid', stage: 'aside' }] } : stage,
        ),
      },
    });
    const state = moved.apply(moved.start('moved'), start('raid'));
    expect(quests(state).raid?.stage).toBe('aside');
    expect(moved.fact(state, 'time.pending', { timer: 'quests-raid' })).toBe(false);
  });

  it.each([
    ['set-stage', { effect: 'set-stage', quest: 'raid', stage: 'aside' }],
    ['fail-quest', { effect: 'fail-quest', quest: 'raid' }],
    ['its slot’s record gone', { effect: 'set-flag', flag: 'bo', to: 1 }],
  ])('is called off by %s: its timer goes, and its outcome with it', (_name, effect) => {
    const state = board.apply(launched('off'), effect);
    expect(board.fact(state, 'time.pending', { timer: 'quests-raid' })).toBe(false);
    const later = board.apply(state, wait(3));
    expect(quests(later).raid?.stage).toBe(quests(state).raid?.stage);
  });
});
