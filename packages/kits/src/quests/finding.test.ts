/**
 * Slots that find in the world (M6.7, D79, docs/specs/radiant.md): a space by its tags, an object in
 * it and an actor standing there; the nearest by doors, ties drawn; a space slot trying its next match
 * when one In it can't be filled; a repeat trying its last pick last; the taken and the fallen left
 * out; and `{slot}` naming a space or an object. Played on a small world through the world module.
 */
import {
  type Action,
  createGame,
  createRecordStore,
  defineModule,
  type Effect,
  engineModules,
  type GameState,
  type Module,
  type PackWorld,
  type SimContext,
  type WorldData,
  type WorldPlaces,
  withPackWorld,
  worldModule,
} from '@eb/core';
import { describe, expect, it } from 'vitest';
import { kitModules, kitsInWorld } from '../modules.ts';
import { questsModule } from './module.ts';
import type { QuestsSlice } from './types.ts';

const door = (space: string) => ({ label: 'Go', effects: [{ effect: 'enter-space', space }] });

// The green, a door to the barrow, to the den and to the hall, and from the hall to the mine.
const PLACES: WorldPlaces = {
  spaces: {
    barrow: { name: 'The barrow', tags: ['cave'] },
    den: { name: 'The den', tags: ['cave', 'dry'] },
    green: { name: 'The green', tags: [] },
    hall: { name: 'The hall', tags: [] },
    mine: { name: 'The mine', tags: ['cave'] },
  },
  objects: {
    barrow: { cache: { tags: ['cache'], name: 'Crate' }, wick: { tags: ['chief'] } },
    mine: { 'stash/chest': { tags: ['cache'] }, 'empty/chest': { tags: ['empty'] } },
  },
  actors: {
    moss: { space: 'barrow', path: 'moss' },
    rusk: { space: 'mine', path: 'rusk' },
    wick: { space: 'barrow', path: 'wick' },
  },
};

const WORLD: WorldData = {
  triggers: {},
  uses: {
    barrow: { 'way-out': door('green'), cache: { label: 'Take', effects: [], takes: true } },
    den: { 'way-out': door('green') },
    green: { 'barrow-door': door('barrow'), 'den-door': door('den'), 'hall-door': door('hall') },
    hall: { 'mine-door': door('mine'), 'way-out': door('green') },
    mine: { 'stash/chest': { label: 'Take', effects: [], takes: true }, 'way-out': door('green') },
  },
  spawns: { barrow: [], den: [], green: [], hall: [], mine: [] },
  start: 'green',
  actors: PLACES.actors,
  places: PLACES,
};

const test = defineModule<Record<string, never>>({
  id: 'test',
  init: () => ({}),
  actions: {
    do: {
      run: (ctx, action) => {
        for (const effect of action.effects as Effect[]) ctx.apply(effect);
      },
      options: () => [],
    },
  },
  modes: { out: { actions: ['test/*', 'world/*'] } },
});

function cavesWith(quests: Record<string, object>, places: WorldPlaces = PLACES) {
  const game = createGame({
    modules: [...engineModules, worldModule(WORLD), questsModule(places), test],
    start: 'out',
  });
  const actor = (name: string) => ({ name });
  const sim: SimContext = {
    content: createRecordStore({
      quest: quests,
      actor: { moss: actor('Moss'), rusk: actor('Rusk'), wick: actor('Wick') },
    }),
  };
  const step = (state: GameState, action: Action) => {
    const result = game.reduce(state, action, sim);
    if (!result.accepted) throw new Error(`Refused ${action.type}: ${JSON.stringify(result.beats[0])}`);
    return result.state;
  };
  return {
    start: (seed = 'caves') => game.init(seed, sim),
    step,
    apply: (state: GameState, ...effects: Effect[]) => step(state, { type: 'test/do', effects }),
    tryApply: (state: GameState, ...effects: Effect[]) => game.reduce(state, { type: 'test/do', effects }, sim),
    canStart: (state: GameState, quest: string) => game.fact(state, 'quests.can-start', { quest }, sim),
    shown: (state: GameState, quest: string) =>
      game.preview(state, [{ effect: 'start-quest', quest }], sim)[0] as unknown as {
        log?: string[];
        objectives?: { text: string }[];
      },
  };
}

const slotsOf = (state: GameState, quest: string) => (state.quests as QuestsSlice).quests[quest]?.slots;
const start = (quest: string) => ({ effect: 'start-quest', quest });
const use = (space: string, object: string): Action => ({ type: 'world/use', space, object });
const into = (space: string): Effect => ({ effect: 'enter-space', space });
const stage = {
  id: 'go',
  log: 'Off to {cave}.',
  objectives: [
    { id: 'it', text: 'The {cache} in {cave}', 'done-when': { fact: 'world.in', args: { space: 'nowhere' } } },
  ],
};

