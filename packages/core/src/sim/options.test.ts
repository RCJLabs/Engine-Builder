import { describe, expect, it } from 'vitest';
import { game as salvage, sim as salvageSim } from '../../test/salvage.ts';
import { createRecordStore } from '../records.ts';
import { Rng } from '../rng.ts';
import { stateHash } from '../stateHash.ts';
import { ActionError, createGame, defineModule, type GameState } from './index.ts';

// A stall whose stock is content, with a mode for browsing it and a fact for the purse.
const sim = {
  content: createRecordStore({ ware: { rope: { price: 3 }, lamp: { price: 9 }, map: { price: 5 } } }),
};

const stall = defineModule<{ coins: number; bought: string[] }>({
  id: 'stall',
  init: () => ({ coins: 6, bought: [] }),
  facts: { coins: { read: ({ state }) => state.coins, domain: { type: 'int', min: 0 } } },
  actions: {
    browse(ctx) {
      ctx.modes.push('browsing', { shelf: ['lamp', 'map', 'rope'] });
    },
    leave(ctx) {
      ctx.modes.pop();
    },
    buy: {
      run(ctx, action) {
        const ware = action.ware as string;
        const { price } = ctx.content.getOrThrow<{ price: number }>('ware', ware);
        if (ctx.read().coins < price) return ctx.refuse('too-dear', { ware });
        const slice = ctx.write();
        slice.coins -= price;
        slice.bought.push(ware);
      },
      // What the shelf holds and the purse covers, read through a condition as a menu would.
      options: ({ mode, content, check }) =>
        (mode.data as { shelf: string[] }).shelf
          .filter((ware) => {
            const { price } = content.getOrThrow<{ price: number }>('ware', ware);
            return check({ fact: 'stall.coins', op: '>=', value: price }) === true;
          })
          .map((ware) => ({ ware })),
    },
    haggle: { run() {}, options: () => [] },
  },
  modes: {
    square: { actions: ['stall/browse'] },
    browsing: { actions: ['stall/buy', 'stall/leave', 'stall/haggle'] },
  },
});

const game = createGame({ modules: [stall], start: 'square' });
const browsing = (): GameState => {
  const step = game.reduce(game.init('s', sim), { type: 'stall/browse' }, sim);
  return step.state;
};

describe('game.options', () => {
  it('offers an action without options once, and each option of one that has them, by type', () => {
    expect(game.options(game.init('s', sim), sim)).toEqual([{ type: 'stall/browse' }]);
    expect(game.options(browsing(), sim)).toEqual([
      { type: 'stall/buy', ware: 'map' },
      { type: 'stall/buy', ware: 'rope' },
      { type: 'stall/leave' },
    ]);
  });

  it('follows the state: an option the purse no longer covers is not offered', () => {
    const after = game.reduce(browsing(), { type: 'stall/buy', ware: 'map' }, sim).state;
    expect(game.options(after, sim)).toEqual([{ type: 'stall/leave' }]);
  });

  it('changes nothing and draws nothing, and hands out frozen actions', () => {
    const state = browsing();
    const before = stateHash(state);
    const offered = game.options(state, sim);
    expect(stateHash(state)).toBe(before);
    expect(Object.isFrozen(offered) && offered.every(Object.isFrozen)).toBe(true);
  });

  it('throws on options a log could not hold', () => {
    const withMode = (options: () => unknown[]) => {
      const def = {
        id: 'odd',
        init: () => ({}),
        actions: { go: { run() {}, options } },
        modes: { m: { actions: ['*'] } },
      };
      const g = createGame({ modules: [defineModule(def as never)], start: 'm' });
      return () => g.options(g.init('s', sim), sim);
    };
    expect(withMode(() => [{ type: 'odd/other' }])).toThrow(ActionError);
    expect(withMode(() => ['go'])).toThrow('options must be payload objects without a type of their own');
    expect(withMode(() => [{ n: Number.NaN }])).toThrow('is not JSON');
  });

  it('refuses a game whose action specs are malformed', () => {
    const make = (go: unknown) => () =>
      createGame({
        modules: [
          defineModule({ id: 'odd', init: () => ({}), actions: { go }, modes: { m: { actions: ['*'] } } } as never),
        ],
        start: 'm',
      });
    expect(make({ options: () => [] })).toThrow('Action "odd/go" has no run function');
    expect(make({ run() {}, options: [] })).toThrow('Action "odd/go": options must be a function');
  });
});

describe('salvage run offers only what it allows', () => {
  it('accepts every option it offers, in every state 100 random runs reach', () => {
    let checked = 0;
    for (let i = 0; i < 100; i++) {
      const rng = Rng.create(`offers-${i}`);
      let state = salvage.init(`offers-${i}`, salvageSim);
      for (let n = 0; n < 400; n++) {
        const offered = salvage.options(state, salvageSim);
        if (offered.length === 0) break;
        for (const action of offered) {
          expect(salvage.reduce(state, action, salvageSim).accepted, JSON.stringify(action)).toBe(true);
          checked++;
        }
        state = salvage.reduce(state, rng.pick(offered), salvageSim).state;
      }
      expect(salvage.fact(state, 'voyage.ending', undefined, salvageSim)).toMatch(/^(home|lost)$/);
    }
    expect(checked).toBeGreaterThan(10_000);
  });
});
