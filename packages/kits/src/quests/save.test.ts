/**
 * Saves made before M3.10 and M6.6 (docs/specs/quests.md#state): the quests kit's slice is version 3,
 * and saves of the dock made by version 1 (M3.9) and version 2 (M3.10) must still load, their quests
 * as they were, and play on; version 3 tracks the first active quest of a save made before it.
 * Not its shape alone: Spliceworld's migration that emptied the jobs in flight passed tests that
 * checked only the shape.
 */
import { readFileSync } from 'node:fs';
import { type GameState, loadSave } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { dockGame, set } from '../../test/dock.ts';
import type { QuestsSlice } from './types.ts';

// Saved by the quests kit at version 1, with the debt failed, the bounty counting and the courier begun.
const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../test/fixtures/saves/${name}`, import.meta.url), 'utf8'));
const V1 = fixture('dock-quests-v1.json');
// Saved by version 2 (M3.10), the same play: the debt refused, the bounty counting, the courier begun.
const V2 = fixture('dock-quests-v2.json');
const { game, sim, apply, scrap } = dockGame;
const quests = (state: GameState) => (state.quests as QuestsSlice).quests;

describe('a save made by the quests kit’s version 1', () => {
  it('loads, migrated, with every quest as it was', () => {
    const loaded = loadSave(game, V1, sim, { game: 'dock', build: 'fixture-quests-v1' });
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.report.migrated).toEqual([{ module: 'quests', from: 1, to: 3 }]);
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

describe('a save made by the quests kit’s version 2', () => {
  it('loads, migrated, its quests as they were and the first active by id tracked', () => {
    const loaded = loadSave(game, V2, sim, { game: 'dock', build: 'fixture-quests-v2' });
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.report.migrated).toEqual([{ module: 'quests', from: 2, to: 3 }]);
    expect(loaded.report).toMatchObject({ replayed: 3, skipped: 0 });
    const slice = loaded.state.quests as QuestsSlice;
    expect(Object.keys(slice.quests).sort()).toEqual(['bounty', 'courier', 'debt']);
    expect(slice.quests.debt?.state).toBe('failed');
    expect(slice.quests.bounty).toMatchObject({ state: 'active', counts: { scrap: 2 } });
    // Tracked as version 3 would have it: the courier started last, but a save from before can't say so.
    expect(slice.tracked).toBe('bounty');
  });

  it('plays on, tracking as it goes', () => {
    const loaded = loadSave(game, V2, sim, { game: 'dock', build: 'fixture-quests-v2' });
    if (!loaded.ok) throw new Error(loaded.message);
    const third = scrap(loaded.state, 'drone').state;
    const done = apply(third, set('met-chief'));
    expect(quests(done).bounty?.state).toBe('done');
    // The bounty done starts the dock's trust, which, the last started, is tracked.
    expect((done.quests as QuestsSlice).tracked).toBe('trusted');
  });
});
