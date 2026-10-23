import type { GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { kitted } from '../../test/barracks.ts';
import type { GearSlice } from './types.ts';
import { gearParts } from './worn.ts';

const { apply, attempt, fact, game, sim, start } = kitted;
const bag = (state: GameState) => (state.inventory as { bag: Record<string, number> }).bag;
const worn = (state: GameState) => (state.gear as { worn: object }).worn;
const aim = (state: GameState, actor = 'ana') => fact(state, 'stats.value', { actor, stat: 'aim' });
const stocked = (...items: string[]) => apply(start(), ...items.map((item) => ({ effect: 'give-item', item })));

describe('wearing gear', () => {
  it('takes the item out of the bag and into its slot, where its modifiers count', () => {
    const done = attempt(stocked('rifle'), { effect: 'equip', actor: 'ana', item: 'rifle' });
    expect(bag(done.state)).toEqual({});
    expect(worn(done.state)).toEqual({ ana: { hand: 'rifle' } });
    expect(aim(done.state)).toBe(85);
    expect(fact(done.state, 'gear.wearing', { actor: 'ana', item: 'rifle' })).toBe(1);
    expect(fact(done.state, 'gear.add', { actor: 'ana', stat: 'aim' })).toBe(10);
    expect(done.beats).toContainEqual({ type: 'gear/equipped', actor: 'ana', slot: 'hand', item: 'rifle' });
  });

  it('counts each of an item’s modifiers on a stat, adds then percents, as the stats kit does', () => {
    const state = apply(stocked('helmet'), { effect: 'equip', actor: 'bo', item: 'helmet' });
    expect(gearParts(sim.content, state.gear as GearSlice, 'bo', 'health')).toEqual([
      { kind: 'item', id: 'helmet', add: 2, percent: 10 },
    ]);
    // Bo's 12 and the helmet's 2, then 10%: 15.4, so 15.
    expect(fact(state, 'stats.value', { actor: 'bo', stat: 'health' })).toBe(15);
  });

  it('puts the slot’s old item back in the bag', () => {
    const state = apply(stocked('rifle'), { effect: 'equip', actor: 'bo', item: 'rifle' });
    expect(bag(state)).toEqual({ pistol: 1 });
    expect(worn(state)).toEqual({ bo: { hand: 'rifle' } });
    expect(aim(state, 'bo')).toBe(60);
  });

  it('takes off into the bag, refused when the bag can’t hold it', () => {
    const off = attempt(start(), { effect: 'unequip', actor: 'bo', slot: 'hand' });
    expect(bag(off.state)).toEqual({ pistol: 1 });
    expect(worn(off.state)).toEqual({ bo: { hand: null } });
    expect(off.beats).toContainEqual({ type: 'gear/unequipped', actor: 'bo', slot: 'hand', item: 'pistol' });
    // A pistol is carried one at a time, so a second can't come back.
    const full = attempt(stocked('pistol'), { effect: 'unequip', actor: 'bo', slot: 'hand' });
    expect(full.accepted).toBe(false);
    expect(full.beats[0]).toMatchObject({ reason: 'no-room', actor: 'bo', item: 'pistol' });
    const swap = attempt(stocked('pistol', 'rifle'), { effect: 'equip', actor: 'bo', item: 'rifle' });
    expect(swap.beats[0]).toMatchObject({ reason: 'no-room', item: 'pistol' });
  });

  it('wears an item with no slot in a free slot that takes one of its tags, then the next (M4.12)', () => {
    const one = apply(stocked('drive', 'drive', 'drive'), { effect: 'equip', actor: 'cutter', item: 'drive' });
    expect(worn(one)).toEqual({ cutter: { 'bay-1': 'drive' } });
    const two = apply(one, { effect: 'equip', actor: 'cutter', item: 'drive' });
    expect(worn(two)).toEqual({ cutter: { 'bay-1': 'drive', 'bay-2': 'drive' } });
    expect(bag(two)).toEqual({ drive: 1 });
    expect(fact(two, 'gear.wearing', { actor: 'cutter', item: 'drive' })).toBe(2);
    expect(fact(two, 'stats.value', { actor: 'cutter', stat: 'speed' })).toBe(8);
    // Both bays full: the first wears it already, so a third changes nothing.
    expect(worn(apply(two, { effect: 'equip', actor: 'cutter', item: 'drive' }))).toEqual(worn(two));
  });

  it('puts it in the slot named, refusing one that doesn’t take it', () => {
    const named = apply(stocked('drive'), { effect: 'equip', actor: 'cutter', item: 'drive', slot: 'bay-2' });
    expect(worn(named)).toEqual({ cutter: { 'bay-2': 'drive' } });
    const wrong = attempt(stocked('drive'), { effect: 'equip', actor: 'cutter', item: 'drive', slot: 'hand' });
    expect(wrong.beats[0]).toMatchObject({ reason: 'wrong-slot', actor: 'cutter', item: 'drive', slot: 'hand' });
    // Ana has no bay that takes it.
    const none = attempt(stocked('drive'), { effect: 'equip', actor: 'ana', item: 'drive' });
    expect(none.beats[0]).toMatchObject({ reason: 'no-such-slot', actor: 'ana', slot: 'bay-1' });
  });

  it('refuses an item with no slot, a slot the actor lacks, one the bag doesn’t hold, and an empty slot', () => {
    const reason = (state: GameState, effect: Record<string, unknown>) =>
      (attempt(state, { effect: effect.effect as string, ...effect }).beats[0] as { reason?: string }).reason;
    expect(reason(stocked('medkit'), { effect: 'equip', actor: 'ana', item: 'medkit' })).toBe('not-wearable');
    expect(reason(stocked('helmet'), { effect: 'equip', actor: 'ana', item: 'helmet' })).toBe('no-such-slot');
    expect(reason(start(), { effect: 'equip', actor: 'ana', item: 'rifle' })).toBe('not-carried');
    expect(reason(start(), { effect: 'unequip', actor: 'ana', slot: 'hand' })).toBe('empty');
    // Bo has every slot, his record naming none.
    expect(attempt(stocked('helmet'), { effect: 'equip', actor: 'bo', item: 'helmet' }).accepted).toBe(true);
  });

  it('does nothing when the slot wears the item already', () => {
    const same = attempt(stocked('pistol'), { effect: 'equip', actor: 'bo', item: 'pistol' });
    expect(same.accepted).toBe(true);
    expect(bag(same.state)).toEqual({ pistol: 1 });
    expect(worn(same.state)).toEqual({});
    expect(same.beats.some((b) => b.type.startsWith('gear/'))).toBe(false);
  });

  it('keeps only what differs from the actors’ records', () => {
    const off = apply(start(), { effect: 'unequip', actor: 'bo', slot: 'hand' });
    const on = apply(off, { effect: 'equip', actor: 'bo', item: 'pistol' });
    expect(worn(on)).toEqual({});
    expect(bag(on)).toEqual({});
  });

  it('previews what it would do, or why not', () => {
    expect(
      game.preview(
        stocked('rifle'),
        [
          { effect: 'equip', actor: 'bo', item: 'rifle' },
          { effect: 'equip', actor: 'ana', item: 'medkit' },
          { effect: 'unequip', actor: 'bo', slot: 'hand' },
        ],
        sim,
      ),
    ).toEqual([
      { effect: 'equip', actor: 'bo', item: 'rifle', slot: 'hand', replaces: 'pistol' },
      { effect: 'equip', actor: 'ana', item: 'medkit', refused: 'not-wearable' },
      { effect: 'unequip', actor: 'bo', slot: 'hand', item: 'pistol' },
    ]);
  });
});
