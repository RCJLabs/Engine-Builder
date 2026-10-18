import { type Action, createRecordStore, type GameState, Rng } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { apply, fact, game, RECORDS, sim, start, step } from '../../test/market.ts';

const visit = (state: GameState, shop = 'dutch') => step(state, { type: 'town/visit', shop });
const shelf = (state: GameState, shop = 'dutch') =>
  (state.economy as { shops: Record<string, { shelf: { item: string; left: number }[]; day?: number }> }).shops[shop];
const credits = (state: GameState) => fact(state, 'economy.amount', { resource: 'credits' }) as number;
const bag = (state: GameState) => (state.inventory as { bag: Record<string, number> }).bag;
const rich = (state: GameState) => apply(state, { effect: 'add-resource', resource: 'credits', by: 1000 });

describe('shops', () => {
  it('stock the shelf when first opened: the items as written, then what the table draws', () => {
    const state = visit(start('stock'));
    const { shelf: items } = shelf(state) as { shelf: { item: string; left: number }[] };
    expect(items[0]).toMatchObject({ item: 'medkit' });
    // Two different picks from the table, a medkit adding to the first.
    const drawn = items.reduce((sum, s) => sum + s.left, 0) - 2;
    expect(drawn).toBe(2);
    expect(state.kernel.modes.at(-1)).toEqual({ id: 'shopping', data: { shop: 'dutch' } });
    expect(Object.keys(state.kernel.streams)).toContain('economy/stock-dutch');
  });

  it('open one at a time', () => {
    const state = visit(start());
    const again = game.reduce(state, { type: 'economy/buy', item: 'nothing' }, sim);
    expect(again.accepted).toBe(false);
    expect(game.allowedActions(state)).toEqual(['economy/buy', 'economy/leave', 'economy/sell']);
    // An effect that opens a second while one is open is refused, naming the open one.
    const twice = game.reduce(
      start(),
      {
        type: 'town/do',
        effects: [
          { effect: 'open-shop', shop: 'dutch' },
          { effect: 'open-shop', shop: 'picky' },
        ],
      },
      sim,
    );
    expect(twice.accepted).toBe(false);
    expect(twice.beats[0]).toMatchObject({ reason: 'already-shopping', shop: 'dutch' });
  });

  it('put a second draw of an item with the first on the shelf, as one more of it', () => {
    const records = {
      ...RECORDS,
      'loot-table': { ...RECORDS['loot-table'], medkits: { entries: [{ item: 'medkit', weight: 1 }] } },
      shop: {
        ...RECORDS.shop,
        clinic: { currency: 'credits', stock: { items: [{ item: 'medkit', count: 2 }], table: 'medkits' } },
      },
    };
    const content = createRecordStore(records);
    const opened = game.reduce(
      start(),
      { type: 'town/do', effects: [{ effect: 'open-shop', shop: 'clinic' }] },
      { content },
    ).state;
    expect(game.fact(opened, 'economy.stock', { shop: 'clinic', item: 'medkit' }, { content })).toBe(3);
  });

  it('keep their shelf between visits, and stock again once `every` days have passed', () => {
    let state = visit(start('restock'));
    const first = shelf(state);
    expect(first?.day).toBe(0);
    state = step(state, { type: 'economy/leave' });
    state = visit(step(state, { type: 'town/wait' }));
    expect(shelf(state)).toEqual(first);
    state = step(state, { type: 'economy/leave' });
    state = visit(step(state, { type: 'town/wait' }));
    expect(shelf(state)?.day).toBe(2);
  });

  it('never stock again without `every`: what is sold out stays gone', () => {
    let state = visit(rich(start()), 'picky');
    expect(shelf(state, 'picky')?.shelf).toEqual([{ item: 'corridor', left: 1 }]);
    state = step(state, { type: 'economy/buy', item: 'corridor' });
    expect(shelf(state, 'picky')?.shelf).toEqual([]);
    for (let i = 0; i < 5; i++)
      state = step(step(step(state, { type: 'economy/leave' }), { type: 'town/wait' }), {
        type: 'town/visit',
        shop: 'picky',
      });
    expect(shelf(state, 'picky')?.shelf).toEqual([]);
  });

  it('charge exactly the price the fact shows, rules included', () => {
    let state = visit(rich(start('price')));
    const medkit = fact(state, 'economy.price', { shop: 'dutch', item: 'medkit' });
    expect(medkit).toBe(30);
    const before = credits(state);
    const bought = game.reduce(state, { type: 'economy/buy', item: 'medkit' }, sim);
    expect(credits(bought.state)).toBe(before - 30);
    expect(bought.beats).toContainEqual({ type: 'economy/bought', shop: 'dutch', item: 'medkit', price: 30 });
    expect(bag(bought.state)).toEqual({ medkit: 1 });
    expect(fact(bought.state, 'economy.stock', { shop: 'dutch', item: 'medkit' })).toBe(1);
    // Owing Dutch puts 20% on: the fact and the charge move together.
    state = step(bought.state, { type: 'economy/leave' });
    state = visit(apply(state, { effect: 'set-flag', flag: 'owes-dutch', to: true }));
    expect(fact(state, 'economy.price', { shop: 'dutch', item: 'medkit' })).toBe(35);
    const dearer = step(state, { type: 'economy/buy', item: 'medkit' });
    expect(credits(dearer)).toBe(credits(state) - 35);
  });

  it('refuse what they can’t sell, what the party can’t afford, and what won’t fit', () => {
    const poor = visit(start('refusals'));
    const reasons = (state: GameState, item: string) => game.reduce(state, { type: 'economy/buy', item }, sim).beats[0];
    expect(reasons(poor, 'junk')).toMatchObject({ reason: 'sold-out' });
    const broke = visit(apply(start('refusals'), { effect: 'add-resource', resource: 'credits', by: -40 }));
    expect(reasons(broke, 'medkit')).toMatchObject({ reason: 'cant-afford', price: 30, have: 20 });
    const records = {
      ...RECORDS,
      shop: { ...RECORDS.shop, reactors: { currency: 'credits', stock: { items: [{ item: 'reactor', count: 5 }] } } },
    };
    const store = createRecordStore(records);
    const run = (state: GameState, action: Action) => game.reduce(state, action, { content: store });
    let state = run(rich(start()), { type: 'town/visit', shop: 'reactors' }).state;
    state = run(state, { type: 'economy/buy', item: 'reactor' }).state;
    state = run(state, { type: 'economy/buy', item: 'reactor' }).state;
    expect(run(state, { type: 'economy/buy', item: 'reactor' }).beats[0]).toMatchObject({ reason: 'no-room' });
  });

  it('buy for a share of the value, never more than they sell it for, and only what they buy', () => {
    let state = apply(start('sell'), { effect: 'give-item', item: 'airlock' }, { effect: 'give-item', item: 'medkit' });
    state = visit(state);
    expect(fact(state, 'economy.offer', { shop: 'dutch', item: 'airlock' })).toBe(20);
    const sold = game.reduce(state, { type: 'economy/sell', item: 'airlock' }, sim);
    expect(credits(sold.state)).toBe(80);
    expect(sold.beats).toContainEqual({ type: 'economy/sold', shop: 'dutch', item: 'airlock', price: 20 });
    expect(game.reduce(sold.state, { type: 'economy/sell', item: 'airlock' }, sim).beats[0]).toMatchObject({
      reason: 'none-to-sell',
    });
    let picky = visit(step(sold.state, { type: 'economy/leave' }), 'picky');
    expect(fact(picky, 'economy.offer', { shop: 'picky', item: 'medkit' })).toBeUndefined();
    expect(game.reduce(picky, { type: 'economy/sell', item: 'medkit' }, sim).beats[0]).toMatchObject({
      reason: 'wont-buy',
    });
    picky = apply(step(picky, { type: 'economy/leave' }), { effect: 'give-item', item: 'reactor' });
    picky = visit(picky, 'picky');
    // 60% of 200, under the 150% it charges.
    expect(fact(picky, 'economy.offer', { shop: 'picky', item: 'reactor' })).toBe(120);
  });

  it('never pay more for an item than they would charge for it, whatever the rules', () => {
    const records = {
      ...RECORDS,
      shop: {
        ...RECORDS.shop,
        kind: {
          currency: 'credits',
          'buys-at': 100,
          buys: {},
          rules: [{ if: { fact: 'flag.on', args: { flag: 'owes-dutch' } }, percent: 50 }],
        },
      },
    };
    const store = createRecordStore(records);
    const owing = game.reduce(
      start(),
      { type: 'town/do', effects: [{ effect: 'set-flag', flag: 'owes-dutch', to: true }] },
      { content: store },
    ).state;
    expect(game.fact(owing, 'economy.offer', { shop: 'kind', item: 'reactor' }, { content: store })).toBe(100);
  });

  it('refuse a sale that would pass the currency’s highest', () => {
    const records = { ...RECORDS, resource: { ...RECORDS.resource, credits: { start: 60, max: 70, step: 5 } } };
    const store = createRecordStore(records);
    const run = (state: GameState, action: Action) => game.reduce(state, action, { content: store });
    let state = run(start(), { type: 'town/do', effects: [{ effect: 'give-item', item: 'airlock' }] }).state;
    state = run(state, { type: 'town/visit', shop: 'dutch' }).state;
    expect(run(state, { type: 'economy/sell', item: 'airlock' }).beats[0]).toMatchObject({ reason: 'purse-full' });
  });

  it('leave, back to the mode below', () => {
    const state = visit(start());
    const left = game.reduce(state, { type: 'economy/leave' }, sim);
    expect(left.state.kernel.modes.map((m) => m.id)).toEqual(['town']);
    expect(left.beats).toContainEqual({ type: 'economy/left', shop: 'dutch' });
  });

  it('offer only what they accept, and accept every buy and sale they offer', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const rng = Rng.create(`walk:${seed}`);
      let state = apply(
        rich(start(seed)),
        { effect: 'give-item', item: 'airlock', count: 3 },
        { effect: 'give-item', item: 'junk' },
      );
      for (let i = 0; i < 150; i++) {
        const offered = game.options(state, sim);
        const action =
          offered.length > 0 ? rng.pick(offered) : { type: 'town/visit', shop: rng.pick(['dutch', 'picky']) };
        const result = game.reduce(state, action, sim);
        expect(result.accepted, `${seed} step ${i}: ${JSON.stringify(action)}`).toBe(true);
        if (action.type === 'economy/buy') {
          const charged = credits(state) - credits(result.state);
          expect(charged).toBe(fact(state, 'economy.price', { shop: 'dutch', item: action.item }) ?? charged);
        }
        state = result.state;
      }
      // Every buy left off the list is one the shop refuses.
      if (state.kernel.modes.at(-1)?.id === 'shopping') {
        const offered = new Set(game.options(state, sim).map((a) => `${a.type}:${String(a.item)}`));
        for (const item of ['reactor', 'airlock', 'corridor', 'medkit', 'junk']) {
          const accepted = game.reduce(state, { type: 'economy/buy', item }, sim).accepted;
          expect(accepted, item).toBe(offered.has(`economy/buy:${item}`));
        }
      }
    }
  });
});
