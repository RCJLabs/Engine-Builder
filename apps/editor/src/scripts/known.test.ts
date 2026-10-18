import { ENGINE_EVENTS, ENGINE_FACTS } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import type { GameState } from './gameState.ts';
import { eventsOf, factsOf, ownEffectsOf } from './known.ts';

const loaded: GameState = {
  ids: ['game'],
  status: 'loaded',
  problems: [],
  catalog: {
    modules: ['logic', 'flag', 'sheet', 'hold'],
    start: 'sea',
    facts: { 'flag.on': { args: { flag: { type: 'ref', to: 'flag' } } }, 'hold.count': { label: 'crates held' } },
    events: { 'hold/looted': { label: 'The crew loots' } },
    effects: ['add-to-flag', 'roll', 'set-flag', 'stash'],
    actions: ['hold/loot'],
    policies: [],
  },
};

describe('what forms offer from the game', () => {
  it('is the engine’s own until the game has run', () => {
    for (const game of [undefined, { ...loaded, status: 'untrusted' as const, catalog: null }]) {
      expect(factsOf(game)).toBe(ENGINE_FACTS);
      expect(eventsOf(game)).toBe(ENGINE_EVENTS);
      expect(ownEffectsOf(game)).toEqual([]);
    }
  });

  it('is the game’s once it has, the engine’s facts keeping their wording', () => {
    const facts = factsOf(loaded);
    expect(Object.keys(facts)).toEqual(['flag.on', 'hold.count']);
    expect(facts['flag.on']).toBe(ENGINE_FACTS['flag.on']);
    expect(facts['hold.count']).toEqual({ label: 'crates held' });
    expect(eventsOf(loaded)).toEqual({ 'hold/looted': { label: 'The crew loots' } });
    expect(ownEffectsOf(loaded)).toEqual(['stash']);
  });
});

describe('what forms offer with kits on', () => {
  it('adds the kits’ facts and events to the engine’s until the game has run', () => {
    const kits = ['inventory', 'economy'];
    const facts = factsOf(undefined, kits);
    expect(Object.keys(facts)).toEqual(expect.arrayContaining(['flag.on', 'inventory.count', 'economy.price']));
    expect(facts['inventory.count']?.label).toBe('carried');
    expect(eventsOf(undefined, kits)['economy/opened']?.label).toBe('A shop opens');
    expect(factsOf(undefined, ['inventory'])['economy.price']).toBeUndefined();
    expect(factsOf(undefined, [])).toBe(ENGINE_FACTS);
  });

  it('keeps a kit’s wording in the game’s, and never offers a kit’s effect as the game’s own', () => {
    const kitted: GameState = {
      ...loaded,
      catalog: {
        ...(loaded.catalog as NonNullable<GameState['catalog']>),
        facts: { 'inventory.count': { args: {} } },
        effects: ['give-item', 'set-flag', 'stash'],
      },
    };
    expect(factsOf(kitted, ['inventory'])['inventory.count']?.label).toBe('carried');
    expect(ownEffectsOf(kitted)).toEqual(['stash']);
  });
});
