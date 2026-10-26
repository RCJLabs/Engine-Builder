/**
 * Merchants and purses (M6.8, D80, docs/specs/barter.md): Hild's post sells from her bag and buys with
 * her purse, restocks both every three days, and prices by her faction when the shop names none.
 */
import { createRecordStore, type Effect, type GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { fact, game, RECORDS, refusal, sim, start, step } from '../../test/post.ts';

const given = (state: GameState, ...effects: Effect[]) => step(state, { type: 'yard/do', effects });
const trading = (state = start()) => step(state, { type: 'yard/trade' });
const coin = (state: GameState) => fact(state, 'economy.amount', { resource: 'coin' });
const purse = (state: GameState) => fact(state, 'economy.purse', { actor: 'hild', resource: 'coin' });
const hilds = (state: GameState, item: string) => fact(state, 'inventory.carried', { actor: 'hild', item });
const offered = (state: GameState, type: string) =>
  game
    .options(state, sim)
    .filter((a) => a.type === type)
    .map((a) => a.item);

describe('a purse', () => {
  it('is the record’s until it changes', () => {
    const state = start();
    expect(purse(state)).toBe(30);
    expect(fact(state, 'economy.purse', { actor: 'tam', resource: 'coin' })).toBe(0);
    expect(state.economy).toMatchObject({ purses: {} });
  });
});

describe('a shop an actor keeps', () => {
  it('stocks their bag as it first opens: what they carry, the stock on top', () => {
    const state = trading();
    expect(hilds(state, 'candle')).toBe(2);
    expect(hilds(state, 'lamp')).toBe(1);
    // As far as each fits: she carries bread's max already.
    expect(hilds(state, 'bread')).toBe(3);
    expect(state.economy).toMatchObject({ shops: { post: { shelf: [], day: 0 } } });
    expect(offered(state, 'economy/buy')).toEqual(['bread', 'candle', 'lamp']);
    expect(fact(state, 'economy.stock', { shop: 'post', item: 'candle' })).toBe(2);
    expect(fact(state, 'economy.price', { shop: 'post', item: 'lamp' })).toBe(20);
  });

  it('sells from their bag into their purse', () => {
    const result = game.reduce(trading(), { type: 'economy/buy', item: 'lamp' }, sim);
    expect(result.beats).toContainEqual({ type: 'economy/bought', shop: 'post', item: 'lamp', price: 20 });
    expect(coin(result.state)).toBe(30);
    expect(purse(result.state)).toBe(50);
    expect(hilds(result.state, 'lamp')).toBe(0);
    expect(fact(result.state, 'inventory.count', { item: 'lamp' })).toBe(1);
    // The whole purse kept once it changes, as a bag is.
    expect((result.state.economy as { purses: unknown }).purses).toEqual({ hild: { coin: 50, shell: 2 } });
    expect(offered(result.state, 'economy/buy')).toEqual(['bread', 'candle']);
    expect(refusal(result.state, { type: 'economy/buy', item: 'lamp' })).toBe('sold-out');
  });

  it('buys into their bag from their purse, and what was sold can be bought back', () => {
    let state = trading(given(start(), { effect: 'give-item', item: 'candle' }));
    expect(offered(state, 'economy/sell')).toEqual(['candle']);
    state = step(state, { type: 'economy/sell', item: 'candle' });
    expect(coin(state)).toBe(52);
    expect(purse(state)).toBe(28);
    expect(hilds(state, 'candle')).toBe(3);
    state = step(state, { type: 'economy/buy', item: 'candle' });
    expect(coin(state)).toBe(48);
    expect(purse(state)).toBe(32);
  });

  it('refuses what they can’t pay for, and what their bag has no room for', () => {
    let state = trading(
      given(start(), { effect: 'give-item', item: 'lamp', count: 4 }, { effect: 'give-item', item: 'bread' }),
    );
    for (let i = 0; i < 3; i++) state = step(state, { type: 'economy/sell', item: 'lamp' });
    expect(purse(state)).toBe(0);
    expect(refusal(state, { type: 'economy/sell', item: 'lamp' })).toBe('cant-pay');
    expect(offered(state, 'economy/sell')).toEqual([]);
    // Bread fits three, and Hild carries three.
    expect(
      refusal(trading(given(start(), { effect: 'give-item', item: 'bread' })), { type: 'economy/sell', item: 'bread' }),
    ).toBe('no-room');
  });

  it('keeps a purse within its resource’s bounds, the rest lost', () => {
    const capped = {
      content: createRecordStore({ ...RECORDS, resource: { coin: { name: 'Coin', start: 50, max: 50 } } }),
    };
    const go = (state: GameState, action: Parameters<typeof game.reduce>[1]) => {
      const result = game.reduce(state, action, capped);
      expect(result.accepted).toBe(true);
      return result.state;
    };
    let state = go(game.init('post', capped), { type: 'yard/trade' });
    state = go(state, { type: 'economy/buy', item: 'lamp' });
    state = go(state, { type: 'economy/buy', item: 'candle' });
    expect((state.economy as { purses: unknown }).purses).toEqual({ hild: { coin: 50, shell: 2 } });
  });

  it('restocks their bag and purse once its days have passed, what was sold to them gone', () => {
    let state = trading(given(start(), { effect: 'give-item', item: 'rope' }));
    state = step(state, { type: 'economy/sell', item: 'rope' });
    state = step(state, { type: 'economy/buy', item: 'lamp' });
    state = step(state, { type: 'economy/leave' });
    for (let day = 0; day < 2; day++) state = step(state, { type: 'yard/wait' });
    // Two days on, nothing has changed.
    let again = trading(state);
    expect(hilds(again, 'rope')).toBe(1);
    expect(purse(again)).toBe(45);
    state = step(state, { type: 'yard/wait' });
    again = trading(state);
    expect(hilds(again, 'rope')).toBe(0);
    expect(hilds(again, 'lamp')).toBe(1);
    expect(hilds(again, 'candle')).toBe(2);
    expect(purse(again)).toBe(30);
    expect(again.economy).toMatchObject({ purses: {} });
  });

  it('prices by their faction when the shop names none', () => {
    const friendly = given(start(), { effect: 'change-standing', faction: 'valley', by: 5 });
    expect(fact(trading(friendly), 'economy.price', { shop: 'post', item: 'lamp' })).toBe(16);
  });
});
