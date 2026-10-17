import { describe, expect, it } from 'vitest';
import { content, game, sim } from '../../test/salvage.ts';
import { createRecordStore } from '../records.ts';
import { compareGolden, type Golden, GoldenError, goldenOf, readGolden } from './golden.ts';
import { randomPolicy } from './policy.ts';
import { seedsOf, sweep } from './sweep.ts';

const info = { game: 'salvage-run', content: 'pack-a', policy: 'random', maxTurns: 1000 };
const seeds = seedsOf(30, 'golden');
const played = (s = sim) => goldenOf(info, sweep(game, s, { seeds, policy: randomPolicy }).runs);

// Salvage run with a richer wreck: the same game, with content changed under it.
const richer = {
  content: createRecordStore({
    ...Object.fromEntries(content.types().map((type) => [type, Object.fromEntries(content.entries(type))])),
    'loot-table': { 'dead-hauler': { entries: [{ item: 'medkit', weight: 1 }] } },
  }),
};

describe('golden files', () => {
  const golden = played();

  it('keep every seed in the order played, and read back from JSON as they were', () => {
    expect(Object.keys(golden.runs)).toEqual(seeds);
    expect(readGolden(JSON.parse(JSON.stringify(golden)))).toEqual(golden);
  });

  it('match the same runs played again', () => {
    expect(compareGolden(golden, played())).toEqual({ same: true, contentChanged: false, differences: [] });
  });

  it('name each seed that plays out otherwise, and the slices where it differs', () => {
    const now = { ...played(richer), content: 'pack-b' };
    const result = compareGolden(golden, now);
    expect(result).toMatchObject({ same: false, contentChanged: true });
    expect(result.differences.length).toBeGreaterThan(0);
    for (const d of result.differences) {
      expect(d.facets.length).toBeGreaterThan(0);
      expect(d.facets).toEqual([...d.facets].sort());
      expect(d.was).toEqual(golden.runs[d.seed]);
    }
    // Loot lands in the hold, so every run that looted at all differs there.
    expect(result.differences.some((d) => d.facets.includes('hold'))).toBe(true);
  });

  it('name exactly the slices that moved, and a run that only took other turns', () => {
    const first = golden.runs['golden-0'] as Golden['runs'][string];
    const moved = { ...first, hash: 'moved', facets: { ...first.facets, crew: 'moved' } };
    const slower = { ...first, turns: first.turns + 1 };
    const withRun = (run: Golden['runs'][string]) => ({ ...golden, runs: { ...golden.runs, 'golden-0': run } });
    expect(compareGolden(golden, withRun(moved)).differences).toEqual([
      { seed: 'golden-0', was: first, now: moved, facets: ['crew'] },
    ]);
    expect(compareGolden(golden, withRun(slower)).differences).toEqual([
      { seed: 'golden-0', was: first, now: slower, facets: [] },
    ]);
  });

  it('refuse to compare runs played with other seeds, another policy or another cap', () => {
    const fewer = goldenOf(info, sweep(game, sim, { seeds: seeds.slice(1), policy: randomPolicy }).runs);
    expect(() => compareGolden(golden, fewer)).toThrow(GoldenError);
    expect(() => compareGolden(golden, { ...golden, policy: 'other' })).toThrow(GoldenError);
    expect(() => compareGolden(golden, { ...golden, maxTurns: 5 })).toThrow(GoldenError);
  });

  it.each([
    ['not an object', () => [], 'not a JSON object'],
    ['another format', (g: Golden) => ({ ...g, format: 2 }), 'format 2'],
    ['no game', (g: Golden) => ({ ...g, game: 'Salvage Run' }), 'no game id'],
    ['no content hash', (g: Golden) => ({ ...g, content: 1 }), 'no content hash'],
    ['no policy', (g: Golden) => ({ ...g, policy: '' }), 'no policy name'],
    ['no cap', (g: Golden) => ({ ...g, maxTurns: 0 }), 'no turn cap'],
    ['no runs', (g: Golden) => ({ ...g, runs: {} }), 'no runs'],
    [
      'a broken run',
      (g: Golden) => ({ ...g, runs: { ...g.runs, 'golden-3': { ...g.runs['golden-3'], end: 'won' } } }),
      'the run of seed "golden-3" is malformed',
    ],
  ])('refuse a file with %s', (_name, change, message) => {
    expect(() => readGolden(change(golden))).toThrow(message);
  });
});
