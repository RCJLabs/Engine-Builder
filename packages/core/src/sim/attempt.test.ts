import { describe, expect, it } from 'vitest';
import { createRecordStore } from '../records.ts';
import { Rng } from '../rng.ts';
import { stateHash } from '../stateHash.ts';
import { type Attempt, createGame, defineModule, type GameState } from './index.ts';

interface Shop {
  credits: number;
  log: string[];
}

const shop = defineModule<Shop>({
  id: 'shop',
  init: () => ({ credits: 10, log: [] }),
  actions: {
    // Holds its slice across the attempts, as handlers do, and writes to it after each.
    'buy-all'(ctx, action) {
      const slice = ctx.write();
      for (const price of action.prices as number[]) {
        const result = ctx.attempt(() => ctx.apply({ effect: 'buy', price }));
        slice.log.push(result.ok ? `bought ${price}` : `${result.reason} ${price}`);
      }
    },
    // The first inner attempt refuses, then the outer one: numbering attempts in one flat
    // count would then skip the attempt after them by mistake.
    nested(ctx) {
      ctx.attempt(() => {
        ctx.attempt(() => ctx.apply({ effect: 'buy', price: 99 }));
        ctx.attempt(() => ctx.apply({ effect: 'buy', price: 1 }));
        ctx.write().log.push('inner done');
        ctx.refuse('outer');
      });
      ctx.attempt(() => ctx.write().log.push('after'));
    },
    'refuse-outside'(ctx) {
      ctx.attempt(() => ctx.apply({ effect: 'buy', price: 1 }));
      ctx.refuse('closed');
    },
    'always-refuses'(ctx, act) {
      for (let i = 0; i < (act.times as number); i++) ctx.attempt(() => ctx.refuse('no'));
    },
    report(ctx, act) {
      const results: Attempt[] = [];
      for (const price of act.prices as number[]) results.push(ctx.attempt(() => ctx.apply({ effect: 'buy', price })));
      ctx.emit('results', { results });
    },
  },
  effects: {
    // Changes everything a refusal must undo, then refuses when the money runs out.
    buy(ctx, effect) {
      const price = effect.price as number;
      const slice = ctx.write();
      slice.credits -= price;
      ctx.rng('haggle').int(1, 6);
      ctx.emit('bought', { price });
      ctx.modes.push('receipt');
      if (slice.credits < 0) ctx.refuse('too-dear', { price });
      ctx.modes.pop();
    },
  },
  modes: { open: { actions: ['*'] }, receipt: { actions: ['shop/buy-all'] } },
});

const sim = { content: createRecordStore({}) };
const game = createGame({ modules: [shop], start: 'open' });
const start = game.init('attempts', sim);
const shopOf = (state: GameState) => state.shop as Shop;

describe('ctx.attempt', () => {
  it('undoes a refused attempt, its writes, draws, beats and mode changes, and goes on', () => {
    const step = game.reduce(start, { type: 'shop/buy-all', prices: [4, 20, 3] }, sim);
    expect(step.accepted).toBe(true);
    expect(shopOf(step.state)).toEqual({ credits: 3, log: ['bought 4', 'too-dear 20', 'bought 3'] });
    expect(step.beats.filter((beat) => beat.type === 'shop/bought')).toEqual([
      { type: 'shop/bought', price: 4 },
      { type: 'shop/bought', price: 3 },
    ]);
    expect(step.state.kernel.modes).toEqual([{ id: 'open' }]);
    const two = Rng.create('attempts').fork('shop/haggle');
    two.int(1, 6);
    two.int(1, 6);
    expect(step.state.kernel.streams['shop/haggle']).toEqual(two.toState());
  });

  it('returns the refusal, reason and data', () => {
    const step = game.reduce(start, { type: 'shop/report', prices: [4, 20] }, sim);
    expect(step.beats.at(-1)).toEqual({
      type: 'shop/results',
      results: [{ ok: true }, { ok: false, reason: 'too-dear', data: { price: 20 } }],
    });
  });

  it('undoes the attempts inside a refused attempt too, and keeps the names of those after it', () => {
    const { state } = game.reduce(start, { type: 'shop/nested' }, sim);
    expect(shopOf(state)).toEqual({ credits: 10, log: ['after'] });
  });

  it('still refuses the whole action for a refusal outside any attempt', () => {
    const step = game.reduce(start, { type: 'shop/refuse-outside' }, sim);
    expect(step).toEqual({
      state: start,
      beats: [{ type: 'rejected', action: 'shop/refuse-outside', reason: 'closed' }],
      accepted: false,
    });
  });

  it('gives the same state every time', () => {
    const once = game.reduce(start, { type: 'shop/buy-all', prices: [4, 20, 3, 9, 1] }, sim).state;
    const again = game.reduce(start, { type: 'shop/buy-all', prices: [4, 20, 3, 9, 1] }, sim).state;
    expect(stateHash(again)).toBe(stateHash(once));
  });

  it('throws when more than 1,000 attempts refuse in one action', () => {
    expect(game.reduce(start, { type: 'shop/always-refuses', times: 1000 }, sim).accepted).toBe(true);
    expect(() => game.reduce(start, { type: 'shop/always-refuses', times: 1001 }, sim)).toThrow(
      'More than 1000 attempts refused in one "shop/always-refuses" action',
    );
  });
});
