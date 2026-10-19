/**
 * What a quest shows and what conditions read (docs/specs/quests.md#what-a-quest-shows, #facts):
 * the journal says what the state holds, the facts read it, and effects preview what they'd do.
 */
import { describeCondition, factCatalog, type GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { dockGame, dockWith, flagOn, set, withQuest } from '../../test/dock.ts';
import { questsModule } from './module.ts';
import { stageOf } from './records.ts';
import type { QuestRecord, QuestsSlice } from './types.ts';

const { game, sim, start, apply, scrap, rest, fact, journal } = dockGame;
const quests = (state: GameState) => (state.quests as QuestsSlice).quests;

describe('the journal', () => {
  it('shows a quest not started as waiting, with nothing else', () => {
    expect(journal(start(), 'courier')).toEqual({
      effect: 'start-quest',
      quest: 'courier',
      name: 'The courier run',
      state: 'waiting',
    });
  });

  it('shows an active quest’s log, its stage’s objectives with their counts, and the days left', () => {
    let state = apply(rest(start()).state, set('posted'), set('met-chief'));
    state = scrap(state, 'drone').state;
    expect(journal(state, 'bounty')).toEqual({
      effect: 'start-quest',
      quest: 'bounty',
      name: 'Drone bounty',
      state: 'active',
      log: ['The chief posted a bounty on rogue drones.'],
      objectives: [
        { id: 'scrap', text: 'Scrap three drones', done: false, count: 1, to: 3 },
        { id: 'report', text: 'Tell the chief', done: true },
      ],
    });
    expect(journal(state, 'debt')).toMatchObject({ 'days-left': 2 });
  });

  it('shows an ended quest’s log, and why it failed, with no objectives', () => {
    const paid = apply(start(), set('paid'));
    expect(journal(paid, 'debt')).toEqual({
      effect: 'start-quest',
      quest: 'debt',
      name: 'The broker’s debt',
      state: 'done',
      log: ['The broker wants 30 credits within three days.', 'The broker shook your hand.'],
    });
    const refused = apply(start(), set('refused'));
    expect(journal(refused, 'debt')).toMatchObject({
      state: 'failed',
      log: ['The broker wants 30 credits within three days.', 'You refused, and her crew found you.'],
      why: 'You refused, and her crew found you.',
    });
  });

  it('agrees with the state at every step of a run', () => {
    const steps: ((state: GameState) => GameState)[] = [
      (s) => apply(s, set('posted')),
      (s) => scrap(s, 'drone').state,
      (s) => rest(s).state,
      (s) => apply(s, { effect: 'start-quest', quest: 'courier' }),
      (s) => scrap(s, 'crate').state,
      (s) => apply(s, set('met-chief')),
      (s) => scrap(s, 'drone').state,
      (s) => scrap(s, 'drone').state,
      (s) => rest(s).state,
      (s) => rest(s).state,
    ];
    let state = start();
    for (const next of steps) {
      state = next(state);
      for (const id of sim.content.ids('quest')) {
        const shown = journal(state, id);
        const entry = quests(state)[id];
        expect(shown.state).toBe(entry?.state ?? 'waiting');
        if (!entry) continue;
        const quest = sim.content.get('quest', id) as QuestRecord;
        const lines = entry.log.flatMap((reached) => stageOf(quest, reached)?.log ?? []);
        expect(shown.log).toEqual(lines);
        const done = shown.objectives?.filter((o) => o.done).map((o) => o.id) ?? [];
        expect(done.sort()).toEqual(entry.state === 'active' ? entry.done : []);
      }
    }
  });
});

describe('the facts', () => {
  it('read each quest’s state, stage, log, objectives and counts, and the quests in a state', () => {
    let state = apply(start(), set('posted'), set('met-chief'));
    state = scrap(state, 'drone').state;
    expect(fact(state, 'quests.state', { quest: 'bounty' })).toBe('active');
    expect(fact(state, 'quests.state', { quest: 'courier' })).toBe('waiting');
    expect(fact(state, 'quests.stage', { quest: 'bounty' })).toBe('hunt');
    expect(fact(state, 'quests.stage', { quest: 'courier' })).toBeUndefined();
    expect(fact(state, 'quests.reached', { quest: 'debt', stage: 'owed' })).toBe(true);
    expect(fact(state, 'quests.reached', { quest: 'debt', stage: 'square' })).toBe(false);
    expect(fact(state, 'quests.objective', { quest: 'bounty', objective: 'report' })).toBe(true);
    expect(fact(state, 'quests.objective', { quest: 'bounty', objective: 'scrap' })).toBe(false);
    expect(fact(state, 'quests.count', { quest: 'bounty', objective: 'scrap' })).toBe(1);
    expect(fact(state, 'quests.count', { quest: 'courier', objective: 'grab' })).toBe(0);
    expect(fact(state, 'quests.tally', { state: 'active' })).toBe(2);
    expect(fact(state, 'quests.tally', { state: 'waiting' })).toBe(5);
    const paid = apply(state, set('paid'));
    expect([fact(paid, 'quests.tally', { state: 'done' }), fact(paid, 'quests.tally', { state: 'active' })]).toEqual([
      1, 1,
    ]);
  });

  it('throw for a stage or an objective the quest doesn’t have', () => {
    expect(() => fact(start(), 'quests.reached', { quest: 'debt', stage: 'hunt' })).toThrow(
      'The quest "debt" has no stage "hunt"',
    );
    expect(() => fact(start(), 'quests.count', { quest: 'debt', objective: 'scrap' })).toThrow(
      'The quest "debt" has no objective "scrap"',
    );
    expect(() => fact(start(), 'quests.state', { quest: 'heist' })).toThrow(/heist/);
  });

  it('say their tests in words', () => {
    const words = (condition: object) => describeCondition(condition as never, factCatalog([questsModule]));
    expect(words({ fact: 'quests.state', args: { quest: 'debt' }, op: '==', value: 'done' })).toBe('Debt is done');
    expect(words({ not: { fact: 'quests.state', args: { quest: 'debt' }, op: '==', value: 'failed' } })).toBe(
      'Debt is not failed',
    );
    expect(words({ fact: 'quests.stage', args: { quest: 'debt' }, op: '==', value: 'owed' })).toBe(
      'Debt is at its stage owed',
    );
    expect(words({ fact: 'quests.reached', args: { quest: 'debt', stage: 'square' } })).toBe('Debt has reached square');
    expect(words({ fact: 'quests.objective', args: { quest: 'debt', objective: 'pay' } })).toBe('Pay of debt is done');
    expect(words({ fact: 'quests.count', args: { quest: 'bounty', objective: 'scrap' }, op: '>=', value: 2 })).toBe(
      'The count of scrap of bounty is at least 2',
    );
    expect(words({ fact: 'quests.tally', args: { state: 'done' }, op: '>=', value: 3 })).toBe(
      'The number of quests done is at least 3',
    );
  });

  it('read a quest, a stage and an objective called constructor as their own', () => {
    const records = withQuest('constructor', {
      name: 'Odd names',
      stages: [{ id: 'constructor', objectives: [{ id: 'constructor', text: 'Odd', 'done-when': flagOn('ready') }] }],
    });
    const dock = dockWith(records);
    const state = dock.start();
    expect(dock.fact(state, 'quests.state', { quest: 'constructor' })).toBe('waiting');
    expect(dock.fact(state, 'quests.count', { quest: 'constructor', objective: 'constructor' })).toBe(0);
    const started = dock.apply(state, { effect: 'start-quest', quest: 'constructor' });
    expect(dock.fact(started, 'quests.stage', { quest: 'constructor' })).toBe('constructor');
    expect(dock.journal(started, 'constructor')).toMatchObject({ state: 'active', objectives: [{ done: false }] });
    expect(dock.fact(dock.apply(started, set('ready')), 'quests.state', { quest: 'constructor' })).toBe('done');
  });
});

describe('the effects’ previews', () => {
  it('say the stage set-stage leaves, and the why fail-quest gives', () => {
    const state = start();
    const preview = (effect: object) => game.preview(state, [effect as never], sim)[0];
    expect(preview({ effect: 'set-stage', quest: 'debt', stage: 'square' })).toEqual({
      effect: 'set-stage',
      quest: 'debt',
      stage: 'square',
      from: 'owed',
    });
    expect(preview({ effect: 'set-stage', quest: 'courier', stage: 'deliver' })).toEqual({
      effect: 'set-stage',
      quest: 'courier',
      stage: 'deliver',
    });
    expect(preview({ effect: 'fail-quest', quest: 'debt' })).toEqual({
      effect: 'fail-quest',
      quest: 'debt',
      why: 'It was given up.',
    });
    expect(preview({ effect: 'fail-quest', quest: 'debt', why: 'Gone.' })).toMatchObject({ why: 'Gone.' });
    expect(() => preview({ effect: 'set-stage', quest: 'debt', stage: 'hunt' })).toThrow('has no stage "hunt"');
    expect(quests(state)).toEqual(quests(start()));
  });
});
