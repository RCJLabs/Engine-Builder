import { readFileSync } from 'node:fs';
import { createRecordStore, type GameState, loadSave } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { game as market, RECORDS } from '../../test/market.ts';
import { fact, game, refusal, sim, start, step } from '../../test/post.ts';

const opened = (object: string) => step(start(), { type: 'yard/open', object });
// In the order the mode lists its actions: take, put, take-all, close.
const ORDER = ['inventory/take', 'inventory/put', 'inventory/take-all', 'inventory/close'];
const offered = (state: GameState) =>
  game
    .options(state, sim)
    .toSorted((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
    .map((a) => `${a.type}:${String(a.item ?? '')}`);
const held = (state: GameState, object: string, item: string) =>
  fact(state, 'inventory.held', { space: 'yard', object, item });
const bag = (state: GameState, item: string) => fact(state, 'inventory.count', { item });

describe('a container', () => {
  it('opens the container mode on its items, raising opened', () => {
    const result = game.reduce(start(), { type: 'yard/open', object: 'chest' }, sim);
    expect(result.beats).toContainEqual({ type: 'inventory/opened', space: 'yard', object: 'chest' });
    expect(result.state.kernel.modes.at(-1)).toEqual({ id: 'container', data: { space: 'yard', object: 'chest' } });
    expect(offered(result.state)).toEqual([
      'inventory/take:bread',
      'inventory/take:candle',
      'inventory/take-all:',
      'inventory/close:',
    ]);
  });

  it('is the pack’s until it changes, then the slice’s', () => {
    const state = opened('chest');
    expect(held(state, 'chest', 'bread')).toBe(2);
    expect(state.inventory).toMatchObject({ held: {} });
    const taken = step(state, { type: 'inventory/take', item: 'bread', count: 1 });
    expect(taken.inventory).toMatchObject({ held: { 'yard/chest': { bread: 1, candle: 1 } } });
    expect(bag(taken, 'bread')).toBe(1);
    expect(held(taken, 'chest', 'bread')).toBe(1);
  });

  it('takes a whole line, raising took and gained', () => {
    const result = game.reduce(opened('chest'), { type: 'inventory/take', item: 'candle' }, sim);
    expect(result.beats).toEqual([
      { type: 'inventory/gained', item: 'candle', count: 1 },
      { type: 'inventory/took', space: 'yard', object: 'chest', item: 'candle', count: 1 },
    ]);
    expect(held(result.state, 'chest', 'candle')).toBe(0);
    expect(offered(result.state)).not.toContain('inventory/take:candle');
  });

  it('takes only what fits, and refuses full when none does', () => {
    // Bread fits three: with two carried, one of the chest's two comes out.
    let state = step(start(), { type: 'yard/do', effects: [{ effect: 'give-item', item: 'bread', count: 2 }] });
    state = step(state, { type: 'yard/open', object: 'chest' });
    state = step(state, { type: 'inventory/take', item: 'bread' });
    expect(bag(state, 'bread')).toBe(3);
    expect(held(state, 'chest', 'bread')).toBe(1);
    expect(refusal(state, { type: 'inventory/take', item: 'bread' })).toBe('full');
    expect(offered(state)).toEqual([
      'inventory/take:candle',
      'inventory/put:bread',
      'inventory/take-all:',
      'inventory/close:',
    ]);
  });

  it('takes every line that fits with take-all, and refuses none once it is empty', () => {
    const all = step(opened('chest'), { type: 'inventory/take-all' });
    expect(bag(all, 'bread')).toBe(2);
    expect(bag(all, 'candle')).toBe(1);
    expect(all.inventory).toMatchObject({ held: { 'yard/chest': {} } });
    expect(refusal(all, { type: 'inventory/take-all' })).toBe('none');
    expect(offered(all)).toEqual(['inventory/put:bread', 'inventory/put:candle', 'inventory/close:']);
  });

  it('takes nothing that is not there', () => {
    expect(refusal(opened('chest'), { type: 'inventory/take', item: 'lamp' })).toBe('none');
    expect(refusal(opened('barrel'), { type: 'inventory/take', item: 'bread' })).toBe('none');
  });

  it('puts the party’s line, or count of it, into an empty barrel', () => {
    let state = step(start(), { type: 'yard/do', effects: [{ effect: 'give-item', item: 'lamp', count: 2 }] });
    state = step(state, { type: 'yard/open', object: 'barrel' });
    expect(offered(state)).toEqual(['inventory/put:lamp', 'inventory/close:']);
    const result = game.reduce(state, { type: 'inventory/put', item: 'lamp', count: 1 }, sim);
    expect(result.beats).toEqual([
      { type: 'inventory/lost', item: 'lamp', count: 1 },
      { type: 'inventory/put', space: 'yard', object: 'barrel', item: 'lamp', count: 1 },
    ]);
    expect(held(result.state, 'barrel', 'lamp')).toBe(1);
    expect(bag(result.state, 'lamp')).toBe(1);
    expect(refusal(result.state, { type: 'inventory/put', item: 'candle' })).toBe('none');
  });

  it('closes back to the mode it opened from, raising closed', () => {
    const result = game.reduce(opened('chest'), { type: 'inventory/close' }, sim);
    expect(result.beats).toEqual([
      { type: 'mode', modes: ['yard'] },
      { type: 'inventory/closed', space: 'yard', object: 'chest' },
    ]);
    expect(result.state.kernel.modes.at(-1)?.id).toBe('yard');
  });

  it('is as it was left when opened again', () => {
    const state = step(opened('chest'), { type: 'inventory/take', item: 'candle' });
    const again = step(step(state, { type: 'inventory/close' }), { type: 'yard/open', object: 'chest' });
    expect(offered(again)).toEqual([
      'inventory/take:bread',
      'inventory/put:candle',
      'inventory/take-all:',
      'inventory/close:',
    ]);
  });
});

// The market with the smith and the ferry-keeper it was saved with (M6.1's bags.test.ts).
const marketSim = {
  content: createRecordStore({
    ...RECORDS,
    actor: { smith: { name: 'Smith', carries: { reactor: 1, medkit: 2 } }, ferry: { name: 'Ferry-keeper' } },
  }),
};
// Saved by the inventory kit at version 2 (M6.1 to M6.7) and the economy kit at version 1.
const V2 = JSON.parse(
  readFileSync(new URL('../../test/fixtures/saves/market-inventory-v2.json', import.meta.url), 'utf8'),
);

describe('a save made by the inventory kit’s version 2', () => {
  it('loads, migrated, every bag as it was and no container changed', () => {
    const loaded = loadSave(market, V2, marketSim, { game: 'market', build: 'fixture-inventory-v2' });
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.report.migrated).toEqual([
      { module: 'inventory', from: 2, to: 3 },
      { module: 'economy', from: 1, to: 2 },
    ]);
    expect(loaded.state.inventory).toEqual({
      bag: { medkit: 2 },
      bags: { smith: { reactor: 1, medkit: 1 }, ferry: { corridor: 2 } },
      held: {},
    });
    expect(loaded.state.economy).toMatchObject({ amounts: { credits: 30 }, purses: {} });
  });
});
