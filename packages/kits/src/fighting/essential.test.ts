/**
 * Essential actors (M6.10, D82, docs/specs/combat.md#essential-actors) over the camp, Crow made
 * essential: struck to nothing, Crow is down, not fallen, with nothing dropped, no on-fall and no
 * body; a down actor neither strikes nor is struck; the stage's rise stands Crow at full health; the
 * player is never essential; and a fighting save from version 1 loads with no one down.
 */
import { readFileSync } from 'node:fs';
import { type GameState, loadSave, type SaveFile } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { campWith, FIGHTING, RECORDS } from '../../test/camp.ts';
import { fightingStage } from './stage.ts';

const crow = {
  ...RECORDS.actor.crow,
  essential: true,
  carries: { coin: 2 },
  drops: 'purse',
  'on-fall': [{ effect: 'set-flag', flag: 'lost', to: true }],
};
const c = campWith(FIGHTING, { ...RECORDS, actor: { ...RECORDS.actor, crow } });
const refusal = (step: ReturnType<typeof c.take>) => (step.accepted ? undefined : step.beats[0]?.reason);
const blow = (state: GameState) => c.must(state, { type: 'fighting/hit', by: 'hero', on: 'crow', weapon: 'sword' });

/** Crow struck twice: 6 health, the sword's 4 a blow. */
function downed(): GameState {
  return blow(blow(c.start()).state).state;
}

describe('an essential actor struck to nothing', () => {
  it('is down, not fallen: nothing dropped, no on-fall, laid down in the world', () => {
    const first = blow(c.start());
    const step = blow(first.state);
    expect(step.beats).toContainEqual({ type: 'fighting/downed', actor: 'crow', by: 'hero' });
    expect(step.beats.some((b) => b.type === 'fighting/fell')).toBe(false);
    expect(c.slice(step.state)).toMatchObject({ fallen: [], down: ['crow'] });
    expect(c.fact(step.state, 'fighting.down', { actor: 'crow' })).toBe(true);
    expect(c.fact(step.state, 'fighting.fallen', { actor: 'crow' })).toBe(false);
    expect(c.fact(step.state, 'world.npc-down', { actor: 'crow' })).toBe(true);
    expect(c.fact(step.state, 'inventory.count', { item: 'coin' })).toBe(0);
    expect(c.fact(step.state, 'flag.on', { flag: 'lost' })).toBe(false);
    expect(c.fact(step.state, 'world.npc-engaged', { actor: 'crow' })).toBe(false);
  });

  it('neither strikes nor is struck, and leaves no body to search', () => {
    const state = downed();
    expect(refusal(c.hit(state, 'hero', 'crow'))).toBe('down');
    expect(refusal(c.hit(state, 'crow', 'hero'))).toBe('down');
    expect(refusal(c.take(state, { type: 'fighting/search', actor: 'crow' }))).toBe('not-fallen');
  });

  it('rises at full health on the stage’s rise, and can go down again', () => {
    const step = c.must(downed(), { type: 'fighting/rise', actor: 'crow' });
    expect(step.beats).toContainEqual({ type: 'fighting/rose', actor: 'crow' });
    expect(c.health(step.state, 'crow')).toBe(6);
    expect(c.slice(step.state).down).toEqual([]);
    expect(c.fact(step.state, 'world.npc-down', { actor: 'crow' })).toBe(false);
    expect(refusal(c.take(step.state, { type: 'fighting/rise', actor: 'crow' }))).toBe('not-down');
    expect(c.slice(blow(blow(step.state).state).state).down).toEqual(['crow']);
  });

  it('keeps those down sorted, whoever went down first', () => {
    const wren = { ...RECORDS.actor.wren, essential: true };
    const g = campWith(FIGHTING, { ...RECORDS, actor: { ...RECORDS.actor, crow, wren } });
    const hit = (state: GameState, on: string) =>
      g.must(state, { type: 'fighting/hit', by: 'hero', on, weapon: 'sword' }).state;
    const state = hit(hit(hit(hit(g.start(), 'crow'), 'crow'), 'wren'), 'wren');
    expect(g.slice(state).down).toEqual(['crow', 'wren']);
  });

  it('is offered its rise by the headless stage, and no blow', () => {
    const state = downed();
    const offered = fightingStage(FIGHTING, ['crow', 'rook', 'wren']).candidates(state, c.game, c.sim);
    expect(offered).toContainEqual({ type: 'fighting/rise', actor: 'crow' });
    expect(offered).not.toContainEqual(expect.objectContaining({ type: 'fighting/hit', on: 'crow' }));
  });
});

describe('the player marked essential', () => {
  it('still falls: the game stops as it always has', () => {
    const hero = { ...RECORDS.actor.hero, essential: true };
    const g = campWith(FIGHTING, { ...RECORDS, actor: { ...RECORDS.actor, hero } });
    const state = g.apply(g.start(), { effect: 'damage-stat', actor: 'hero', stat: 'health', by: 12 });
    expect(g.slice(state)).toMatchObject({ fallen: ['hero'], down: [] });
  });
});

// Saved by the fighting kit at version 1 (M6.4 to M6.9): Rook fallen.
const V1 = JSON.parse(
  readFileSync(new URL('../../test/fixtures/saves/camp-fighting-v1.json', import.meta.url), 'utf8'),
) as SaveFile;

describe('a save made by the fighting kit’s version 1', () => {
  it('loads, migrated, Rook still fallen and no one down', () => {
    const loaded = loadSave(c.game, V1, c.sim, { game: 'camp', build: 'fixture-fighting-v1' });
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.report.migrated).toContainEqual({ module: 'fighting', from: 1, to: 2 });
    expect(loaded.state.fighting).toEqual({ fallen: ['rook'], searched: [], down: [] });
  });
});
