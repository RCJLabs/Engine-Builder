import { createRecordStore, type GameState } from '@eb/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { gameWith, kitted, RECORDS } from '../../test/barracks.ts';
import type { StatsSlice } from './types.ts';
import { settle, statParts } from './values.ts';

const { apply, attempt, fact, game, sim, start } = kitted;
const value = (state: GameState, actor: string, stat: string) => fact(state, 'stats.value', { actor, stat });
const current = (state: GameState, actor: string, stat: string) => fact(state, 'stats.current', { actor, stat });
const slice = (state: GameState) => state.stats as { actors: Record<string, unknown> };

describe('a value', () => {
  it('is the actor’s base, or the stat’s start, with its statuses’ adds and percents', () => {
    const state = start();
    // Ana's record gives aim 70, and her steady status adds 5.
    expect(value(state, 'ana', 'aim')).toBe(75);
    // Bo gives no aim: the stat's start, 50, with his pistol's 4.
    expect(value(state, 'bo', 'aim')).toBe(54);
    expect(value(state, 'ana', 'speed')).toBe(4);
    expect(slice(state)).toEqual({ actors: {} });
  });

  it('adds, then takes every percent at once, rounded once to the nearest, halves up', () => {
    const health = RECORDS.stat.health;
    expect(settle(health, 12, 20)).toBe(14);
    expect(settle(health, 10, 25)).toBe(13);
    expect(settle(health, 3, -50)).toBe(2);
    expect(settle(RECORDS.stat.grit, -5, -50)).toBe(-2);
    expect(settle(RECORDS.stat.grit, -3, -50)).toBe(-1);
    // Kept within the stat's bounds: health is 0 to 100.
    expect(settle(health, 90, 50)).toBe(100);
    expect(settle(health, 10, -200)).toBe(0);
  });

  it('rounds as whole-number division would, halves up, for any sum and percent', () => {
    // Worked another way: n = sum × (100 + percent), split into hundreds and the rest.
    const reference = (sum: number, percent: number) => {
      // 0 times a negative is -0 in JavaScript, which toBe tells from the 0 a BigInt gives.
      const n = sum * (100 + percent) || 0;
      const rest = ((n % 100) + 100) % 100;
      const hundreds = (n - rest) / 100;
      return rest >= 50 ? hundreds + 1 : hundreds;
    };
    const wide = { min: -1e9, max: 1e9 };
    fc.assert(
      fc.property(fc.integer({ min: -1e6, max: 1e6 }), fc.integer({ min: -300, max: 300 }), (sum, percent) => {
        expect(settle(wide, sum, percent)).toBe(reference(sum, percent));
      }),
    );
  });

  it('is the same whatever order its parts come in, and their sum rounded once', () => {
    const state = apply(
      start(),
      { effect: 'give-item', item: 'vest' },
      { effect: 'add-status', actor: 'ana', status: 'bleeding', stacks: 2 },
      { effect: 'equip', actor: 'ana', item: 'vest' },
    );
    const parts = statParts(sim.content, state.stats as StatsSlice, 'ana', 'speed');
    expect(parts.base).toBe(4);
    // Bleeding twice: -25% each; the vest's +50% comes from the gear kit, not here.
    expect(parts.parts).toEqual([{ kind: 'status', id: 'bleeding', add: 0, percent: -50 }]);
    expect(parts.value).toBe(2);
    // With the vest: 4 × (100 - 50 + 50) / 100 = 4.
    expect(value(state, 'ana', 'speed')).toBe(4);
  });

  it('has no part for a status taken off, though the actor’s record lists it', () => {
    const aimParts = (state: GameState) => statParts(sim.content, state.stats as StatsSlice, 'ana', 'aim').parts;
    expect(aimParts(start())).toEqual([{ kind: 'status', id: 'steady', add: 5, percent: 0 }]);
    expect(aimParts(apply(start(), { effect: 'remove-status', actor: 'ana', status: 'steady' }))).toEqual([]);
  });
});

