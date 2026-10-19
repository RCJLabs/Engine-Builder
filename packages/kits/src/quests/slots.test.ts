/**
 * A quest's slots (docs/specs/quests.md#slots): filled in order as it starts, by a record or by
 * Where, picked first, at random, most or least; `@slot` bound in conditions, effects and counts;
 * `{slot}` its record's name; a quest that can't fill one doesn't start; a record that goes is
 * away; and a slot's record gone fails the quest or moves it on, once, after success.
 */
import type { GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { fameAtLeast, withBoard } from '../../test/board.ts';
import { flagOn, set } from '../../test/dock.ts';
import { bind } from './slots.ts';
import type { QuestsSlice } from './types.ts';

const quests = (state: GameState) => (state.quests as QuestsSlice).quests;
const types = (beats: readonly { type: string }[]) => beats.map((b) => b.type).filter((t) => t.startsWith('quests/'));
const start = (quest: string) => ({ effect: 'start-quest', quest });
const famous = (pick: string, more: object = {}) => ({
  name: 'Famous',
  slots: [{ id: 'man', type: 'flag', where: fameAtLeast('man', 2), pick, ...more }],
  stages: [{ id: 'wait', objectives: [{ id: 'x', text: 'Wait', 'done-when': flagOn('loop') }] }],
});
const by = { fact: 'flag.number', args: { flag: '@man' } };

describe('filling', () => {
  it('holds a named record, and binds @slot in its conditions, effects and counts', () => {
    const board = withBoard({
      errand: {
        name: 'The errand',
        slots: [
          { id: 'cue', type: 'flag', record: 'ready' },
          { id: 'score', type: 'flag', record: 'rep' },
        ],
        stages: [
          {
            id: 'go',
            effects: [{ effect: 'add-to-flag', flag: '@score', by: 2 }],
            objectives: [
              { id: 'cued', text: 'Cue', 'done-when': flagOn('@cue') },
              { id: 'heard', text: 'Hear it', count: { event: 'flag/changed', args: { flag: '@cue' }, to: 1 } },
            ],
          },
        ],
      },
    });
    const started = board.apply(board.start(), start('errand'));
    expect(quests(started).errand).toMatchObject({ slots: { cue: 'ready', score: 'rep' } });
    expect(board.fact(started, 'flag.number', { flag: 'rep' })).toBe(2);
    expect(quests(board.apply(started, set('ready'))).errand?.state).toBe('done');
  });

  it.each([
    ['first', {}, 'ana'],
    ['most', { by }, 'bo'],
    ['least', { by }, 'ana'],
  ])('picks %s among those matching, ties to the first by id', (pick, more, expected) => {
    const board = withBoard({ famous: famous(pick, more) });
    const started = board.apply(board.start(), start('famous'));
    expect(quests(started).famous?.slots).toEqual({ man: expected });
    expect(board.fact(started, 'quests.slot', { quest: 'famous', slot: 'man' })).toBe(expected);
  });

  it('picks at random among those matching, from its own stream', () => {
    const board = withBoard({ famous: famous('random') });
    const picked = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const started = board.apply(board.start(`s${seed}`), start('famous'));
      picked.add(quests(started).famous?.slots?.man as string);
    }
    expect([...picked].sort()).toEqual(['ana', 'bo', 'cy']);
  });

  it('fills a record into one slot of a quest at most, and a later slot’s Where may name an earlier', () => {
    const board = withBoard({
      pair: {
        name: 'A pair',
        slots: [
          { id: 'one', type: 'flag', where: fameAtLeast('one', 5) },
          { id: 'two', type: 'flag', where: { all: [fameAtLeast('two', 5), fameAtLeast('one', 5)] } },
        ],
        stages: [{ id: 'wait', objectives: [{ id: 'x', text: 'Wait', 'done-when': flagOn('loop') }] }],
      },
    });
    expect(quests(board.apply(board.start(), start('pair'))).pair?.slots).toEqual({ one: 'bo', two: 'cy' });
  });

  it('shows {slot} as its record’s name, as the journal is read', () => {
    const board = withBoard({
      famous: {
        ...famous('most', { by }),
        stages: [
          {
            id: 'wait',
            log: '{man} is booked. {nobody} stays as written.',
            objectives: [{ id: 'x', text: 'Get {man} ready', 'done-when': flagOn('loop') }],
          },
        ],
      },
    });
    const journal = board.journal(board.apply(board.start(), start('famous')), 'famous');
    expect(journal.log).toEqual(['Bo is booked. {nobody} stays as written.']);
    expect(journal.objectives?.[0]?.text).toBe('Get Bo ready');
    expect(journal.slots).toEqual({ man: { id: 'bo', name: 'Bo' } });
  });
});

