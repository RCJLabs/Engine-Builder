/**
 * Saves made before M3.10 (docs/specs/quests.md#state): the quests kit's slice is version 2, and a
 * save of the dock made by version 1 (M3.9) must still load, its quests as they were, and play on.
 * Not its shape alone: Spliceworld's migration that emptied the jobs in flight passed tests that
 * checked only the shape.
 */
import { readFileSync } from 'node:fs';
import { type GameState, loadSave } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { dockGame, set } from '../../test/dock.ts';
import type { QuestsSlice } from './types.ts';

// Saved by the quests kit at version 1, with the debt failed, the bounty counting and the courier begun.
const V1 = JSON.parse(readFileSync(new URL('../../test/fixtures/saves/dock-quests-v1.json', import.meta.url), 'utf8'));
const { game, sim, apply, scrap } = dockGame;
const quests = (state: GameState) => (state.quests as QuestsSlice).quests;

describe('a save made by the quests kit’s version 1', () => {
  it('loads, migrated, with every quest as it was', () => {
    const loaded = loadSave(game, V1, sim, { game: 'dock', build: 'fixture-quests-v1' });
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.report.migrated).toEqual([{ module: 'quests', from: 1, to: 2 }]);
    expect(loaded.report).toMatchObject({ replayed: 3, skipped: 0 });
    expect(quests(loaded.state)).toEqual({
      debt: {
        state: 'failed',
        stage: 'hunted',
        log: ['owed', 'hunted'],
        done: [],
        counts: {},
        days: 0,
        why: 'You refused, and her crew found you.',
      },
      bounty: { state: 'active', stage: 'hunt', log: ['hunt'], done: [], counts: { scrap: 2 }, days: 2 },
      courier: { state: 'active', stage: 'pickup', log: ['pickup'], done: [], counts: {}, days: 2 },
    });
  });

  it('plays on: its count goes on from where it was, and its quests end as they would have', () => {
    const loaded = loadSave(game, V1, sim, { game: 'dock', build: 'fixture-quests-v1' });
    if (!loaded.ok) throw new Error(loaded.message);
    const third = scrap(loaded.state, 'drone').state;
    expect(quests(third).bounty).toMatchObject({ done: ['scrap'], counts: { scrap: 3 } });
    expect(quests(apply(third, set('met-chief'))).bounty?.state).toBe('done');
  });
});
