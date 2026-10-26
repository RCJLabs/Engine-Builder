/**
 * The camp: a test-only game for the fighting kit (M6.4). A hero with a sword, and three bandits
 * who wander the camp until they are alerted and then attack: Rook and Crow with swords, Wren with a
 * bow. Rook carries coin and drops a purse as they fall; a hermit stands in a cave the player isn't
 * in. A tick is a minute.
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
  type SimContext,
  type WorldSlice,
  worldModule,
} from '@eb/core';
import type { FightingDef, FightingSlice } from '../src/fighting/types.ts';
import { kitModules } from '../src/index.ts';
import { CALENDAR } from './village.ts';

export const FIGHTING: FightingDef = { player: 'hero', combat: 'blades' };

const alerted = { fact: 'ai.level', args: { actor: '@self' }, op: '==', value: 'alerted' } as const;

export const RECORDS = {
  stat: {
    health: { name: 'Health', min: 0, start: 10 },
    might: { name: 'Might', min: 0 },
    armour: { name: 'Armour', min: 0 },
  },
  combat: { blades: { name: 'Blades', health: 'health', hit: 'might', damage: 'might', armour: 'armour' } },
  slot: { hand: { name: 'Hand' } },
  item: {
    sword: { name: 'Sword', slot: 'hand', weapon: { kind: 'melee', damage: 4 } },
    bow: { name: 'Bow', slot: 'hand', weapon: { kind: 'ranged', damage: 3, ammo: 'arrow' } },
    arrow: { name: 'Arrow' },
    coin: { name: 'Coin' },
  },
  'loot-table': { purse: { entries: [{ item: 'coin', weight: 1, count: { min: 2 } }] } },
  behaviour: {
    bandit: {
      do: {
        first: [
          { if: alerted, do: { attack: 'player' } },
          { do: { sandbox: ['tent', 'fire'], dwell: { minutes: 10 } } },
        ],
      },
    },
  },
  actor: {
    hero: {
      name: 'The hero',
      stats: { health: 12, might: 1, armour: 1 },
      wears: { hand: 'sword' },
      'on-fall': [{ effect: 'set-flag', flag: 'lost', to: true }],
    },
    rook: {
      name: 'Rook',
      stats: { health: 6, armour: 1 },
      wears: { hand: 'sword' },
      behaviour: 'bandit',
      carries: { coin: 3 },
      drops: 'purse',
    },
    crow: { name: 'Crow', stats: { health: 6 }, wears: { hand: 'sword' }, behaviour: 'bandit' },
    wren: { name: 'Wren', stats: { health: 8 }, wears: { hand: 'bow' }, behaviour: 'bandit' },
    hermit: { name: 'The hermit', stats: { health: 4 } },
  },
  flag: { lost: {} },
};

export const WORLD = {
  triggers: {},
  uses: {},
  spawns: { camp: [], cave: [] },
  start: 'camp',
  actors: {
    rook: { space: 'camp', path: 'rook' },
    crow: { space: 'camp', path: 'crow' },
    wren: { space: 'camp', path: 'wren' },
    hermit: { space: 'cave', path: 'hermit' },
  },
};

/** The camp's own: `do` applies any effects, as a game's scripts would. */
const camp = defineModule<object>({
  id: 'camp',
  init: () => ({}),
  actions: {
    do: {
      run: (ctx, action) => {
        for (const effect of action.effects as Effect[]) ctx.apply(effect);
      },
      options: () => [],
    },
  },
  modes: { out: { actions: ['world/*', 'time/*', 'ai/*', 'fighting/*', 'camp/*'] } },
});

const KITS = ['inventory', 'stats', 'gear', 'time', 'encounters', 'ai', 'fighting'];

/** The camp's game, with project.json's fighting or, as a game without a world has it, none (null). */
export function campWith(fighting: FightingDef | null = FIGHTING, records: object = RECORDS) {
  const modules: Module[] = [
    ...engineModules,
    ...kitModules(KITS, { ...CALENDAR, start: { tick: 12 * 60 } }, undefined, fighting ?? undefined),
    worldModule(WORLD),
    camp,
  ];
  const game = createGame({ modules, start: 'out' });
  const sim: SimContext = { content: createRecordStore(records as Record<string, Record<string, unknown>>) };
  const take = (state: GameState, action: Action) => game.reduce(state, action, sim);
  const must = (state: GameState, action: Action) => {
    const step = take(state, action);
    if (!step.accepted) throw new Error(`Refused ${action.type}: ${JSON.stringify(step.beats[0])}`);
    return step;
  };
  const fact = (state: GameState, id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim);
  return {
    game,
    sim,
    start: (seed = 'camp') => game.init(seed, sim),
    take,
    must,
    fact,
    hit: (state: GameState, by: string, on: string, weapon = 'sword') =>
      take(state, { type: 'fighting/hit', by, on, weapon }),
    apply: (state: GameState, ...effects: Effect[]) => must(state, { type: 'camp/do', effects }).state,
    health: (state: GameState, actor: string) => fact(state, 'stats.current', { actor, stat: 'health' }),
    slice: (state: GameState) => state.fighting as FightingSlice,
    npcs: (state: GameState) => (state.world as WorldSlice).npcs,
  };
}
