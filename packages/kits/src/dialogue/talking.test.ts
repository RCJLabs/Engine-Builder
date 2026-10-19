/**
 * Talking (docs/specs/dialogue.md#talking): a talk opens at the line its first holding start
 * gives, what each option shows is the verdict saying makes, costs are paid once, outcomes are
 * rolled by the table the odds show and lead to lines of their own, and once options go once said.
 */
import { type GameState, Rng } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { BETA_NEEDS, cragGame, cragWith, RECORDS, withTalk } from '../../test/crag.ts';
import type { DialogueSlice } from './types.ts';

const { game, sim, start, apply, visit, say, fact, view } = cragGame;
const slice = (state: GameState) => state.dialogue as DialogueSlice;
const cash = (state: GameState) => fact(state, 'economy.amount', { resource: 'cash' });
const offered = (state: GameState) =>
  game
    .options(state, sim)
    .flatMap((a) => (a.type === 'dialogue/say' ? [a.option] : a.type === 'dialogue/go-on' ? ['(go on)'] : []));
const accepted = (step: ReturnType<typeof say>) => {
  if (!step.accepted) throw new Error(`Refused: ${JSON.stringify(step.beats[0])}`);
  return step.state;
};
/** Marge, past her first-time lines: at "again". */
const atAgain = (state: GameState = start()) => accepted(say(visit(state, 'marge'), 'been'));

describe('a talk', () => {
  it('opens at the line of the first start whose If holds, in the mode talking', () => {
    const step = game.reduce(start(), { type: 'crag/visit', who: 'marge' }, sim);
    expect(step.beats.filter((b) => b.type.startsWith('dialogue/'))).toEqual([
      { type: 'dialogue/opened', talk: 'marge', line: 'hello' },
      { type: 'dialogue/heard', talk: 'marge', line: 'hello' },
    ]);
    expect(step.state.kernel.modes.at(-1)).toEqual({ id: 'talking', data: { talk: 'marge' } });
    expect(slice(step.state).open).toEqual({ talk: 'marge', line: 'hello' });
    expect([fact(step.state, 'dialogue.open'), fact(step.state, 'dialogue.talked', { talk: 'marge' })]).toEqual([
      'marge',
      1,
    ]);
    // Talked to once, the next visit opens where the first start says.
    const again = visit(accepted(say(atAgain(), 'bye')), 'marge');
    expect(slice(again).open).toEqual({ talk: 'marge', line: 'again' });
    expect(() => visit(start(), 'marjorie')).toThrow('No talk "marjorie"');
  });

  it('has nothing to say while none of its starts holds', () => {
    const step = game.reduce(start(), { type: 'crag/visit', who: 'summit' }, sim);
    expect(step.beats).toContainEqual({ type: 'dialogue/nothing-to-say', talk: 'summit' });
    expect(step.state.kernel.modes).toHaveLength(1);
    expect(fact(step.state, 'dialogue.talked', { talk: 'summit' })).toBe(0);
    expect(view(start(), 'summit')).toEqual({ effect: 'open-talk', talk: 'summit' });
    const permitted = apply(start(), { effect: 'set-flag', flag: 'permit', to: true });
    expect(slice(visit(permitted, 'summit')).open).toEqual({ talk: 'summit', line: 'top' });
  });
});

describe('what a line shows', () => {
  it('is its speaker, text and options, each with its cost and what locks it', () => {
    expect(view(atAgain(), 'marge')).toEqual({
      effect: 'open-talk',
      talk: 'marge',
      line: 'again',
      speaker: 'marge',
      text: 'What are we doing today?',
      options: [
        { id: 'gas', label: 'Chip in for gas', cost: { cash: 10 }, open: true },
        { id: 'beta', label: 'Any beta for the arete?', open: false, needs: BETA_NEEDS },
        { id: 'gear', label: 'Show me your gear', open: true },
        { id: 'bye', label: 'See you around.', open: true },
      ],
    });
    const poor = atAgain(apply(start(), { effect: 'add-resource', resource: 'cash', by: -16 }));
    expect(view(poor, 'marge').options?.[0]).toMatchObject({
      open: false,
      short: { resource: 'cash', have: 4, need: 10 },
    });
    // A talk not open shows the line its starts would open it at; a line's own speaker over the talk's.
    expect(view(start(), 'marge')).toMatchObject({ line: 'hello', speaker: 'marge' });
    const beta = withTalk('marge', { ...RECORDS.talk.marge, starts: [{ line: 'beta-given' }] });
    expect(cragWith(beta).view(cragWith(beta).start(), 'marge')).toMatchObject({ speaker: 'dex', 'go-on': 'next' });
  });

  it('offers exactly the options it shows open', () => {
    const bonded = (state: GameState) => apply(state, { effect: 'add-to-flag', flag: 'bond', by: 2 });
    const states = [
      visit(start(), 'marge'),
      atAgain(),
      atAgain(bonded(start())),
      atAgain(apply(start(), { effect: 'add-resource', resource: 'cash', by: -16 })),
      visit(start(), 'ranger'),
    ];
    for (const state of states) {
      const shown = (view(state, slice(state).open?.talk as string).options ?? []) as { id: string; open: boolean }[];
      expect(offered(state)).toEqual(shown.filter((o) => o.open).map((o) => o.id));
      for (const option of shown) expect(say(state, option.id).accepted).toBe(option.open);
    }
  });

  it('shows outcomes, chances and what they do only when the talk shows its odds', () => {
    const [, charm] = view(visit(start(), 'ranger'), 'ranger').options ?? [];
    expect(charm).toMatchObject({
      id: 'charm',
      outcomes: [
        { chance: 50, effects: [{ effect: 'set-flag', flag: 'permit', from: false, to: true }] },
        { chance: 50, effects: [] },
      ],
    });
    for (const option of view(atAgain(), 'marge').options ?? []) {
      expect(option).not.toHaveProperty('effects');
      expect(option).not.toHaveProperty('outcomes');
    }
  });
});

