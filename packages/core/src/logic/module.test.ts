import { describe, expect, it } from 'vitest';
import { createRecordStore } from '../records.ts';
import { Rng } from '../rng.ts';
import { type Beat, createGame, defineModule, type Effect, type GameState } from '../sim/index.ts';
import { logicModule, rollTable } from './index.ts';

const sim = { content: createRecordStore({}) };

// Applies the effects an action carries, and notes each `note` effect, so tests see what ran.
const probe = defineModule<{ notes: number[] }>({
  id: 'probe',
  init: () => ({ notes: [] }),
  actions: {
    apply(ctx, action) {
      for (const effect of action.effects as Effect[]) ctx.apply(effect);
    },
  },
  effects: {
    note(ctx, effect) {
      ctx.write().notes.push(effect.n as number);
      ctx.emit('noted', { n: effect.n as number });
    },
  },
  modes: { play: { actions: ['*'] } },
});
const game = createGame({ modules: [logicModule, probe], start: 'play' });
const note = (n: number): Effect => ({ effect: 'note', n });
const roll = (...outcomes: [number, ...Effect[]][]): Effect => ({
  effect: 'roll',
  outcomes: outcomes.map(([chance, ...effects]) => ({ chance, effects })),
});
const apply = (state: GameState, ...effects: Effect[]) => game.reduce(state, { type: 'probe/apply', effects }, sim);
const beatOf = (beats: readonly Beat[], type: string): Readonly<Record<string, unknown>> =>
  beats.find((beat) => beat.type === type) ?? {};

describe('the roll effect', () => {
  it('picks each outcome on exactly as many rolls of 1 to 100 as its preview shows', () => {
    const effect = roll([70, note(1)], [25, note(2)], [5, note(3)]);
    const outcomeOf = new Map<number, number>();
    let state = game.init('odds', sim);
    for (let i = 0; i < 3000; i++) {
      const step = apply(state, effect);
      const { roll, outcome } = beatOf(step.beats, 'logic/rolled') as { roll: number; outcome: number };
      expect(beatOf(step.beats, 'probe/noted').n).toBe(outcome + 1);
      expect(outcomeOf.get(roll) ?? outcome).toBe(outcome);
      outcomeOf.set(roll, outcome);
      state = step.state;
    }
    expect([...outcomeOf.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    const rollsPicking = (outcome: number) => [...outcomeOf.values()].filter((o) => o === outcome).length;
    const outcomes = game.preview(state, [effect], sim)[0]?.outcomes as { chance: number }[];
    expect(outcomes.map(({ chance }) => chance)).toEqual([0, 1, 2].map(rollsPicking));
  });

  it('assigns rolls in the order written: 70 then 30 is 1 to 70, then 71 to 100', () => {
    expect(rollTable(roll([70], [30])).map(({ index, from, to }) => [index, from, to])).toEqual([
      [0, 1, 70],
      [1, 71, 100],
    ]);
  });

  it('reports the roll before what the outcome does', () => {
    const { beats } = apply(game.init('order', sim), roll([100, note(7)]));
    expect(beats).toEqual([
      { type: 'logic/rolled', roll: expect.any(Number), outcome: 0, chance: 100 },
      { type: 'probe/noted', n: 7 },
    ]);
  });

  it('draws once per roll, even with one outcome, so later rolls never shift', () => {
    const { state } = apply(game.init('draws', sim), roll([100]));
    const expected = Rng.create('draws').fork('logic/roll');
    expected.int(1, 100);
    expect(state.kernel.streams['logic/roll']).toEqual(expected.toState());
  });

  it('previews each outcome with its chance, its text and its effects, nested rolls too', () => {
    const effect: Effect = {
      effect: 'roll',
      outcomes: [
        { chance: 60, text: 'The hull holds', effects: [note(1)] },
        { chance: 40, effects: [roll([50, note(2)], [50])] },
      ],
    };
    const state = game.init('preview', sim);
    expect(game.preview(state, [effect, note(9)], sim)).toEqual([
      {
        effect: 'roll',
        outcomes: [
          { chance: 60, text: 'The hull holds', effects: [note(1)] },
          {
            chance: 40,
            effects: [
              {
                effect: 'roll',
                outcomes: [
                  { chance: 50, effects: [note(2)] },
                  { chance: 50, effects: [] },
                ],
              },
            ],
          },
        ],
      },
      note(9),
    ]);
  });

  it.each([
    ['chances that add up to 90', roll([60], [30]), "A roll's chances add up to 100, not 90"],
    ['a chance of 0', roll([100], [0]), 'Roll outcome 1: chance is a whole percent, at least 1'],
    ['a fractional chance', roll([50.5], [49.5]), 'Roll outcome 0: chance is a whole percent, at least 1'],
    ['no outcomes', { effect: 'roll', outcomes: [] }, 'A roll needs a list of outcomes'],
    ['no list', { effect: 'roll' }, 'A roll needs a list of outcomes'],
  ])('throws on %s, in the roll and in its preview', (_name, effect, message) => {
    const state = game.init('bad', sim);
    expect(() => apply(state, effect)).toThrow(message);
    expect(() => game.preview(state, [effect], sim)).toThrow(message);
  });
});
