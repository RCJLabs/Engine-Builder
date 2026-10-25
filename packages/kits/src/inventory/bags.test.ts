/**
 * Actors' bags (M6.1, D73, docs/specs/npcs.md#bags): the market with a smith and a ferry-keeper, each
 * bag its `carries` until something in it changes and the slice's from then on; give, take and roll
 * naming an actor; the fact that reads one; and a save made by the kit's version 1, which must load.
 */
import { readFileSync } from 'node:fs';
import { createRecordStore, type Effect, type GameState, loadSave, type SimContext } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { game, sim as marketSim, RECORDS, start } from '../../test/market.ts';
import type { InventorySlice } from './types.ts';

const ACTORS = {
  smith: { name: 'Smith', carries: { reactor: 1, medkit: 2 } },
  ferry: { name: 'Ferry-keeper' },
};
const sim: SimContext = { content: createRecordStore({ ...RECORDS, actor: ACTORS }) };

const slice = (state: GameState) => state.inventory as InventorySlice;
const run = (state: GameState, ...effects: Effect[]) => game.reduce(state, { type: 'town/do', effects }, sim);
const apply = (state: GameState, ...effects: Effect[]) => {
  const result = run(state, ...effects);
  if (!result.accepted) throw new Error(`Refused: ${JSON.stringify(result.beats[0])}`);
  return result;
};
const carried = (state: GameState, actor: string, item: string, using = sim) =>
  game.fact(state, 'inventory.carried', { actor, item }, using);

describe('an actor’s bag', () => {
  it('is what the actor carries until anything in it changes, the party’s bag apart', () => {
    const state = start();
    expect(slice(state)).toEqual({ bag: {}, bags: {} });
    expect(carried(state, 'smith', 'medkit')).toBe(2);
    expect(carried(state, 'ferry', 'medkit')).toBe(0);
    const taken = apply(state, { effect: 'take-item', actor: 'smith', item: 'medkit' });
    expect(slice(taken.state)).toEqual({ bag: {}, bags: { smith: { reactor: 1, medkit: 1 } } });
    expect(taken.beats).toContainEqual({ type: 'inventory/actor-lost', actor: 'smith', item: 'medkit', count: 1 });
    const given = apply(taken.state, { effect: 'give-item', item: 'medkit' });
    expect(slice(given.state).bag).toEqual({ medkit: 1 });
    expect(given.beats).toContainEqual({ type: 'inventory/gained', item: 'medkit', count: 1 });
  });

  it('keeps a changed bag whole, so a content update to carries reaches only bags never changed', () => {
    const changed = apply(start(), { effect: 'give-item', actor: 'ferry', item: 'corridor' }).state;
    const updated: SimContext = {
      content: createRecordStore({
        ...RECORDS,
        actor: { smith: { carries: { airlock: 3 } }, ferry: { carries: { junk: 1 } } },
      }),
    };
    expect(carried(changed, 'smith', 'airlock', updated)).toBe(3);
    expect(carried(changed, 'ferry', 'junk', updated)).toBe(0);
    expect(carried(changed, 'ferry', 'corridor', updated)).toBe(1);
  });

  it('refuses a take the actor’s bag can’t pay, naming whose, and holds an item’s most for each bag', () => {
    const refused = run(start(), { effect: 'take-item', actor: 'ferry', item: 'medkit' });
    expect(refused.accepted).toBe(false);
    expect(refused.beats[0]).toMatchObject({ reason: 'not-enough', actor: 'ferry', have: 0, need: 1 });
    const full = apply(start(), { effect: 'give-item', actor: 'smith', item: 'reactor', count: 3 });
    expect(carried(full.state, 'smith', 'reactor')).toBe(2);
    expect(full.beats).toContainEqual({ type: 'inventory/actor-full', actor: 'smith', item: 'reactor', lost: 2 });
    const both = apply(full.state, { effect: 'give-item', item: 'reactor', count: 2 }).state;
    expect(slice(both).bag).toEqual({ reactor: 2 });
  });

  it('rolls a table into the actor’s bag, its resources still the party’s, and previews say whose', () => {
    const rolled = apply(start('rolls'), { effect: 'roll-loot', actor: 'ferry', table: 'scrap-parts' }).state;
    expect(Object.values(slice(rolled).bags.ferry ?? {})).toEqual([1]);
    expect(slice(rolled).bag).toEqual({});
    const [take, give] = game.preview(
      start(),
      [
        { effect: 'take-item', actor: 'smith', item: 'medkit' },
        { effect: 'give-item', item: 'medkit' },
      ],
      sim,
    );
    expect(take).toMatchObject({ actor: 'smith', from: 2, to: 1 });
    expect(give).not.toHaveProperty('actor');
  });

  it('throws for an actor content hasn’t: validation stops a reference to one', () => {
    expect(() => run(start(), { effect: 'give-item', actor: 'nobody', item: 'medkit' })).toThrow('No actor "nobody"');
  });
});

// Saved by the inventory kit at version 1 (M3.3 to M5.10): medkits given and one taken, three reactors
// given where two fit, and a corridor.
const V1 = JSON.parse(
  readFileSync(new URL('../../test/fixtures/saves/market-inventory-v1.json', import.meta.url), 'utf8'),
);

describe('a save made by the inventory kit’s version 1', () => {
  it('loads, migrated, the party’s bag as it was and every actor’s its carries', () => {
    const loaded = loadSave(game, V1, marketSim, { game: 'market', build: 'fixture-inventory-v1' });
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.report.migrated).toEqual([{ module: 'inventory', from: 1, to: 2 }]);
    expect(loaded.report).toMatchObject({ replayed: 4, skipped: 0 });
    expect(slice(loaded.state)).toEqual({ bag: { medkit: 1, reactor: 2, corridor: 1 }, bags: {} });
    expect(carried(loaded.state, 'smith', 'medkit')).toBe(2);
  });

  it('plays on: the party’s bag goes on from where it was, and an actor’s bag changes', () => {
    const loaded = loadSave(game, V1, marketSim, { game: 'market', build: 'fixture-inventory-v1' });
    if (!loaded.ok) throw new Error(loaded.message);
    const next = apply(
      loaded.state,
      { effect: 'take-item', item: 'reactor' },
      { effect: 'give-item', actor: 'smith', item: 'reactor' },
    ).state;
    expect(slice(next)).toEqual({
      bag: { medkit: 1, reactor: 1, corridor: 1 },
      bags: { smith: { reactor: 2, medkit: 2 } },
    });
  });
});