describe('saying', () => {
  it('pays the cost once, keeps what was said and goes to the line it leads to', () => {
    const step = say(atAgain(), 'gas');
    const state = accepted(step);
    expect(cash(state)).toBe(10);
    expect(step.beats).toContainEqual({ type: 'dialogue/said', talk: 'marge', line: 'again', option: 'gas' });
    expect(slice(state).open).toEqual({ talk: 'marge', line: 'thanks' });
    expect([
      fact(state, 'dialogue.said', { talk: 'marge', option: 'gas' }),
      fact(state, 'dialogue.said', { talk: 'marge', option: 'bye' }),
    ]).toEqual([true, false]);
    expect(slice(state).said.marge).toEqual(['been', 'gas']);
  });

  it('is refused outside a talk, for an option not shown, locked or past what the party has', () => {
    expect(say(start(), 'gas').beats[0]).toMatchObject({ reason: 'mode' });
    const again = atAgain();
    expect(say(again, 'shout').beats[0]).toMatchObject({ reason: 'no-such-option', talk: 'marge', option: 'shout' });
    expect(say(again, 'send').beats[0]).toMatchObject({ reason: 'no-such-option', option: 'send' });
    expect(say(again, 'first').beats[0]).toMatchObject({ reason: 'no-such-option', option: 'first' });
    expect(say(again, 'beta').beats[0]).toMatchObject({ reason: 'locked', talk: 'marge', option: 'beta' });
    const poor = atAgain(apply(start(), { effect: 'add-resource', resource: 'cash', by: -16 }));
    expect(say(poor, 'gas').beats[0]).toMatchObject({ reason: 'cant-afford', resource: 'cash', have: 4, need: 10 });
  });

  it('hides a once option once it has been said', () => {
    let state = atAgain(apply(start(), { effect: 'add-to-flag', flag: 'bond', by: 2 }));
    state = accepted(say(state, 'beta'));
    expect(slice(state).open?.line).toBe('beta-given');
    state = cragGame.step(state, { type: 'dialogue/go-on' });
    expect((view(state, 'marge').options ?? []).map((o) => o.id)).toEqual(['gas', 'send', 'gear', 'bye']);
    expect(say(state, 'beta').beats[0]).toMatchObject({ reason: 'no-such-option' });
  });

  it('rolls an outcome by the table the odds show, from the stream dialogue/outcome, and goes to its line', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const before = visit(start(`charm-${i}`), 'ranger');
      const roll = Rng.fromState(
        before.kernel.streams['dialogue/outcome'] ?? Rng.create(`charm-${i}`).fork('dialogue/outcome').toState(),
      ).int(1, 100);
      const step = say(before, 'charm');
      const outcome = roll <= 50 ? 0 : 1;
      expect(step.beats).toContainEqual({ type: 'dialogue/rolled', talk: 'ranger', option: 'charm', outcome, roll });
      const state = accepted(step);
      expect([slice(state).open?.line, fact(state, 'flag.on', { flag: 'permit' })]).toEqual(
        outcome === 0 ? ['waved', true] : ['turned-back', false],
      );
      seen.add(outcome);
    }
    expect([...seen].sort()).toEqual([0, 1]);
  });

  it('is refused when one of its effects refuses, the talk staying at its line', () => {
    const records = withTalk('marge', {
      speaker: 'marge',
      starts: [{ line: 'ask' }],
      lines: [
        {
          id: 'ask',
          text: 'Got a rope?',
          options: [
            { id: 'lend', label: 'Lend it', cost: { cash: 5 }, effects: [{ effect: 'take-item', item: 'rope' }] },
            { id: 'no', label: 'No' },
          ],
        },
      ],
    });
    const g = cragWith(records);
    const asked = g.visit(g.start(), 'marge');
    const step = g.say(asked, 'lend');
    expect(step.accepted).toBe(false);
    expect(step.beats[0]).toMatchObject({ reason: 'not-enough', item: 'rope' });
    expect(step.state).toBe(asked);
    const roped = g.visit(g.apply(g.start(), { effect: 'give-item', item: 'rope' }), 'marge');
    expect(g.fact(accepted(g.say(roped, 'lend')), 'economy.amount', { resource: 'cash' })).toBe(15);
  });

  it('charges no cost without the economy kit, nor locks an option by one', () => {
    const free = cragWith(RECORDS, { economy: false });
    const state = free.step(free.visit(free.start(), 'ranger'), { type: 'dialogue/say', option: 'buy' });
    expect(free.fact(state, 'flag.on', { flag: 'permit' })).toBe(true);
  });
});