describe('damage', () => {
  it('takes from what is left, never below the stat’s min, and says when it runs out', () => {
    const hurt = attempt(start(), { effect: 'damage-stat', actor: 'ana', stat: 'health', by: 4 });
    expect(current(hurt.state, 'ana', 'health')).toBe(6);
    expect(value(hurt.state, 'ana', 'health')).toBe(10);
    expect(hurt.beats).toContainEqual({ type: 'stats/damaged', actor: 'ana', stat: 'health', by: 4 });
    const down = attempt(hurt.state, { effect: 'damage-stat', actor: 'ana', stat: 'health', by: 9 });
    expect(current(down.state, 'ana', 'health')).toBe(0);
    expect(down.beats).toContainEqual({ type: 'stats/damaged', actor: 'ana', stat: 'health', by: 6 });
    expect(down.beats).toContainEqual({ type: 'stats/emptied', actor: 'ana', stat: 'health' });
    const again = attempt(down.state, { effect: 'damage-stat', actor: 'ana', stat: 'health', by: 1 });
    expect(again.beats.some((b) => b.type === 'stats/damaged' || b.type === 'stats/emptied')).toBe(false);
  });

  it('stops at a min other than 0, above it or below it', () => {
    // Speed's min is 1: of a hit of 10, the 3 above it land, and healing 1 leaves 2.
    const slowed = attempt(start(), { effect: 'damage-stat', actor: 'ana', stat: 'speed', by: 10 });
    expect(current(slowed.state, 'ana', 'speed')).toBe(1);
    expect(slowed.beats).toContainEqual({ type: 'stats/damaged', actor: 'ana', stat: 'speed', by: 3 });
    expect(slowed.beats).toContainEqual({ type: 'stats/emptied', actor: 'ana', stat: 'speed' });
    expect(
      current(apply(slowed.state, { effect: 'heal-stat', actor: 'ana', stat: 'speed', by: 1 }), 'ana', 'speed'),
    ).toBe(2);
    // Grit's min is -10, where Ana starts: raised to -5, a hit of 10 takes the 5 above it.
    const raised = apply(start(), { effect: 'add-to-stat', actor: 'ana', stat: 'grit', by: 5 });
    const shaken = attempt(raised, { effect: 'damage-stat', actor: 'ana', stat: 'grit', by: 10 });
    expect(current(shaken.state, 'ana', 'grit')).toBe(-10);
    expect(shaken.beats).toContainEqual({ type: 'stats/damaged', actor: 'ana', stat: 'grit', by: 5 });
  });

  it('and healing come in whole numbers of 1 or more, as do stacks: validation stops the rest in content', () => {
    for (const by of [0, -1, 1.5]) {
      expect(() => apply(start(), { effect: 'damage-stat', actor: 'ana', stat: 'health', by })).toThrow(
        'damage-stat: "by" is a whole number, 1 or more',
      );
      expect(() => apply(start(), { effect: 'heal-stat', actor: 'ana', stat: 'health', by })).toThrow(
        'heal-stat: "by" is a whole number, 1 or more',
      );
    }
    for (const effect of ['add-status', 'remove-status']) {
      expect(() => apply(start(), { effect, actor: 'bo', status: 'bleeding', stacks: 0 })).toThrow(
        `${effect}: "stacks" is a whole number, 1 or more`,
      );
    }
  });

  it('is kept apart, so a maximum that rises raises what is left by as much (D41)', () => {
    let state = apply(start(), { effect: 'damage-stat', actor: 'ana', stat: 'health', by: 3 });
    expect(current(state, 'ana', 'health')).toBe(7);
    state = apply(state, { effect: 'add-status', actor: 'ana', status: 'hale' });
    expect(value(state, 'ana', 'health')).toBe(15);
    expect(current(state, 'ana', 'health')).toBe(12);
    // Hale off: down by as much, the damage still there.
    state = apply(state, { effect: 'remove-status', actor: 'ana', status: 'hale' });
    expect(current(state, 'ana', 'health')).toBe(7);
  });

  it('keeps what a fallen maximum would lose, never going below the min', () => {
    let state = apply(
      start(),
      { effect: 'add-status', actor: 'ana', status: 'hale' },
      { effect: 'damage-stat', actor: 'ana', stat: 'health', by: 13 },
    );
    expect(current(state, 'ana', 'health')).toBe(2);
    state = apply(state, { effect: 'remove-status', actor: 'ana', status: 'hale' });
    expect(current(state, 'ana', 'health')).toBe(0);
    // Healing 2 of the 13 leaves 11, still past the 10 there is.
    state = apply(state, { effect: 'heal-stat', actor: 'ana', stat: 'health', by: 2 });
    expect(current(state, 'ana', 'health')).toBe(0);
    state = apply(state, { effect: 'heal-stat', actor: 'ana', stat: 'health', by: 4 });
    expect(current(state, 'ana', 'health')).toBe(3);
  });

  it('heals, all of it when `by` is left out, saying by how much, and leaves no zero behind', () => {
    const hurt = apply(start(), { effect: 'damage-stat', actor: 'bo', stat: 'health', by: 5 });
    const some = attempt(hurt, { effect: 'heal-stat', actor: 'bo', stat: 'health', by: 2 });
    expect(current(some.state, 'bo', 'health')).toBe(9);
    expect(some.beats).toContainEqual({ type: 'stats/healed', actor: 'bo', stat: 'health', by: 2 });
    const all = attempt(some.state, { effect: 'heal-stat', actor: 'bo', stat: 'health' });
    expect(current(all.state, 'bo', 'health')).toBe(12);
    expect(all.beats).toContainEqual({ type: 'stats/healed', actor: 'bo', stat: 'health', by: 3 });
    expect(slice(all.state)).toEqual({ actors: {} });
    const none = attempt(all.state, { effect: 'heal-stat', actor: 'bo', stat: 'health' });
    expect(none.beats.some((b) => b.type === 'stats/healed')).toBe(false);
  });

  it('previews what is left before and after', () => {
    const hurt = apply(start(), { effect: 'damage-stat', actor: 'ana', stat: 'health', by: 4 });
    expect(
      game.preview(
        hurt,
        [
          { effect: 'damage-stat', actor: 'ana', stat: 'health', by: 9 },
          { effect: 'heal-stat', actor: 'ana', stat: 'health', by: 1 },
          { effect: 'heal-stat', actor: 'ana', stat: 'health' },
        ],
        sim,
      ),
    ).toEqual([
      { effect: 'damage-stat', actor: 'ana', stat: 'health', from: 6, to: 0 },
      { effect: 'heal-stat', actor: 'ana', stat: 'health', from: 6, to: 7 },
      { effect: 'heal-stat', actor: 'ana', stat: 'health', from: 6, to: 10 },
    ]);
  });
});

