/**
 * The tracked quest and objectives' targets (M6.6, D78, docs/specs/markers.md): a quest that starts
 * is tracked; the journal's quests/track tracks another, in any mode and offered by none; the tracked
 * quest's end hands it to the first active by id; and each objective's target, written or read from
 * its count, with its slots bound.
 */
import type { GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { dockGame, dockWith, set, withQuest } from '../../test/dock.ts';
import { targetOf } from './targets.ts';
import type { Objective, QuestsSlice } from './types.ts';

const { game, start, step, apply, fact, journal } = dockGame;
const tracked = (state: GameState) => (state.quests as QuestsSlice).tracked;
const track = (quest: string) => ({ type: 'quests/track', quest });

describe('the tracked quest', () => {
  it('is the quest last started', () => {
    const begun = start();
    expect(tracked(begun)).toBe('debt');
    const posted = apply(begun, set('posted'));
    expect(tracked(posted)).toBe('bounty');
    expect(fact(posted, 'quests.tracked')).toBe('bounty');
  });

  it('is changed by quests/track, in a mode that names no quests action, and offered by none', () => {
    const posted = apply(start(), set('posted'));
    expect(game.allowedActions(posted)).not.toContain('quests/track');
    expect(tracked(step(posted, track('debt')))).toBe('debt');
  });

  it('refuses a quest that isn’t active', () => {
    const result = game.reduce(start(), track('bounty'), dockGame.sim);
    expect(result.accepted).toBe(false);
    expect(result.beats[0]).toMatchObject({ reason: 'not-active', quest: 'bounty' });
  });

  it('moves to the first active quest by id when the tracked quest ends, and to none after the last', () => {
    const both = apply(apply(start(), set('posted')), { effect: 'start-quest', quest: 'courier' });
    expect(tracked(both)).toBe('courier');
    const failed = apply(both, { effect: 'fail-quest', quest: 'courier' });
    expect(tracked(failed)).toBe('bounty');
    // Another quest ending leaves the tracked one tracked.
    expect(tracked(apply(failed, set('refused')))).toBe('bounty');
    // Done counts as ended too: the debt, tracked again and paid, hands it to the bounty.
    const owing = step(apply(start(), set('posted')), track('debt'));
    expect(tracked(owing)).toBe('debt');
    expect(tracked(apply(owing, set('paid')))).toBe('bounty');
    // The debt, alone, fails: nothing is tracked.
    const none = apply(start(), set('refused'));
    expect(fact(none, 'quests.tracked')).toBeUndefined();
  });
});

describe('an objective’s target', () => {
  const objective = (fields: Partial<Objective>): Objective => ({ id: 'o', text: 'O', ...fields });

  it('is the one written, before any read from its count', () => {
    const target = { actor: 'chief' };
    expect(
      targetOf(objective({ target, count: { event: 'world/used', args: { space: 's', object: 'x' }, to: 1 } })),
    ).toEqual(target);
  });

  it('is read from a count of world/used or fighting/searched, and from nothing else', () => {
    const used = objective({ count: { event: 'world/used', args: { space: 'glen', object: 'rope' }, to: 1 } });
    expect(targetOf(used)).toEqual({ space: 'glen', object: 'rope' });
    const searched = objective({ count: { event: 'fighting/searched', args: { actor: '@mark' }, to: 1 } });
    expect(targetOf(searched)).toEqual({ actor: '@mark' });
    expect(targetOf(objective({ count: { event: 'world/used', args: { space: 'glen' }, to: 1 } }))).toBeUndefined();
    expect(targetOf(objective({ count: { event: 'dock/scrapped', to: 1 } }))).toBeUndefined();
    expect(targetOf(objective({ 'done-when': { fact: 'flag.on', args: { flag: 'x' } } }))).toBeUndefined();
  });

  it('is in the journal with its slots bound, and only where there is one', () => {
    const hunt = {
      name: 'The hunt',
      'at-start': true,
      slots: [{ id: 'mark', type: 'flag', record: 'alarm' }],
      stages: [
        {
          id: 'find',
          objectives: [
            {
              id: 'see',
              text: 'Find {mark}',
              'done-when': { fact: 'flag.on', args: { flag: 'loop' } },
              target: { actor: '@mark' },
            },
            {
              id: 'go',
              text: 'Go to the hold',
              count: { event: 'world/used', args: { space: 'hold', object: 'hatch' }, to: 1 },
            },
            { id: 'wait', text: 'Wait', 'done-when': { fact: 'flag.on', args: { flag: 'ready' } } },
          ],
        },
      ],
    };
    const { start: begin, journal: entry } = dockWith(withQuest('hunt', hunt));
    const shown = entry(begin(), 'hunt').objectives ?? [];
    expect(shown.map((o) => o.target)).toEqual([{ actor: 'alarm' }, { space: 'hold', object: 'hatch' }, undefined]);
    expect(journal(start(), 'debt').objectives?.every((o) => o.target === undefined)).toBe(true);
  });
});