describe('slots that find in the world', () => {
  it('finds a space by every tag it asks for, the first by id', () => {
    const caves = cavesWith({
      any: { name: 'Any', slots: [{ id: 'cave', type: 'space', tags: ['cave'] }], stages: [stage] },
    });
    expect(slotsOf(caves.apply(caves.start(), start('any')), 'any')).toEqual({ cave: 'barrow' });
    const dry = cavesWith({
      dry: { name: 'Dry', slots: [{ id: 'cave', type: 'space', tags: ['cave', 'dry'] }], stages: [stage] },
    });
    expect(slotsOf(dry.apply(dry.start(), start('dry')), 'dry')).toEqual({ cave: 'den' });
  });

  it('takes the nearest by doors from where the player is: from the hall, the mine', () => {
    const quest = {
      name: 'Near',
      slots: [{ id: 'cave', type: 'space', tags: ['cave'], pick: 'nearest' }],
      stages: [stage],
    };
    const caves = cavesWith({ near: quest });
    const inHall = caves.apply(caves.start(), into('hall'));
    expect(slotsOf(caves.apply(inHall, start('near')), 'near')).toEqual({ cave: 'mine' });
  });

  it('draws among the nearest when they tie, from the quests stream', () => {
    const quest = {
      name: 'Near',
      slots: [{ id: 'cave', type: 'space', tags: ['cave'], pick: 'nearest' }],
      stages: [stage],
    };
    const caves = cavesWith({ near: quest });
    const picks = new Set(
      Array.from({ length: 24 }, (_, i) => slotsOf(caves.apply(caves.start(`seed-${i}`), start('near')), 'near')?.cave),
    );
    // The barrow and the den are a door from the green each; the mine is two.
    expect([...picks].sort()).toEqual(['barrow', 'den']);
  });

  it('finds an object In a space slot by its tags, through a prefab, and names both', () => {
    const quest = {
      name: 'Fetch',
      slots: [
        { id: 'cave', type: 'space', tags: ['cave'], where: { fact: 'world.in', args: { space: 'green' } } },
        { id: 'cache', type: 'object', in: '@cave', tags: ['cache'] },
      ],
      stages: [stage],
    };
    const caves = cavesWith({ fetch: quest });
    const started = caves.apply(caves.start(), start('fetch'));
    expect(slotsOf(started, 'fetch')).toEqual({ cave: 'barrow', cache: 'cache' });
    expect(caves.shown(started, 'fetch')).toMatchObject({
      log: ['Off to The barrow.'],
      objectives: [{ text: 'The Crate in The barrow' }],
    });
  });

  it('sends a space slot to its next match when the one In it can’t be filled, and the taken are left out', () => {
    const quest = {
      name: 'Fetch',
      repeats: true,
      slots: [
        { id: 'cave', type: 'space', tags: ['cave'] },
        { id: 'cache', type: 'object', in: '@cave', tags: ['cache'] },
      ],
      stages: [stage],
    };
    const caves = cavesWith({ fetch: quest });
    const taken = caves.step(caves.apply(caves.start(), into('barrow')), use('barrow', 'cache'));
    const started = caves.apply(taken, start('fetch'));
    // The barrow first by id, its cache taken; the den has none; the mine's chest has no name of its own.
    expect(slotsOf(started, 'fetch')).toEqual({ cave: 'mine', cache: 'stash/chest' });
    expect(caves.shown(started, 'fetch').objectives).toEqual([
      expect.objectContaining({ text: 'The chest in The mine' }),
    ]);
    // Taking what a run found doesn't make it gone: the quest runs on.
    const used = caves.step(caves.apply(started, into('mine')), use('mine', 'stash/chest'));
    expect((used.quests as QuestsSlice).quests.fetch?.state).toBe('active');
  });

  it('tries the last run’s pick last on a repeat, and it again when nothing else matches', () => {
    const quest = {
      name: 'Visit',
      repeats: true,
      slots: [{ id: 'cave', type: 'space', tags: ['cave'], pick: 'nearest' }],
      stages: [{ id: 'go', log: 'Go.' }],
    };
    const caves = cavesWith({
      visit: { ...quest, slots: [{ ...quest.slots[0], tags: ['cave', 'dry'] }] },
      near: quest,
    });
    // A stage with no objectives is done at once, so each start is a run of its own. Over a dozen
    // seeds, as the barrow and the den tie and a draw alone would repeat itself half the time.
    for (let i = 0; i < 12; i++) {
      const first = caves.apply(caves.start(`seed-${i}`), start('near'));
      const was = slotsOf(first, 'near')?.cave;
      const second = caves.apply(first, start('near'));
      expect(slotsOf(second, 'near')?.cave).toBe(was === 'barrow' ? 'den' : 'barrow');
    }
    const only = caves.apply(caves.apply(caves.start(), start('visit')), start('visit'));
    expect(slotsOf(only, 'visit')).toEqual({ cave: 'den' });
  });

  it('says whether start-quest would start a quest now, its slots found (quests.can-start, M6.9)', () => {
    const fetch = {
      name: 'Fetch',
      repeats: true,
      slots: [
        { id: 'cave', type: 'space', tags: ['cave'] },
        { id: 'cache', type: 'object', in: '@cave', tags: ['cache'] },
      ],
      stages: [stage],
    };
    // With no objectives, each is done as it starts: one repeats and one doesn't.
    const again = {
      name: 'Again',
      repeats: true,
      slots: [{ id: 'cave', type: 'space', tags: ['cave'] }],
      stages: [{ id: 'go', log: 'Go.' }],
    };
    const once = { name: 'Once', stages: [{ id: 'go', log: 'Go.' }] };
    const caves = cavesWith({ again, fetch, once });
    let state = caves.start();
    expect(['again', 'fetch', 'once'].map((q) => caves.canStart(state, q))).toEqual([true, true, true]);
    state = caves.apply(state, start('again'), start('once'));
    expect(caves.canStart(state, 'again')).toBe(true);
    expect(caves.canStart(state, 'once')).toBe(false);
    expect(caves.canStart(caves.apply(state, start('fetch')), 'fetch')).toBe(false);
    // Both caches taken: nothing left to fill its slots, and start-quest is refused as the fact says.
    state = caves.step(caves.apply(state, into('barrow')), use('barrow', 'cache'));
    state = caves.step(caves.apply(state, into('mine')), use('mine', 'stash/chest'));
    expect(caves.canStart(state, 'fetch')).toBe(false);
    expect(caves.tryApply(state, start('fetch')).accepted).toBe(false);
    expect(caves.canStart(state, 'again')).toBe(true);
  });

  it('finds an actor placed In a space slot, by its placement’s tags, never one fallen', () => {
    const quest = {
      name: 'Bounty',
      slots: [
        { id: 'den', type: 'space', tags: ['cave'] },
        { id: 'chief', type: 'actor', in: '@den', tags: ['chief'] },
      ],
      stages: [stage],
    };
    const caves = cavesWith({ bounty: quest });
    expect(slotsOf(caves.apply(caves.start(), start('bounty')), 'bounty')).toEqual({ den: 'barrow', chief: 'wick' });
    const fell = caves.apply(caves.start(), { effect: 'fall', actor: 'wick' });
    const refused = caves.tryApply(fell, start('bounty'));
    expect(refused.accepted).toBe(false);
    const anyone = cavesWith({
      any: { ...quest, slots: [quest.slots[0], { id: 'chief', type: 'actor', in: '@den' }] },
    });
    // Moss before Wick by id, in the barrow; with Moss down, Wick.
    expect(slotsOf(anyone.apply(anyone.start(), start('any')), 'any')).toEqual({ den: 'barrow', chief: 'moss' });
    const mossDown = anyone.apply(anyone.start(), { effect: 'fall', actor: 'moss' });
    expect(slotsOf(anyone.apply(mossDown, start('any')), 'any')).toEqual({ den: 'barrow', chief: 'wick' });
  });

  it('leaves out a space no door leads to when it takes the nearest', () => {
    const vaulted: WorldPlaces = {
      ...PLACES,
      spaces: { ...PLACES.spaces, vault: { name: 'The vault', tags: ['sealed'] } },
    };
    const quest = (pick?: string) => ({
      name: 'Vault',
      slots: [{ id: 'cave', type: 'space', tags: ['sealed'], ...(pick === undefined ? {} : { pick }) }],
      stages: [stage],
    });
    const first = cavesWith({ vault: quest() }, vaulted);
    expect(slotsOf(first.apply(first.start(), start('vault')), 'vault')).toEqual({ cave: 'vault' });
    const near = cavesWith({ vault: quest('nearest') }, vaulted);
    expect(near.tryApply(near.start(), start('vault')).accepted).toBe(false);
  });

  it('names the slot In a space that none of its matches could fill', () => {
    const quest = {
      name: 'Fetch',
      slots: [
        { id: 'cave', type: 'space', tags: ['cave'] },
        { id: 'cache', type: 'object', in: '@cave', tags: ['cache'] },
      ],
      stages: [stage],
    };
    const caves = cavesWith({ fetch: quest });
    const barrow = caves.step(caves.apply(caves.start(), into('barrow')), use('barrow', 'cache'));
    const both = caves.step(caves.apply(barrow, into('mine')), use('mine', 'stash/chest'));
    const refused = caves.tryApply(both, start('fetch'));
    expect(refused.accepted).toBe(false);
    expect(refused.beats[0]).toMatchObject({ reason: 'unfilled', quest: 'fetch', slot: 'cache' });
  });

  it('counts a run’s space or object as gone once a build of the game no longer has it', () => {
    const quest = {
      name: 'Fetch',
      slots: [
        { id: 'cave', type: 'space', tags: ['cave'] },
        { id: 'cache', type: 'object', in: '@cave', tags: ['cache'] },
      ],
      stages: [stage],
    };
    const caves = cavesWith({ fetch: quest });
    const started = caves.apply(caves.start(), start('fetch'));
    expect(slotsOf(started, 'fetch')).toEqual({ cave: 'barrow', cache: 'cache' });
    const stateOf = (state: GameState) => (state.quests as QuestsSlice).quests.fetch;
    // The same build: a step later the run goes on.
    expect(stateOf(caves.apply(started, into('green')))?.state).toBe('active');
    const { barrow: _, ...spaces } = PLACES.spaces;
    const noBarrow = cavesWith({ fetch: quest }, { ...PLACES, spaces });
    expect(stateOf(noBarrow.apply(started, into('green')))).toMatchObject({ state: 'failed', lost: ['cave'] });
    const { cache: __, ...objects } = PLACES.objects.barrow ?? {};
    const noCache = cavesWith({ fetch: quest }, { ...PLACES, objects: { ...PLACES.objects, barrow: objects } });
    expect(stateOf(noCache.apply(started, into('green')))).toMatchObject({ state: 'failed', lost: ['cache'] });
  });

  it('leaves a slot of records as M3.10 has it: the same pick each run, and no next match tried', () => {
    const green = { fact: 'world.in', args: { space: 'green' } };
    const caves = cavesWith({
      again: {
        name: 'Again',
        repeats: true,
        slots: [{ id: 'who', type: 'actor', where: green }],
        stages: [{ id: 'go' }],
      },
      pair: {
        name: 'Pair',
        slots: [
          { id: 'who', type: 'actor', where: green },
          { id: 'other', type: 'actor', where: { fact: 'world.npc-down', args: { actor: '@who' } } },
        ],
        stages: [stage],
      },
    });
    const twice = caves.apply(caves.apply(caves.start(), start('again')), start('again'));
    expect(slotsOf(twice, 'again')).toEqual({ who: 'moss' });
    // Moss is first and standing, so Other can't be filled; Who doesn't go on to Wick, who is down.
    const wickDown = caves.apply(caves.start(), { effect: 'fall', actor: 'wick' });
    const refused = caves.tryApply(wickDown, start('pair'));
    expect(refused.accepted).toBe(false);
    expect(refused.beats[0]).toMatchObject({ reason: 'unfilled', quest: 'pair', slot: 'other' });
  });

  it('is swapped for one that knows the world in a game made before its pack, as eb sim and Run make theirs', () => {
    const pack: PackWorld = {
      spaces: { cave: { name: 'The cave', objects: [] }, green: { name: 'The green', objects: [] } },
      prefabs: {},
      triggers: {},
      files: {},
      records: {},
      fields: {},
      uses: {},
      spawns: { cave: [], green: [] },
      start: 'green',
      places: { spaces: { cave: { tags: ['cave'] }, green: { tags: [] } }, objects: {} },
    };
    const quest = { name: 'Any', slots: [{ id: 'cave', type: 'space', tags: ['cave'] }], stages: [stage] };
    const sim: SimContext = { content: createRecordStore({ quest: { any: quest } }) };
    const tried = (kits: readonly Module[]) => {
      const modules = withPackWorld([...engineModules, worldModule(WORLD), ...kits, test], pack);
      const game = createGame({ modules, start: 'out' });
      return game.reduce(game.init('any', sim), { type: 'test/do', effects: [start('any')] }, sim);
    };
    const alone = kitModules(['quests']);
    expect(tried(alone).accepted).toBe(false);
    const swapped = tried(kitsInWorld(alone, pack));
    expect(swapped.accepted).toBe(true);
    expect((swapped.state.quests as QuestsSlice).quests.any?.slots).toEqual({ cave: 'cave' });
  });

  it('fills no world slot in a game whose kit was built without places', () => {
    const quest = { name: 'Any', slots: [{ id: 'cave', type: 'space', tags: ['cave'] }], stages: [stage] };
    const caves = cavesWith({ any: quest }, { spaces: {}, objects: {}, actors: {} });
    expect(caves.tryApply(caves.start(), start('any')).accepted).toBe(false);
  });
});
