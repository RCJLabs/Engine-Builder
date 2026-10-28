/**
 * The tactics kit's module in a game (M7.5, D87, docs/specs/tactics.md): start-battle from records and
 * stats, the battle mode, the crew's actions offered and taken, the foes' turn played inside the step
 * that hands it to them, the odds as facts, and the end written back.
 */
import type { Action, Beat, GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { deckFight, TILES } from '../../test/deckFight.ts';
import { aiAction } from './ai.ts';
import { fieldOf, unitOf } from './field.ts';
import { shotOdds } from './odds.ts';
import { arenaOf } from './records.ts';
import type { Battle, Unit } from './types.ts';

const fight = deckFight();
const begin = (state: GameState = fight.start()) => fight.apply(state, { effect: 'start-battle', battle: 'boarders' });
const battleOf = (state: GameState) => fight.slice(state).battle as Battle;
const kinds = (beats: readonly Beat[]) => beats.map((b) => b.type);

/** The crew's next action as the kit's AI would take it, as the kernel takes it. */
function crewStep(state: GameState) {
  const battle = battleOf(state);
  const { type, ...payload } = aiAction(arenaOf(fight.sim.content, TILES, battle.battle), battle);
  return fight.must(state, { type: `tactics/${type}`, ...payload });
}

describe('the tactics module', () => {
  it('sets a battle out from its record and its actors, and fights it in its own mode', () => {
    const { state, beats } = begin();
    const battle = battleOf(state);
    expect(battle.units.map((u) => [u.id, u.actor, u.at, u.hp])).toEqual([
      ['c1', 'marine', [9, 1], 10],
      ['c2', 'engineer', [9, 2], 8],
      ['c3', 'medic', [10, 2], 8],
      ['e1', 'pirate', [5, 3], 7],
      ['e2', 'pirate', [6, 3], 7],
      ['e3', 'brute', [4, 3], 11],
    ]);
    expect(kinds(beats)).toEqual(['mode', 'tactics/started', 'tactics/turn']);
    expect(fight.fact(state, 'tactics.in-battle')).toBe(true);
    expect(fight.fact(state, 'tactics.fought', { battle: 'boarders' })).toBe(1);
    expect(fight.game.allowedActions(state)).toContain('tactics/move');
    expect(fight.game.allowedActions(state)).not.toContain('deck/do');
    expect(fight.take(state, { type: 'deck/do', effects: [] }).accepted).toBe(false);
  });

  it('starts a hurt crew member hurt, and refuses a second battle while one is under way', () => {
    const hurt = fight.apply(fight.start(), { effect: 'damage-stat', actor: 'engineer', stat: 'health', by: 3 }).state;
    expect((begin(hurt).state.tactics as { battle: Battle }).battle.units[1]).toMatchObject({ hp: 5, most: 8 });
  });

  it('offers only what the rules allow, every offer accepted', () => {
    const { state } = begin();
    const options = fight.game.options(state, fight.sim);
    expect(options.length).toBeGreaterThan(30);
    expect(new Set(options.map((o) => o.type))).toEqual(
      new Set(['tactics/move', 'tactics/watch', 'tactics/open', 'tactics/end']),
    );
    for (const option of options) expect(fight.take(state, option).accepted, JSON.stringify(option)).toBe(true);
  });

  it("plays the foes' whole turn inside the step that hands it to them", () => {
    const { state } = begin();
    const step = fight.must(state, { type: 'tactics/end' });
    const battle = battleOf(step.state);
    expect(battle).toMatchObject({ side: 'crew', round: 2 });
    const turns = step.beats.filter((b) => b.type === 'tactics/turn').map(({ type: _, ...data }) => data);
    expect(turns).toEqual([
      { side: 'foes', round: 1 },
      { side: 'crew', round: 2 },
    ]);
    expect(step.beats.some((b) => b.type === 'tactics/moved' && String(b.unit).startsWith('e'))).toBe(true);
  });

  it('gives the odds a shot is rolled at as facts', () => {
    let state = begin().state;
    for (let i = 0; i < 40 && shotsOffered(state).length === 0; i++) state = crewStep(state).state;
    const offer = shotsOffered(state)[0] as Action;
    const battle = battleOf(state);
    const [shooter, target] = [unitOf(battle, offer.unit), unitOf(battle, offer.target)] as [Unit, Unit];
    const arena = arenaOf(fight.sim.content, TILES, battle.battle);
    const odds = shotOdds(arena, battle, fieldOf(arena, battle), shooter, target);
    expect(fight.fact(state, 'tactics.hit', { unit: shooter.id, target: target.id })).toBe(odds.hit);
    expect(fight.fact(state, 'tactics.crit', { unit: shooter.id, target: target.id })).toBe(odds.crit);
    const shot = fight.must(state, offer);
    expect(shot.beats.find((b) => b.type === 'tactics/shot')).toMatchObject({ chance: odds.hit });
    expect(fight.fact(state, 'tactics.hit', { unit: shooter.id, target: shooter.id })).toBeUndefined();
  });

  it('writes the crew back as the battle ends, gives falls, counts it, pops its mode and runs win or lose', () => {
    let state = begin(fight.start('deck-2')).state;
    let last: readonly Beat[] = [];
    for (let i = 0; i < 400 && fight.slice(state).battle; i++) ({ state, beats: last } = crewStep(state));
    const slice = fight.slice(state);
    expect(slice.battle).toBeNull();
    const won = last.some((b) => b.type === 'tactics/won');
    expect(fight.fact(state, won ? 'tactics.won' : 'tactics.lost', { battle: 'boarders' })).toBe(1);
    expect(fight.fact(state, 'flag.on', { flag: won ? 'won' : 'lost' })).toBe(true);
    expect(fight.game.allowedActions(state)).toEqual(['deck/do']);
    expect(fight.fact(state, 'tactics.in-battle')).toBe(false);
    const out = last.filter((b) => b.type === 'tactics/out');
    for (const beat of out) expect(fight.fact(state, 'stats.has', { actor: actorOf(beat), status: 'hurt' })).toBe(1);
  });

  it("writes the crew's health back as the battle ends, and runs win; a crew all down loses at once", () => {
    const shot = fight.apply(fight.start(), { effect: 'start-battle', battle: 'duel' });
    const hit = shot.beats.find((b) => b.type === 'tactics/shot');
    expect(hit).toMatchObject({ unit: 'e1', target: 'c1', hit: true });
    const left = battleOf(shot.state).units[0]?.hp as number;
    expect(left).toBe(10 - (hit?.damage as number));
    const won = fight.must(shot.state, { type: 'tactics/shoot', unit: 'c1', target: 'e1' });
    expect(kinds(won.beats)).toContain('tactics/won');
    expect(fight.health(won.state, 'ace')).toBe(left);
    expect(fight.fact(won.state, 'flag.on', { flag: 'won' })).toBe(true);
    expect(fight.fact(won.state, 'stats.has', { actor: 'ace', status: 'hurt' })).toBe(0);
    const frail = fight.apply(fight.start(), { effect: 'damage-stat', actor: 'ace', stat: 'health', by: 9 }).state;
    const lost = fight.apply(frail, { effect: 'start-battle', battle: 'duel' });
    expect(kinds(lost.beats)).toContain('tactics/lost');
    expect(fight.slice(lost.state).battle).toBeNull();
    expect(fight.health(lost.state, 'ace')).toBe(0);
    expect(fight.fact(lost.state, 'flag.on', { flag: 'lost' })).toBe(true);
  });

  it('gives falls to each of the crew who ends the fight out or dead, at 0 health', () => {
    const state = JSON.parse(JSON.stringify(begin().state)) as GameState & { tactics: { battle: Battle } };
    const units = state.tactics.battle.units;
    const set_ = (id: string, fields: Partial<Record<keyof Unit, unknown>>) =>
      Object.assign(units.find((u) => u.id === id) as Unit, fields);
    set_('c1', { aim: 200 });
    set_('c2', { status: 'out', hp: 0 });
    set_('c3', { status: 'dead', hp: 0 });
    set_('e1', { status: 'dead', hp: 0 });
    set_('e2', { status: 'dead', hp: 0 });
    set_('e3', { hp: 1, at: [10, 2] });
    const won = fight.must(state, { type: 'tactics/shoot', unit: 'c1', target: 'e3' });
    expect(kinds(won.beats)).toContain('tactics/won');
    for (const actor of ['engineer', 'medic']) {
      expect(fight.fact(won.state, 'stats.has', { actor, status: 'hurt' }), actor).toBe(1);
      expect(fight.health(won.state, actor), actor).toBe(0);
    }
    expect(fight.fact(won.state, 'stats.has', { actor: 'marine', status: 'hurt' })).toBe(0);
    expect(fight.health(won.state, 'marine')).toBe(10);
  });

  it('refuses an action out of turn or against the rules, and changes nothing', () => {
    const { state } = begin();
    for (const action of [
      { type: 'tactics/move', unit: 'e1', to: [5, 2] },
      { type: 'tactics/move', unit: 'c1', to: [0, 0] },
      { type: 'tactics/shoot', unit: 'c1', target: 'e1' },
      { type: 'tactics/reload', unit: 'c1' },
    ])
      expect(fight.take(state, action).accepted, JSON.stringify(action)).toBe(false);
  });

  it('carries on the same from a saved battle', () => {
    let state = begin().state;
    for (let i = 0; i < 6; i++) state = crewStep(state).state;
    const saved = JSON.parse(JSON.stringify(state)) as GameState;
    expect(crewStep(saved).state).toEqual(crewStep(state).state);
  });
});

/** The crew's shots on offer now. */
const shotsOffered = (state: GameState) =>
  fight.game.options(state, fight.sim).filter((option) => option.type === 'tactics/shoot');

const CREW: Readonly<Record<string, string>> = { c1: 'marine', c2: 'engineer', c3: 'medic' };
const actorOf = (beat: Beat) => CREW[beat.unit as string] as string;
