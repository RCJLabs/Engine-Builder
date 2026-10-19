/**
 * How a talk goes (docs/specs/dialogue.md#going-on): a line with no option shown goes on or ends;
 * a talk ends before its last option's effects, so a mode they open comes next; a mode an
 * option's effects open comes before the talk goes on; talks opened while one is open wait their
 * turn; and a game can be all talk.
 */
import type { GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { cragGame, cragWith, RECORDS, withTalk } from '../../test/crag.ts';
import type { DialogueSlice } from './types.ts';

const { game, sim, start, step, apply, visit, say, goOn, fact, view } = cragGame;
const slice = (state: GameState) => state.dialogue as DialogueSlice;
const modes = (state: GameState) => state.kernel.modes.map((m) => m.id);
const types = (beats: readonly { type: string }[]) => beats.map((b) => b.type).filter((t) => t.startsWith('dialogue/'));
const accepted = (result: ReturnType<typeof say>) => {
  if (!result.accepted) throw new Error(`Refused: ${JSON.stringify(result.beats[0])}`);
  return result.state;
};

describe('a line with no option shown', () => {
  it('goes on to its next line, or ends the talk when it has none', () => {
    const tour = accepted(say(visit(start(), 'marge'), 'first'));
    expect(view(tour, 'marge')).toMatchObject({ line: 'tour', 'go-on': 'next' });
    expect(view(tour, 'marge')).not.toHaveProperty('options');
    expect(game.options(tour, sim)).toEqual([{ type: 'dialogue/go-on' }]);
    const again = goOn(tour);
    expect(types(again.beats)).toEqual(['dialogue/heard']);
    expect(slice(again.state).open?.line).toBe('again');
    expect(goOn(again.state).beats[0]).toMatchObject({ reason: 'has-options' });

    const permitted = apply(start(), { effect: 'set-flag', flag: 'permit', to: true });
    const checked = visit(permitted, 'ranger');
    expect(view(checked, 'ranger')).toMatchObject({ line: 'checked', 'go-on': 'end' });
    const ended = goOn(checked);
    expect(types(ended.beats)).toEqual(['dialogue/ended']);
    expect([modes(ended.state), slice(ended.state).open]).toEqual([['crag'], undefined]);
    expect(goOn(ended.state).beats[0]).toMatchObject({ reason: 'mode' });
  });

  it('applies its effects as it is shown', () => {
    // A send that goes: forced by making the odds one outcome only.
    const sure = withTalk('marge', {
      ...RECORDS.talk.marge,
      starts: [{ line: 'again' }],
      lines: RECORDS.talk.marge.lines.map((line) =>
        line.id === 'again'
          ? {
              ...line,
              options: [{ id: 'send', label: 'Send', outcomes: [{ chance: 100, effects: [], next: 'sent' }] }],
            }
          : line,
      ),
    });
    const g = cragWith(sure);
    const sent = g.step(g.visit(g.start(), 'marge'), { type: 'dialogue/say', option: 'send' });
    expect([g.fact(sent, 'flag.number', { flag: 'bond' }), slice(sent).open?.line]).toEqual([1, 'sent']);
  });
});

describe('a talk that ends', () => {
  it('ends with an option that leads nowhere, before that option’s effects', () => {
    const records = withTalk('marge', {
      speaker: 'marge',
      starts: [{ line: 'ask' }],
      lines: [
        {
          id: 'ask',
          text: 'Gear?',
          options: [{ id: 'shop', label: 'Show me', effects: [{ effect: 'open-shop', shop: 'gear-shop' }] }],
        },
      ],
    });
    const g = cragWith(records);
    const result = g.say(g.visit(g.start(), 'marge'), 'shop');
    expect(types(result.beats)).toEqual(['dialogue/said', 'dialogue/ended']);
    // The shop opened over the crag, not under a talk that was over.
    expect(modes(result.state)).toEqual(['crag', 'shopping']);
    expect(slice(result.state).open).toBeUndefined();
  });

  it('opens the talks that waited, in the order opened, passing over one with nothing to say', () => {
    const opening = (...talks: string[]) => apply(start(), ...talks.map((talk) => ({ effect: 'open-talk', talk })));
    const state = opening('marge', 'summit', 'ranger');
    expect([slice(state).open?.talk, slice(state).waiting]).toEqual(['marge', ['summit', 'ranger']]);
    expect(fact(state, 'dialogue.talked', { talk: 'ranger' })).toBe(0);
    const result = say(accepted(say(state, 'been')), 'bye');
    expect(types(result.beats)).toEqual([
      'dialogue/said',
      'dialogue/ended',
      'dialogue/nothing-to-say',
      'dialogue/opened',
      'dialogue/heard',
    ]);
    expect(result.beats).toContainEqual({ type: 'dialogue/opened', talk: 'ranger', line: 'stop' });
    expect([modes(result.state), slice(result.state).waiting]).toEqual([['crag', 'talking'], []]);
  });
});

describe('a mode an option opens', () => {
  it('comes before the talk goes on, which waits beneath it at the line it leads to', () => {
    const again = accepted(say(visit(start(), 'marge'), 'been'));
    const shopping = accepted(say(again, 'gear'));
    expect(modes(shopping)).toEqual(['crag', 'talking', 'shopping']);
    expect(slice(shopping).open).toEqual({ talk: 'marge', line: 'after-gear' });
    expect(fact(shopping, 'dialogue.heard', { talk: 'marge', line: 'after-gear' })).toBe(1);
    // Nothing is said while the shop is open; leaving it, the talk goes on where it was.
    expect(say(shopping, 'bye').beats[0]).toMatchObject({ reason: 'mode' });
    const back = step(shopping, { type: 'economy/leave' });
    expect(modes(back)).toEqual(['crag', 'talking']);
    expect(game.options(back, sim)).toEqual([{ type: 'dialogue/go-on' }]);
  });
});

describe('the facts', () => {
  it('count talks, lines heard and options said, and refuse lines and options a talk lacks', () => {
    let state = accepted(say(visit(start(), 'marge'), 'first'));
    state = accepted(goOn(state));
    expect([
      fact(state, 'dialogue.heard', { talk: 'marge', line: 'tour' }),
      fact(state, 'dialogue.heard', { talk: 'marge', line: 'again' }),
      fact(state, 'dialogue.heard', { talk: 'marge', line: 'sent' }),
      fact(state, 'dialogue.said', { talk: 'marge', option: 'first' }),
    ]).toEqual([1, 1, 0, true]);
    expect(slice(state).heard).toEqual({ marge: { hello: 1, tour: 1, again: 1 } });
    expect(() => fact(state, 'dialogue.heard', { talk: 'marge', line: 'summit' })).toThrow(
      'The talk "marge" has no line "summit"',
    );
    expect(() => fact(state, 'dialogue.said', { talk: 'marge', option: 'shout' })).toThrow(
      'The talk "marge" has no option "shout"',
    );
  });
});

describe('a game of talk', () => {
  it('can start in the mode talking, its first talk opened by a module’s start, and be over once none is open', () => {
    const story = cragWith(RECORDS, { start: 'talking', first: 'ranger' });
    const begun = story.start();
    expect(begun.kernel.modes).toEqual([{ id: 'talking' }, { id: 'talking', data: { talk: 'ranger' } }]);
    const over = story.step(begun, { type: 'dialogue/say', option: 'leave' });
    expect(over.kernel.modes).toEqual([{ id: 'talking' }]);
    expect(story.game.options(over, story.sim)).toEqual([]);
    expect(story.say(over, 'leave').beats[0]).toMatchObject({ reason: 'not-talking' });
    expect(story.goOn(over).beats[0]).toMatchObject({ reason: 'not-talking' });
  });
});
