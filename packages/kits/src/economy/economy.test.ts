import { createRecordStore, type GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { apply, fact, game, RECORDS, sim, start } from '../../test/market.ts';

const amount = (state: GameState, resource: string) => fact(state, 'economy.amount', { resource });
const tryEffects = (state: GameState, ...effects: Record<string, unknown>[]) =>
  game.reduce(state, { type: 'town/do', effects }, sim);

describe('resources', () => {
  it('start at their start, and keep only what differs from it', () => {
    const state = start();
    expect(amount(state, 'credits')).toBe(60);
    expect(amount(state, 'fuel')).toBe(3);
    expect(state.economy).toEqual({ amounts: {}, shops: {}, purses: {} });
    const spent = apply(state, { effect: 'add-resource', resource: 'credits', by: -10 });
    expect((spent.economy as { amounts: object }).amounts).toEqual({ credits: 50 });
    const back = apply(spent, { effect: 'add-resource', resource: 'credits', by: 10 });
    expect((back.economy as { amounts: object }).amounts).toEqual({});
  });

  it('lose what passes the highest, and say by how much they really changed', () => {
    const result = tryEffects(start(), { effect: 'add-resource', resource: 'fuel', by: 4 });
    expect(amount(result.state, 'fuel')).toBe(5);
    expect(result.beats).toContainEqual({ type: 'economy/changed', resource: 'fuel', by: 2 });
    const none = tryEffects(result.state, { effect: 'add-resource', resource: 'fuel', by: 1 });
    expect(none.beats.some((b) => b.type === 'economy/changed')).toBe(false);
  });

  it('refuse to go below the lowest, as a cost the party can’t meet', () => {
    const result = tryEffects(start(), { effect: 'add-resource', resource: 'credits', by: -61 });
    expect(result.accepted).toBe(false);
    expect(result.beats[0]).toMatchObject({ reason: 'not-enough', resource: 'credits', have: 60, need: 61 });
  });

  it('pay a cost all or none, naming the first resource short by id', () => {
    const paid = apply(start(), { effect: 'pay-cost', cost: { fuel: 1, credits: 10 } });
    expect(amount(paid, 'credits')).toBe(50);
    expect(amount(paid, 'fuel')).toBe(2);
    const short = tryEffects(start(), { effect: 'pay-cost', cost: { fuel: 4, credits: 100 } });
    expect(short.accepted).toBe(false);
    expect(short.beats[0]).toMatchObject({ reason: 'cant-afford', resource: 'credits', have: 60, need: 100 });
    expect(game.preview(start(), [{ effect: 'pay-cost', cost: { fuel: 4 } }], sim)).toEqual([
      { effect: 'pay-cost', cost: { fuel: 4 }, afford: false },
    ]);
  });

  it('pay a cost of all the party holds, down to the lowest exactly', () => {
    const paid = apply(start(), { effect: 'pay-cost', cost: { credits: 60, fuel: 3 } });
    expect(amount(paid, 'credits')).toBe(0);
    expect(amount(paid, 'fuel')).toBe(0);
    expect(game.preview(start(), [{ effect: 'pay-cost', cost: { credits: 60 } }], sim)).toEqual([
      { effect: 'pay-cost', cost: { credits: 60 }, afford: true },
    ]);
  });

  it('read within today’s bounds, so a content update to them reaches a save', () => {
    const rich = apply(start(), { effect: 'add-resource', resource: 'credits', by: 100 });
    const capped = createRecordStore({
      ...RECORDS,
      resource: { ...RECORDS.resource, credits: { start: 60, max: 120 } },
    });
    expect(game.fact(rich, 'economy.amount', { resource: 'credits' }, { content: capped })).toBe(120);
  });

  it('preview a change as it would land, a refusal included', () => {
    expect(
      game.preview(
        start(),
        [
          { effect: 'add-resource', resource: 'fuel', by: 9 },
          { effect: 'add-resource', resource: 'credits', by: -70 },
        ],
        sim,
      ),
    ).toEqual([
      { effect: 'add-resource', resource: 'fuel', from: 3, to: 5 },
      { effect: 'add-resource', resource: 'credits', from: 60, to: 60, refused: 'not-enough' },
    ]);
  });
});
