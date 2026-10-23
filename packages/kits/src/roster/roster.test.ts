/**
 * The roster kit (docs/specs/roster.md): members who join and leave, recruits made as records,
 * the cap, ranks with their statuses, and bonds. Hiring in a hall is in hall.test.ts.
 */
import { describeCondition, factCatalog, type GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { mustered, musterWith, RECORDS, withRoster } from '../../test/muster.ts';
import { rosterModule } from './module.ts';
import type { RosterSlice } from './types.ts';

const { start, apply, attempt, fact, content } = mustered;
const slice = (state: GameState) => state.roster as RosterSlice;

describe('members', () => {
  it('start as the roster record lists them, and join and leave by effects', () => {
    let state = start();
    expect(slice(state).members).toEqual(['ana', 'bo']);
    expect(fact(state, 'roster.count')).toBe(2);
    state = apply(state, { effect: 'join', actor: 'cy' });
    expect(slice(state).members).toEqual(['ana', 'bo', 'cy']);
    // Joining twice changes nothing.
    expect(slice(apply(state, { effect: 'join', actor: 'cy' }))).toBe(slice(state));
    const step = attempt(state, { effect: 'leave', actor: 'ana', why: 'dead' });
    expect(step.beats).toContainEqual({ type: 'roster/left', actor: 'ana', why: 'dead' });
    state = step.state;
    expect(slice(state).members).toEqual(['bo', 'cy']);
    expect(fact(state, 'roster.member', { actor: 'ana' })).toBe(false);
    expect(fact(state, 'roster.left', { actor: 'ana' })).toBe('dead');
    expect(fact(state, 'roster.left', { actor: 'bo' })).toBeUndefined();
    // Leaving when not on the roster changes nothing.
    expect(slice(apply(state, { effect: 'leave', actor: 'ana', why: 'sold' }))).toBe(slice(state));
  });

  it('who rejoin are taken out of the gone', () => {
    let state = apply(start(), { effect: 'leave', actor: 'ana', why: 'dismissed' });
    state = apply(state, { effect: 'join', actor: 'ana' });
    expect(slice(state).members).toEqual(['bo', 'ana']);
    expect(slice(state).gone).toEqual({});
    expect(fact(state, 'roster.left', { actor: 'ana' })).toBeUndefined();
  });

  it('have a place from 1 in the order they joined, and anyone not on the roster has 0 (M4.7)', () => {
    let state = apply(start(), { effect: 'leave', actor: 'ana', why: 'dismissed' });
    state = apply(state, { effect: 'join', actor: 'ana' });
    expect(['bo', 'ana', 'cy'].map((actor) => fact(state, 'roster.place', { actor }))).toEqual([1, 2, 0]);
  });

  it('are refused past the cap, from a number or from a flag, which wins', () => {
    let state = apply(start(), { effect: 'join', actor: 'cy' }, { effect: 'recruit', recruit: 'medic' });
    expect(fact(state, 'roster.room')).toBe(0);
    const full = attempt(state, { effect: 'recruit', recruit: 'deckhand' });
    expect(full.accepted).toBe(false);
    expect(full.beats[0]).toMatchObject({ reason: 'roster-full', recruit: 'deckhand' });
    expect(attempt(state, { effect: 'join', actor: 'hand' }).beats[0]).toMatchObject({ reason: 'roster-full' });
    const berths = musterWith(withRoster({ cap: undefined, 'cap-flag': 'berths' }));
    state = berths.start();
    expect(berths.fact(state, 'roster.room')).toBe(1);
    state = berths.apply(state, { effect: 'add-to-flag', flag: 'berths', by: 2 });
    expect(berths.fact(state, 'roster.room')).toBe(3);
    const both = musterWith(withRoster({ cap: 9, 'cap-flag': 'berths' }));
    expect(both.fact(both.start(), 'roster.room')).toBe(1);
    const open = musterWith(withRoster({ cap: undefined }));
    expect(open.fact(open.start(), 'roster.room')).toBeUndefined();
  });

  it('have no room, never less, when a flag lowers the cap below them', () => {
    const berths = musterWith(withRoster({ cap: undefined, 'cap-flag': 'berths' }));
    const state = berths.apply(berths.start(), { effect: 'set-flag', flag: 'berths', to: 1 });
    expect(berths.fact(state, 'roster.room')).toBe(0);
    expect(berths.attempt(state, { effect: 'join', actor: 'cy' }).beats[0]).toMatchObject({ reason: 'roster-full' });
  });

  it('who aren’t actors, or leave with no why, throw', () => {
    expect(() => apply(start(), { effect: 'join', actor: 'nobody' })).toThrow('No actor "nobody"');
    expect(() => apply(start(), { effect: 'leave', actor: 'ana' })).toThrow('leave: "why" is text, such as "dead"');
    expect(() => apply(start(), { effect: 'leave', actor: 'ana', why: '' })).toThrow('leave: "why" is text');
  });

  it('read by an id that every object has, constructor, are never there', () => {
    const state = start();
    expect(fact(state, 'roster.member', { actor: 'constructor' })).toBe(false);
    expect(fact(state, 'roster.left', { actor: 'constructor' })).toBeUndefined();
    expect(content(state).has('actor', 'constructor')).toBe(false);
  });

  it('are an empty roster with no cap, ranks or bounds when there is no roster record', () => {
    const { roster: _, ...rest } = RECORDS;
    const none = musterWith(rest);
    const state = none.start();
    expect(slice(state)).toMatchObject({ members: [], ranks: {}, bonds: {} });
    expect(none.fact(state, 'roster.room')).toBeUndefined();
    expect(none.fact(state, 'roster.rank', { actor: 'ana' })).toBeUndefined();
    expect(() => none.fact(state, 'roster.reached', { actor: 'ana', rank: 'green' })).toThrow(
      'The roster has no ranks',
    );
    const far = none.apply(state, { effect: 'change-bond', actor: 'ana', with: 'bo', by: -50 });
    expect(none.fact(far, 'roster.bond', { actor: 'bo', with: 'ana' })).toBe(-50);
    expect(none.fact(far, 'roster.bond-band', { actor: 'bo', with: 'ana' })).toBeUndefined();
  });
});

describe('recruits', () => {
  it('are actor records made from their template’s actor, with what was rolled laid over it', () => {
    const step = attempt(start(), { effect: 'recruit', recruit: 'deckhand' });
    const state = step.state;
    const rolled = slice(state).made['deckhand-0'];
    expect(rolled).toBeDefined();
    const record = content(state).get('actor', 'deckhand-0') as Record<string, unknown>;
    expect(record).toEqual({
      name: rolled?.name,
      description: 'Knows ropes.',
      stats: { aim: 2, health: 8, ...rolled?.stats },
      // The actor's own steady, then any trait drawn, each once.
      statuses: ['steady', ...(rolled?.traits ?? []).filter((t) => t !== 'steady')],
    });
    expect(fact(state, 'stats.value', { actor: 'deckhand-0', stat: 'aim' })).toBeGreaterThan(0);
    expect(step.beats).toContainEqual({ type: 'roster/joined', actor: 'deckhand-0' });
    expect(slice(state).members).toEqual(['ana', 'bo', 'deckhand-0']);
  });

  it('are previewed as who would join, by the same draws', () => {
    const state = start();
    const [preview] = mustered.game.preview(state, [{ effect: 'recruit', recruit: 'medic' }], mustered.sim);
    const made = apply(state, { effect: 'recruit', recruit: 'medic' });
    const rolled = slice(made).made['medic-0'];
    expect(preview).toEqual({
      effect: 'recruit',
      actor: 'medic-0',
      name: rolled?.name,
      stats: rolled?.stats ?? {},
      traits: rolled?.traits ?? [],
    });
    const full = apply(state, { effect: 'join', actor: 'cy' }, { effect: 'join', actor: 'hand' });
    expect(mustered.game.preview(full, [{ effect: 'recruit', recruit: 'medic' }], mustered.sim)[0]).toMatchObject({
      refused: 'roster-full',
    });
  });

  it('never take a number twice, and stay records after they leave', () => {
    let state = apply(start(), { effect: 'recruit', recruit: 'medic' });
    state = apply(state, { effect: 'leave', actor: 'medic-0', why: 'dead' });
    state = apply(state, { effect: 'recruit', recruit: 'medic' }, { effect: 'recruit', recruit: 'deckhand' });
    expect(slice(state).members).toEqual(['ana', 'bo', 'medic-1', 'deckhand-2']);
    expect(slice(state).next).toBe(3);
    expect(content(state).ids('actor')).toEqual(['ana', 'bo', 'cy', 'deckhand-2', 'doc', 'hand', 'medic-0', 'medic-1']);
    expect(fact(state, 'roster.left', { actor: 'medic-0' })).toBe('dead');
    expect(fact(state, 'stats.value', { actor: 'medic-0', stat: 'health' })).toBe(9);
  });

  it('can’t take a written actor’s id, which validation stops (E035)', () => {
    const clash = musterWith({
      ...RECORDS,
      actor: { ...RECORDS.actor, 'medic-0': { name: 'Squatter' } },
    });
    expect(() => clash.apply(clash.start(), { effect: 'recruit', recruit: 'medic' })).toThrow(
      'Recruit "medic-0" would take the id of a written actor',
    );
  });

  it('are worked out from the template’s actor as content has it now, so an update reaches a save', () => {
    const state = apply(start(), { effect: 'recruit', recruit: 'medic' });
    const updated = musterWith({
      ...RECORDS,
      actor: { ...RECORDS.actor, doc: { name: 'Medic', stats: { health: 15 } } },
    });
    expect(updated.fact(state, 'stats.value', { actor: 'medic-0', stat: 'health' })).toBe(15);
  });
});

describe('ranks', () => {
  it('give each member its rank’s status from the start', () => {
    const state = start();
    expect(slice(state).ranks).toEqual({ ana: 'green', bo: 'veteran' });
    expect(fact(state, 'stats.has', { actor: 'bo', status: 'seasoned' })).toBe(1);
    expect(fact(state, 'stats.value', { actor: 'bo', stat: 'health' })).toBe(12);
    expect(fact(state, 'roster.rank', { actor: 'bo' })).toBe('veteran');
    expect(state.kernel.step).toBe(0);
  });

  it('move with the ladder stat, the old rank’s status off and the new one’s on', () => {
    let step = attempt(start(), { effect: 'add-to-stat', actor: 'ana', stat: 'fights', by: 3 });
    expect(step.beats.filter((b) => b.type.startsWith('roster/') || b.type.startsWith('stats/status'))).toEqual([
      { type: 'stats/status-added', actor: 'ana', status: 'seasoned', stacks: 1 },
      { type: 'roster/rank-changed', actor: 'ana', from: 'green', to: 'veteran' },
    ]);
    step = attempt(step.state, { effect: 'add-to-stat', actor: 'ana', stat: 'fights', by: 5 });
    const state = step.state;
    expect(fact(state, 'stats.has', { actor: 'ana', status: 'seasoned' })).toBe(0);
    expect(fact(state, 'stats.has', { actor: 'ana', status: 'hardened' })).toBe(1);
    expect(fact(state, 'roster.rank', { actor: 'ana' })).toBe('elite');
    expect(step.beats).toContainEqual({ type: 'roster/rank-changed', actor: 'ana', from: 'veteran', to: 'elite' });
    // And back down: a rank lost takes its status with it.
    const down = apply(state, { effect: 'add-to-stat', actor: 'ana', stat: 'fights', by: -8 });
    expect(fact(down, 'stats.has', { actor: 'ana', status: 'hardened' })).toBe(0);
    expect(slice(down).ranks.ana).toBe('green');
  });

  it('are given to a recruit as it joins, and kept by a member who leaves', () => {
    const veteran = musterWith({
      ...RECORDS,
      recruit: { ...RECORDS.recruit, old: { actor: 'doc', names: ['Hal'], stats: { fights: { min: 5 } } } },
    });
    let state = veteran.apply(veteran.start(), { effect: 'recruit', recruit: 'old' });
    expect(veteran.fact(state, 'stats.has', { actor: 'old-0', status: 'seasoned' })).toBe(1);
    expect(slice(state).ranks['old-0']).toBe('veteran');
    state = veteran.apply(state, { effect: 'leave', actor: 'old-0', why: 'retired' });
    expect(veteran.fact(state, 'stats.has', { actor: 'old-0', status: 'seasoned' })).toBe(1);
    // A gone member's rank isn't worked out again.
    state = veteran.apply(state, { effect: 'add-to-stat', actor: 'old-0', stat: 'fights', by: 5 });
    expect(veteran.fact(state, 'stats.has', { actor: 'old-0', status: 'hardened' })).toBe(0);
    // Until it rejoins.
    state = veteran.apply(state, { effect: 'join', actor: 'old-0' });
    expect(veteran.fact(state, 'stats.has', { actor: 'old-0', status: 'seasoned' })).toBe(0);
    expect(veteran.fact(state, 'stats.has', { actor: 'old-0', status: 'hardened' })).toBe(1);
  });

  it('are read by facts: reached, and how many members have reached a rank', () => {
    const state = apply(start(), { effect: 'join', actor: 'cy' });
    expect(fact(state, 'roster.reached', { actor: 'bo', rank: 'veteran' })).toBe(true);
    expect(fact(state, 'roster.reached', { actor: 'bo', rank: 'green' })).toBe(true);
    expect(fact(state, 'roster.reached', { actor: 'ana', rank: 'veteran' })).toBe(false);
    expect(fact(state, 'roster.ranked', { rank: 'green' })).toBe(3);
    expect(fact(state, 'roster.ranked', { rank: 'veteran' })).toBe(1);
    expect(fact(state, 'roster.ranked', { rank: 'elite' })).toBe(0);
    expect(() => fact(state, 'roster.ranked', { rank: 'admiral' })).toThrow('The rank ladder has no band "admiral"');
    const empty = musterWith(withRoster({ start: [] }));
    expect(() => empty.fact(empty.start(), 'roster.ranked', { rank: 'admiral' })).toThrow('no band "admiral"');
  });
});

describe('bonds', () => {
  it('move within their bounds, in their bands, and are saved only while off the start', () => {
    let step = attempt(start(), { effect: 'change-bond', actor: 'bo', with: 'ana', by: 5 });
    expect(step.beats).toEqual([
      { type: 'roster/bond-changed', actor: 'bo', with: 'ana', by: 5, to: 5 },
      { type: 'roster/bond-band-changed', actor: 'bo', with: 'ana', from: 'strangers', to: 'mates' },
    ]);
    expect(slice(step.state).bonds).toEqual({ 'ana|bo': 5 });
    expect(fact(step.state, 'roster.bond', { actor: 'ana', with: 'bo' })).toBe(5);
    expect(fact(step.state, 'roster.bond-band', { actor: 'ana', with: 'bo' })).toBe('mates');
    step = attempt(step.state, { effect: 'change-bond', actor: 'ana', with: 'bo', by: 100 });
    expect(step.beats[0]).toEqual({ type: 'roster/bond-changed', actor: 'ana', with: 'bo', by: 15, to: 20 });
    // At the bound nothing moves, and nothing is said.
    expect(attempt(step.state, { effect: 'change-bond', actor: 'ana', with: 'bo', by: 1 }).beats).toEqual([]);
    const back = apply(step.state, { effect: 'change-bond', actor: 'ana', with: 'bo', by: -20 });
    expect(slice(back).bonds).toEqual({});
  });

  it('of an actor with itself, or past what the engine counts, throw', () => {
    expect(() => apply(start(), { effect: 'change-bond', actor: 'ana', with: 'ana', by: 1 })).toThrow(
      '"ana" has no bond with itself',
    );
    expect(() => fact(start(), 'roster.bond', { actor: 'ana', with: 'nobody' })).toThrow('No actor "nobody"');
    expect(() => apply(start(), { effect: 'change-bond', actor: 'ana', with: 'bo', by: 1.5 })).toThrow(
      'change-bond: "by" is a whole number',
    );
  });

  it('start at 0 kept within the bounds when the roster gives no start', () => {
    const high = musterWith(withRoster({ bonds: { min: 5, max: 20 } }));
    expect(high.fact(high.start(), 'roster.bond', { actor: 'ana', with: 'bo' })).toBe(5);
    // Back at that start, a bond is no longer saved.
    const back = high.apply(
      high.start(),
      { effect: 'change-bond', actor: 'ana', with: 'bo', by: 2 },
      { effect: 'change-bond', actor: 'ana', with: 'bo', by: -2 },
    );
    expect(slice(back).bonds).toEqual({});
    const low = musterWith(withRoster({ bonds: { min: -20, max: -5 } }));
    expect(low.fact(low.start(), 'roster.bond', { actor: 'ana', with: 'bo' })).toBe(-5);
  });

  it('move for every pair of members at once, in id order', () => {
    const state = apply(start(), { effect: 'join', actor: 'cy' });
    const step = attempt(state, { effect: 'change-bonds', by: 2 });
    expect(step.beats.map((b) => [b.actor, b.with])).toEqual([
      ['ana', 'bo'],
      ['ana', 'cy'],
      ['bo', 'cy'],
    ]);
    expect(slice(step.state).bonds).toEqual({ 'ana|bo': 2, 'ana|cy': 2, 'bo|cy': 2 });
  });

  it('are previewed with their bands', () => {
    const [preview] = mustered.game.preview(
      start(),
      [{ effect: 'change-bond', actor: 'ana', with: 'bo', by: 12 }],
      mustered.sim,
    );
    expect(preview).toEqual({
      effect: 'change-bond',
      actor: 'ana',
      with: 'bo',
      from: 0,
      to: 12,
      band: { from: 'strangers', to: 'brothers' },
    });
  });
});

describe('the roster’s facts in words', () => {
  const catalog = factCatalog([rosterModule(true)]);
  const words = (condition: object) => describeCondition(condition as never, catalog);

  it('name the actors and ranks they test', () => {
    expect(words({ fact: 'roster.count', op: '>=', value: 3 })).toBe('The roster’s size is at least 3');
    expect(words({ fact: 'roster.room', op: '>', value: 0 })).toBe('Room on the roster is more than 0');
    expect(words({ fact: 'roster.member', args: { actor: 'ana' } })).toBe('Ana is on the roster');
    expect(words({ fact: 'roster.left', args: { actor: 'ana' }, op: '==', value: 'dead' })).toBe(
      'Why ana left is dead',
    );
    expect(words({ fact: 'roster.rank', args: { actor: 'ana' }, op: '==', value: 'veteran' })).toBe(
      'Ana’s rank is veteran',
    );
    expect(words({ fact: 'roster.reached', args: { actor: 'ana', rank: 'veteran' } })).toBe('Ana is at least veteran');
    expect(words({ fact: 'roster.ranked', args: { rank: 'veteran' }, op: '>=', value: 2 })).toBe(
      'The number of members at least veteran is at least 2',
    );
    expect(words({ fact: 'roster.bond', args: { actor: 'ana', with: 'bo' }, op: '>=', value: 4 })).toBe(
      'The bond of ana and bo is at least 4',
    );
    expect(words({ fact: 'roster.bond-band', args: { actor: 'ana', with: 'bo' }, op: '==', value: 'mates' })).toBe(
      'The bond of ana and bo is mates',
    );
  });
});