describe('binding', () => {
  it('puts each slot’s record for @slot, as a value, in a list or as a key, and leaves the rest', () => {
    const slots = { man: 'bo', coin: 'credits' };
    expect(bind({ cost: { '@coin': 2 }, who: ['@man', 'x'], other: '@nobody', at: 'man@' }, slots)).toEqual({
      cost: { credits: 2 },
      who: ['bo', 'x'],
      other: '@nobody',
      at: 'man@',
    });
    // A slot is read by its own key: one named as Object.prototype's is no slot at all.
    expect(bind({ who: '@constructor' }, slots)).toEqual({ who: '@constructor' });
  });
});

describe('a slot no record fills', () => {
  const lonely = {
    name: 'Lonely',
    slots: [{ id: 'man', type: 'flag', where: fameAtLeast('man', 8) }],
    stages: [{ id: 'wait', objectives: [{ id: 'x', text: 'Wait', 'done-when': flagOn('loop') }] }],
  };

  it('refuses start-quest and set-stage, saying which slot, so a choice that would start it is refused', () => {
    const board = withBoard({ lonely });
    for (const effect of [start('lonely'), { effect: 'set-stage', quest: 'lonely', stage: 'wait' }]) {
      const refused = board.run(board.start(), effect);
      expect(refused.accepted).toBe(false);
      expect(refused.beats[0]).toMatchObject({ reason: 'unfilled', quest: 'lonely', slot: 'man' });
    }
    expect(board.journal(board.start(), 'lonely')).toEqual({
      effect: 'start-quest',
      quest: 'lonely',
      name: 'Lonely',
      state: 'waiting',
      unfilled: 'man',
    });
  });

  it('is one whose named record isn’t there, though a record of its type is', () => {
    const named = { ...lonely, slots: [{ id: 'man', type: 'flag', record: 'nobody' }] };
    const board = withBoard({ named });
    expect(board.run(board.start(), start('named')).beats[0]).toMatchObject({ reason: 'unfilled', slot: 'man' });
  });

  it('leaves a quest that starts with the game waiting, and starts it once one matches', () => {
    const board = withBoard({ lonely: { ...lonely, 'at-start': true } });
    const begun = board.start();
    expect(quests(begun).lonely).toBeUndefined();
    const raised = board.apply(begun, { effect: 'set-flag', flag: 'bo', to: 9 });
    expect(quests(raised).lonely).toMatchObject({ state: 'active', slots: { man: 'bo' } });
  });
});

