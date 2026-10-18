import { createRecordStore } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { apply, fact, game, RECORDS, sim, start } from '../../test/market.ts';

const bag = (state: ReturnType<typeof start>) => (state.inventory as { bag: Record<string, number> }).bag;

describe('the inventory kit', () => {
  it('starts with an empty bag', () => {
    expect(bag(start())).toEqual({});
    expect(fact(start(), 'inventory.count', { item: 'medkit' })).toBe(0);
  });

  it('gives and takes, and says so', () => {
    const given = game.reduce(
      start(),
      { type: 'town/do', effects: [{ effect: 'give-item', item: 'medkit', count: 3 }] },
      sim,
    );
    expect(bag(given.state)).toEqual({ medkit: 3 });
    expect(given.beats).toContainEqual({ type: 'inventory/gained', item: 'medkit', count: 3 });
    const taken = game.reduce(
      given.state,
      { type: 'town/do', effects: [{ effect: 'take-item', item: 'medkit' }] },
      sim,
    );
    expect(bag(taken.state)).toEqual({ medkit: 2 });
    expect(taken.beats).toContainEqual({ type: 'inventory/lost', item: 'medkit', count: 1 });
  });

  it('takes the last one out of the bag, leaving no zero behind', () => {
    const state = apply(start(), { effect: 'give-item', item: 'airlock' }, { effect: 'take-item', item: 'airlock' });
    expect(bag(state)).toEqual({});
  });

  it('refuses to take more than the bag holds, with what it has and needs', () => {
    const state = apply(start(), { effect: 'give-item', item: 'medkit' });
    const result = game.reduce(
      state,
      { type: 'town/do', effects: [{ effect: 'take-item', item: 'medkit', count: 2 }] },
      sim,
    );
    expect(result.accepted).toBe(false);
    expect(result.beats).toEqual([
      { type: 'rejected', action: 'town/do', reason: 'not-enough', item: 'medkit', have: 1, need: 2 },
    ]);
  });

  it('keeps an item within its max: what does not fit is lost, and said to be', () => {
    const result = game.reduce(
      start(),
      { type: 'town/do', effects: [{ effect: 'give-item', item: 'reactor', count: 3 }] },
      sim,
    );
    expect(bag(result.state)).toEqual({ reactor: 2 });
    expect(result.beats).toContainEqual({ type: 'inventory/gained', item: 'reactor', count: 2 });
    expect(result.beats).toContainEqual({ type: 'inventory/full', item: 'reactor', lost: 1 });
    const again = game.reduce(
      result.state,
      { type: 'town/do', effects: [{ effect: 'give-item', item: 'reactor' }] },
      sim,
    );
    expect(again.beats.some((b) => b.type === 'inventory/gained')).toBe(false);
    expect(again.beats).toContainEqual({ type: 'inventory/full', item: 'reactor', lost: 1 });
  });

  it('counts items by tag, each one carried', () => {
    const state = apply(
      start(),
      { effect: 'give-item', item: 'reactor' },
      { effect: 'give-item', item: 'airlock', count: 2 },
      { effect: 'give-item', item: 'medkit' },
    );
    expect(fact(state, 'inventory.tagged', { tag: 'part' })).toBe(3);
    expect(fact(state, 'inventory.tagged', { tag: 'power' })).toBe(1);
    expect(fact(state, 'inventory.tagged', { tag: 'none' })).toBe(0);
  });

  it('previews a give and a take as they would land, refusals included', () => {
    const state = apply(start(), { effect: 'give-item', item: 'reactor' });
    expect(
      game.preview(
        state,
        [
          { effect: 'give-item', item: 'reactor', count: 4 },
          { effect: 'take-item', item: 'reactor' },
          { effect: 'take-item', item: 'medkit' },
        ],
        sim,
      ),
    ).toEqual([
      { effect: 'give-item', item: 'reactor', from: 1, to: 2, lost: 3 },
      { effect: 'take-item', item: 'reactor', from: 1, to: 0 },
      { effect: 'take-item', item: 'medkit', from: 0, to: 0, refused: 'not-enough' },
    ]);
  });

  it('throws on a count that is not a whole number of 1 or more: validation stops it in content', () => {
    for (const count of [0, -1, 1.5, '2']) {
      expect(() => apply(start(), { effect: 'give-item', item: 'medkit', count })).toThrow('"count" is a whole number');
    }
    expect(() => apply(start(), { effect: 'give-item', item: 'nothing-here' })).toThrow('No item "nothing-here"');
  });

  it('reads items from content each time, so a content update reaches a save', () => {
    const full = apply(start(), { effect: 'give-item', item: 'reactor', count: 2 });
    const reactor = { ...RECORDS.item.reactor, max: 3 };
    const raised = createRecordStore({ ...RECORDS, item: { ...RECORDS.item, reactor } });
    const effects = [{ effect: 'give-item', item: 'reactor' }];
    const result = game.reduce(full, { type: 'town/do', effects }, { content: raised });
    expect(bag(result.state)).toEqual({ reactor: 3 });
  });
});