describe('a base', () => {
  it('grows and shrinks with add-to-stat, saying so, and leaves the slice at 0', () => {
    const grown = attempt(start(), { effect: 'add-to-stat', actor: 'ana', stat: 'aim', by: 6 });
    expect(value(grown.state, 'ana', 'aim')).toBe(81);
    expect(grown.beats).toContainEqual({ type: 'stats/base-changed', actor: 'ana', stat: 'aim', by: 6 });
    expect(game.preview(grown.state, [{ effect: 'add-to-stat', actor: 'ana', stat: 'aim', by: -6 }], sim)).toEqual([
      { effect: 'add-to-stat', actor: 'ana', stat: 'aim', from: 81, to: 75 },
    ]);
    const back = apply(grown.state, { effect: 'add-to-stat', actor: 'ana', stat: 'aim', by: -6 });
    expect(slice(back)).toEqual({ actors: {} });
  });

  it('is read from content each time, so a content update reaches a save', () => {
    const raised = apply(start(), { effect: 'add-to-stat', actor: 'ana', stat: 'aim', by: 2 });
    const updated = createRecordStore({
      ...RECORDS,
      actor: { ...RECORDS.actor, ana: { ...RECORDS.actor.ana, stats: { health: 10, aim: 80 } } },
    } as never);
    expect(game.fact(raised, 'stats.value', { actor: 'ana', stat: 'aim' }, { content: updated })).toBe(87);
  });
});

describe('the stats kit without gear', () => {
  it('reads no gear, and its game has no gear facts or effects', () => {
    const alone = gameWith(false);
    const state = alone.start();
    // Bo's record wears a pistol, which nothing reads without the gear kit.
    expect(alone.fact(state, 'stats.value', { actor: 'bo', stat: 'aim' })).toBe(50);
    expect(() => alone.fact(state, 'gear.add', { actor: 'bo', stat: 'aim' })).toThrow('Unknown fact "gear.add"');
  });
});