describe('away', () => {
  const sent = (id: string) => ({
    name: id,
    slots: [{ id: 'man', type: 'flag', where: fameAtLeast('man', 5), goes: true }],
    stages: [{ id: 'out', objectives: [{ id: 'x', text: 'Back', 'done-when': flagOn('ready') }] }],
  });

  it('is a record in a slot that goes of an active quest: sent on no other until it ends', () => {
    const board = withBoard({ first: sent('first'), second: sent('second') });
    const both = board.apply(board.start(), start('first'), start('second'));
    expect(quests(both).first?.slots).toEqual({ man: 'bo' });
    expect(quests(both).second?.slots).toEqual({ man: 'cy' });
    expect(board.fact(both, 'quests.away', { record: 'bo' })).toBe(true);
    expect(board.fact(both, 'quests.away', { record: 'ana' })).toBe(false);
    const back = board.apply(both, set('ready'));
    expect(board.fact(back, 'quests.away', { record: 'bo' })).toBe(false);
  });

  it('leaves a slot that doesn’t go free to take a record away elsewhere', () => {
    const watcher = { ...sent('watcher'), slots: [{ id: 'man', type: 'flag', where: fameAtLeast('man', 5) }] };
    const board = withBoard({ first: sent('first'), watcher });
    const both = board.apply(board.start(), start('first'), start('watcher'));
    expect(quests(both).watcher?.slots).toEqual({ man: 'bo' });
  });
});

describe('gone', () => {
  const kept = (more: object = {}) => ({
    name: 'Kept',
    slots: [{ id: 'man', type: 'flag', where: fameAtLeast('man', 5), keeps: fameAtLeast('man', 5), ...more }],
    stages: [
      { id: 'out', objectives: [{ id: 'x', text: 'Back', 'done-when': flagOn('ready') }] },
      { id: 'mourn', log: 'Mourn {man}.', objectives: [{ id: 'y', text: 'Mourn', 'done-when': flagOn('loop') }] },
    ],
  });
  const drop = { effect: 'set-flag', flag: 'bo', to: 1 };

  it('fails the quest when Keeps while stops holding, its why naming the record', () => {
    const board = withBoard({ kept: kept() });
    const lost = board.run(board.apply(board.start(), start('kept')), drop);
    expect(types(lost.beats)).toEqual(['quests/gone', 'quests/failed']);
    expect(lost.beats.find((b) => b.type === 'quests/gone')).toMatchObject({
      quest: 'kept',
      slot: 'man',
      record: 'bo',
    });
    expect(quests(lost.state).kept).toMatchObject({ state: 'failed', why: 'Bo is gone.', lost: ['man'] });
  });

  it('moves the quest to the slot’s stage instead, once: the record stays gone there', () => {
    const board = withBoard({ kept: kept({ gone: 'mourn' }) });
    const lost = board.apply(board.apply(board.start(), start('kept')), drop);
    expect(quests(lost).kept).toMatchObject({ state: 'active', stage: 'mourn', lost: ['man'] });
    expect(board.journal(lost, 'kept').log).toEqual(['Mourn Bo.']);
    expect(quests(board.apply(lost, set('loop'))).kept?.state).toBe('done');
  });

  it('is a Keeps while that can’t be answered: unknown is not holding', () => {
    // flag.number has no value for a flag that is on or off.
    const board = withBoard({
      kept: { ...kept(), slots: [{ id: 'man', type: 'flag', record: 'ready', keeps: fameAtLeast('man', 0) }] },
    });
    expect(quests(board.apply(board.start(), start('kept'))).kept).toMatchObject({
      state: 'failed',
      why: 'ready is gone.',
    });
  });

  it('comes before the stage’s own failing, which the same event brings', () => {
    const board = withBoard({
      kept: {
        ...kept(),
        stages: [
          {
            id: 'out',
            objectives: [{ id: 'x', text: 'Back', 'done-when': flagOn('ready') }],
            'fail-when': { not: fameAtLeast('man', 5) },
            why: 'Too late.',
          },
        ],
      },
    });
    expect(quests(board.apply(board.apply(board.start(), start('kept')), drop)).kept).toMatchObject({
      state: 'failed',
      why: 'Bo is gone.',
    });
  });

  it('comes after success: the event that takes the record and does the objective is done', () => {
    const board = withBoard({
      kept: {
        ...kept(),
        stages: [{ id: 'out', objectives: [{ id: 'x', text: 'Drop', 'done-when': { not: fameAtLeast('man', 5) } }] }],
      },
    });
    expect(quests(board.apply(board.apply(board.start(), start('kept')), drop)).kept?.state).toBe('done');
  });
});
