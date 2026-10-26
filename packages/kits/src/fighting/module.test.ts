/**
 * The fighting kit's module (M6.4, D76, docs/specs/combat.md) over the camp: a hit takes the
 * weapon's damage and the wielder's might less the target's armour, never less than 1 and the same
 * as the hurt a screen shows; a hit is refused when it couldn't have landed; a fall rolls its drops,
 * lies the NPC down and frees its place for the next bandit; a body's bag goes to the party's; a
 * shot takes its arrow; and the player falling stops the game with nothing on offer.
 */
import type { GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { campWith, FIGHTING, RECORDS } from '../../test/camp.ts';

const c = campWith();
const alerted = { fact: 'ai.level', args: { actor: '@self' }, op: '==', value: 'alerted' };

/** Why the step was refused, or undefined when it was accepted. */
const refusal = (step: ReturnType<typeof c.take>) => (step.accepted ? undefined : step.beats[0]?.reason);

/** Every bandit alerted by a blow: Rook, then Crow, then Wren. */
function alarmed(): GameState {
  let state = c.start();
  for (const bandit of ['rook', 'crow', 'wren'])
    state = c.must(state, { type: 'fighting/hit', by: 'hero', on: bandit, weapon: 'sword' }).state;
  return state;
}

describe('a hit', () => {
  it('takes the sword’s 4 and the hero’s might less Rook’s armour, the hurt the fact shows', () => {
    const state = c.start();
    expect(c.fact(state, 'fighting.hurt', { by: 'hero', on: 'rook' })).toBe(4);
    expect(c.fact(state, 'fighting.weapon', { actor: 'hero' })).toBe('sword');
    const step = c.must(state, { type: 'fighting/hit', by: 'hero', on: 'rook', weapon: 'sword' });
    expect(c.health(step.state, 'rook')).toBe(2);
    expect(step.beats).toContainEqual({ type: 'fighting/hit', by: 'hero', on: 'rook', hurt: 4 });
  });

  it('never takes less than 1: an unarmed Crow’s fists against the hero’s armour', () => {
    const crow = { name: 'Crow', stats: { health: 6 }, behaviour: 'bandit' };
    const bare = campWith(FIGHTING, { ...RECORDS, actor: { ...RECORDS.actor, crow } });
    const state = bare.must(bare.start(), { type: 'fighting/hit', by: 'hero', on: 'crow', weapon: 'sword' }).state;
    expect(bare.fact(state, 'fighting.weapon', { actor: 'crow' })).toBeUndefined();
    expect(bare.fact(state, 'fighting.hurt', { by: 'crow', on: 'hero' })).toBe(1);
    expect(refusal(bare.hit(state, 'crow', 'hero'))).toBe('not-wielded');
    const step = bare.must(state, { type: 'fighting/hit', by: 'crow', on: 'hero', weapon: '' });
    expect(bare.health(step.state, 'hero')).toBe(11);
    // Without a world, there is no hurt to show.
    const unwalked = campWith(null);
    expect(unwalked.fact(unwalked.start(), 'fighting.hurt', { by: 'hero', on: 'rook' })).toBeUndefined();
  });

  it('alerts the bandit struck, who fights at once', () => {
    const step = c.must(c.start(), { type: 'fighting/hit', by: 'hero', on: 'crow', weapon: 'sword' });
    expect(c.fact(step.state, 'ai.awareness', { actor: 'crow' })).toBe(100);
    expect(step.beats).toContainEqual(expect.objectContaining({ type: 'ai/aware', actor: 'crow', level: 'alerted' }));
    expect(c.fact(step.state, 'ai.doing', { actor: 'crow' })).toBe('attack');
    expect(c.npcs(step.state).crow).toEqual({ space: 'camp', fight: 1 });
    expect(c.fact(step.state, 'world.npc-engaged', { actor: 'crow' })).toBe(true);
  });

  it('is refused when it couldn’t have landed', () => {
    const state = c.start();
    expect(refusal(c.hit(state, 'hero', 'rook', 'bow'))).toBe('not-wielded');
    expect(refusal(c.hit(state, 'hero', 'rook', ''))).toBe('not-wielded');
    expect(refusal(c.hit(state, 'hero', 'hermit'))).toBe('elsewhere');
    expect(refusal(c.hit(state, 'rook', 'crow'))).toBe('bad-hit');
    expect(refusal(c.hit(state, 'hero', 'hero'))).toBe('bad-hit');
    // Rook isn't fighting yet: the stage can't have had them swing.
    expect(refusal(c.hit(state, 'rook', 'hero'))).toBe('not-fighting');
    expect(refusal(c.take(state, { type: 'fighting/hit', by: 'hero', on: 'rook' }))).toBe('bad-hit');
    // Never on offer: only the stage finds a blow landing.
    expect(c.game.options(state, c.sim).some((a) => a.type.startsWith('fighting/'))).toBe(false);
  });

  it('is refused in a game without a world: there is no fighting to read', () => {
    const unarmed = campWith(null);
    expect(refusal(unarmed.hit(unarmed.start(), 'hero', 'rook'))).toBe('not-walked');
  });
});

describe('a fall', () => {
  it('rolls the drops into the bag, lies the NPC down and frees its place for Wren', () => {
    const state = alarmed();
    // Wren waits behind Rook and Crow, and can't have shot.
    expect(c.fact(state, 'world.npc-engaged', { actor: 'wren' })).toBe(false);
    expect(refusal(c.hit(state, 'wren', 'hero', 'bow'))).toBe('not-fighting');
    const step = c.must(state, { type: 'fighting/hit', by: 'hero', on: 'rook', weapon: 'sword' });
    expect(c.health(step.state, 'rook')).toBe(0);
    expect(step.beats).toContainEqual({ type: 'fighting/fell', actor: 'rook', by: 'hero' });
    expect(c.fact(step.state, 'fighting.fallen', { actor: 'rook' })).toBe(true);
    expect(c.fact(step.state, 'inventory.carried', { actor: 'rook', item: 'coin' })).toBe(5);
    expect(c.npcs(step.state).rook).toEqual({ space: 'camp', down: true });
    expect(c.fact(step.state, 'ai.doing', { actor: 'rook' })).toBeUndefined();
    expect(c.fact(step.state, 'world.npc-engaged', { actor: 'wren' })).toBe(true);
    // Wren's arrow takes the bow's 3 less the hero's armour; Wren shoots without ammo.
    const shot = c.must(step.state, { type: 'fighting/hit', by: 'wren', on: 'hero', weapon: 'bow' });
    expect(c.health(shot.state, 'hero')).toBe(10);
    // A body strikes and is struck no more.
    expect(refusal(c.hit(step.state, 'hero', 'rook'))).toBe('fallen');
    expect(refusal(c.hit(step.state, 'rook', 'hero'))).toBe('fallen');
  });

  it('comes of health run out another way too, with no one to blame', () => {
    const step = c.must(c.start(), {
      type: 'camp/do',
      effects: [{ effect: 'damage-stat', actor: 'crow', stat: 'health', by: 6 }],
    });
    expect(step.beats).toContainEqual({ type: 'fighting/fell', actor: 'crow', by: '' });
    expect(c.npcs(step.state).crow?.down).toBe(true);
    // Another stat run out is no fall.
    expect(c.slice(step.state).fallen).toEqual(['crow']);
  });

  it('happens once: a fallen actor’s health run out again raises nothing', () => {
    let state = c.apply(c.start(), { effect: 'damage-stat', actor: 'crow', stat: 'health', by: 6 });
    const again = c.must(state, {
      type: 'camp/do',
      effects: [{ effect: 'heal-stat', actor: 'crow', stat: 'health', by: 1 }],
    });
    state = again.state;
    const twice = c.must(state, {
      type: 'camp/do',
      effects: [{ effect: 'damage-stat', actor: 'crow', stat: 'health', by: 6 }],
    });
    expect(twice.beats.some((b) => b.type === 'fighting/fell')).toBe(false);
    expect(c.slice(twice.state).fallen).toEqual(['crow']);
  });
});

describe('a body', () => {
  it('gives its whole bag to the party’s, and is searched once there is nothing left', () => {
    let state = alarmed();
    state = c.must(state, { type: 'fighting/hit', by: 'hero', on: 'rook', weapon: 'sword' }).state;
    const step = c.must(state, { type: 'fighting/search', actor: 'rook' });
    expect(c.fact(step.state, 'inventory.count', { item: 'coin' })).toBe(5);
    expect(c.fact(step.state, 'inventory.carried', { actor: 'rook', item: 'coin' })).toBe(0);
    expect(step.beats).toContainEqual({ type: 'inventory/gained', item: 'coin', count: 5 });
    expect(step.beats).toContainEqual({ type: 'fighting/searched', actor: 'rook' });
    expect(c.fact(step.state, 'fighting.searched', { actor: 'rook' })).toBe(true);
    // Searched again, it gives nothing and the stage says so.
    const again = c.must(step.state, { type: 'fighting/search', actor: 'rook' });
    expect(again.beats.filter((b) => b.type.startsWith('inventory/'))).toEqual([]);
    expect(c.slice(again.state).searched).toEqual(['rook']);
  });

  it('is only a fallen NPC’s, in the player’s space', () => {
    const state = c.start();
    expect(refusal(c.take(state, { type: 'fighting/search', actor: 'crow' }))).toBe('not-fallen');
    expect(refusal(c.take(state, { type: 'fighting/search', actor: 'nobody' }))).toBe('bad-search');
    const hermitDown = c.apply(state, { effect: 'damage-stat', actor: 'hermit', stat: 'health', by: 4 });
    expect(refusal(c.take(hermitDown, { type: 'fighting/search', actor: 'hermit' }))).toBe('elsewhere');
  });
});

describe('a shot', () => {
  it('takes an arrow from the party’s bag as it looses, and none is no shot', () => {
    let state = c.apply(
      c.start(),
      { effect: 'give-item', item: 'bow' },
      { effect: 'equip', actor: 'hero', item: 'bow' },
      { effect: 'give-item', item: 'arrow' },
    );
    expect(c.fact(state, 'fighting.weapon', { actor: 'hero' })).toBe('bow');
    const step = c.must(state, { type: 'fighting/loosed', weapon: 'bow' });
    expect(step.beats).toContainEqual({ type: 'fighting/loosed', weapon: 'bow' });
    expect(c.fact(step.state, 'inventory.count', { item: 'arrow' })).toBe(0);
    state = step.state;
    expect(refusal(c.take(state, { type: 'fighting/loosed', weapon: 'bow' }))).toBe('no-ammo');
    expect(refusal(c.take(c.start(), { type: 'fighting/loosed', weapon: 'sword' }))).toBe('not-wielded');
  });
});

describe('the player falling', () => {
  it('runs their on-fall and stops the game, nothing on offer', () => {
    let state = c.must(c.start(), { type: 'fighting/hit', by: 'hero', on: 'crow', weapon: 'sword' }).state;
    // Crow's sword: 4 less the hero's armour, three times and the hero's 12 are gone.
    for (let i = 0; i < 3; i++)
      state = c.must(state, { type: 'fighting/hit', by: 'crow', on: 'hero', weapon: 'sword' }).state;
    expect(c.health(state, 'hero')).toBe(3);
    const step = c.must(state, { type: 'fighting/hit', by: 'crow', on: 'hero', weapon: 'sword' });
    expect(step.beats).toContainEqual({ type: 'fighting/fell', actor: 'hero', by: 'crow' });
    expect(c.fact(step.state, 'flag.on', { flag: 'lost' })).toBe(true);
    expect(c.game.options(step.state, c.sim)).toEqual([]);
    expect(refusal(c.hit(step.state, 'crow', 'hero'))).not.toBeUndefined();
    expect(c.slice(step.state).fallen).toEqual(['hero']);
  });
});

describe('an attack step left', () => {
  it('stands the NPC, so a step that sets no goal of its own doesn’t leave it fighting', () => {
    const calm = { effects: [{ effect: 'set-flag', flag: 'calm', to: true }] };
    const bandit = { do: { first: [{ if: alerted, do: { attack: 'player' } }, { do: calm }] } };
    const quiet = campWith(FIGHTING, {
      ...RECORDS,
      behaviour: { bandit },
      flag: { ...RECORDS.flag, calm: {} },
    });
    let state = quiet.must(quiet.start(), { type: 'fighting/hit', by: 'hero', on: 'rook', weapon: 'sword' }).state;
    expect(quiet.npcs(state).rook?.fight).toBe(1);
    // Four quiet reports of 2 s take 40 off: suspicious, and the attack no longer holds.
    for (let i = 0; i < 4; i++)
      state = quiet.must(state, { type: 'ai/sensed', space: 'camp', ms: 2000, npcs: {} }).state;
    expect(quiet.fact(state, 'ai.level', { actor: 'rook' })).toBe('suspicious');
    expect(quiet.fact(state, 'ai.doing', { actor: 'rook' })).toBe('effects');
    expect(quiet.npcs(state).rook?.fight).toBeUndefined();
    expect(quiet.fact(state, 'world.npc-engaged', { actor: 'rook' })).toBe(false);
  });
});
