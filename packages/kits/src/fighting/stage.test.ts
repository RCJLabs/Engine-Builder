/**
 * The fighting kit's stage for headless runs (M6.9, D81, docs/specs/runner.md#a-walked-games-stage-m69-d81)
 * over the camp: the player's blow at each NPC standing in their space, an engaged NPC's blow back,
 * fists as "", a body's search in place of blows, and a bot that fights the camp with nothing refused.
 */
import { type GameState, joinStages, playRun, randomPolicy, stageOptions, worldStage } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { campWith, FIGHTING, RECORDS, WORLD } from '../../test/camp.ts';
import { fightingStage } from './stage.ts';

const c = campWith();
const stage = fightingStage(FIGHTING, Object.keys(WORLD.actors));
const offered = (state: GameState, s = stage) => s.candidates(state, c.game, c.sim);
const kept = (state: GameState) => stageOptions(stage, c.game, c.sim, state);
const hit = (by: string, on: string, weapon = 'sword') => ({ type: 'fighting/hit', by, on, weapon });

describe('the fighting stage', () => {
  it('offers the hero’s blow at each NPC in the camp, in name order, and none at the hermit in the cave', () => {
    const state = c.start();
    expect(stage.name).toBe('fight');
    expect(offered(state)).toEqual([hit('hero', 'crow'), hit('hero', 'rook'), hit('hero', 'wren')]);
    expect(kept(state)).toEqual(offered(state));
  });

  it('offers an engaged NPC’s blow back with what they wield, and none from one who waits', () => {
    let state = c.start();
    for (const bandit of ['rook', 'crow', 'wren']) state = c.must(state, hit('hero', bandit)).state;
    // Wren waits behind Rook and Crow, so their bow is not offered.
    expect(kept(state)).toEqual([
      hit('hero', 'crow'),
      hit('crow', 'hero'),
      hit('hero', 'rook'),
      hit('rook', 'hero'),
      hit('hero', 'wren'),
    ]);
    state = c.must(state, hit('hero', 'rook')).state;
    // Rook down: their body to search, and no blow either way; Wren steps up with the bow.
    expect(offered(state)).toEqual(kept(state));
    expect(kept(state)).toEqual([
      hit('hero', 'crow'),
      hit('crow', 'hero'),
      { type: 'fighting/search', actor: 'rook' },
      hit('hero', 'wren'),
      hit('wren', 'hero', 'bow'),
    ]);
  });

  it('offers an unarmed NPC’s blow as fists, ""', () => {
    const crow = { name: 'Crow', stats: { health: 6 }, behaviour: 'bandit' };
    const bare = campWith(FIGHTING, { ...RECORDS, actor: { ...RECORDS.actor, crow } });
    const state = bare.must(bare.start(), hit('hero', 'crow')).state;
    const sent = stage.candidates(state, bare.game, bare.sim);
    expect(sent).toContainEqual(hit('crow', 'hero', ''));
    expect(stageOptions(stage, bare.game, bare.sim, state)).toContainEqual(hit('crow', 'hero', ''));
  });

  it('keeps nothing in a game without project.json’s fighting, which refuses every blow', () => {
    const unwalked = campWith(null);
    expect(stageOptions(stage, unwalked.game, unwalked.sim, unwalked.start())).toEqual([]);
  });

  it('lets a bot fight the camp with the world’s stage: bandits fall, and nothing is refused', () => {
    const walked = joinStages([worldStage(WORLD), stage]);
    expect(walked.name).toBe('walk+fight');
    let fell = 0;
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const run = playRun(c.game, c.sim, { seed, policy: randomPolicy, maxTurns: 300, stage: walked });
      expect(run.refused).toEqual([]);
      fell += run.beats['fighting/fell'] ?? 0;
    }
    expect(fell).toBeGreaterThan(0);
  });
});
