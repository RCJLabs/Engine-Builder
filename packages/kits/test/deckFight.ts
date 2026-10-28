/**
 * The deck fight: a test-only game for the tactics kit (M7.5, D87). Space-Wrecked's example ship as the
 * deck's tilemap, a marine, an engineer and a medic on the bridge against two pirates and a brute at the
 * hatch, by Space-Wrecked's numbers (fixtures/space-wrecked/NOTICE). The deck's own module applies effects,
 * as a game's scripts would.
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
  type PackTiles,
  type SimContext,
} from '@eb/core';
import { kitModules } from '../src/index.ts';
import type { TacticsSlice } from '../src/tactics/types.ts';
import { GUNS, KINDS, ORDERS, shipTiles } from './tactics.ts';

/** Where each object of the deck stands, Space-Wrecked's (x, y − 1). */
const PLACES: PackTiles['places'] = {
  'bridge-1': [9, 1],
  'bridge-2': [9, 2],
  'bridge-3': [10, 2],
  'hatch-1': [5, 3],
  'hatch-2': [6, 3],
  'hatch-3': [4, 3],
  wall: [0, 0],
};

export const TILES: Readonly<Record<string, PackTiles>> = { deck: { ...shipTiles(), object: 'deck', places: PLACES } };

const actor = (kind: string) => {
  const k = KINDS[kind] as (typeof KINDS)[string];
  const stats = { health: k.hp, aim: k.aim, defense: k.defense, armor: k.armor, mobility: k.mobility };
  return { name: k.name, stats, gun: k.gun, ...(k.order ? { order: k.order } : {}) };
};

export const RECORDS = {
  stat: {
    health: { name: 'Health', min: 0 },
    aim: { name: 'Aim', min: 0 },
    defense: { name: 'Defense', min: 0 },
    armor: { name: 'Armor', min: 0 },
    mobility: { name: 'Mobility', min: 1 },
  },
  status: { hurt: { name: 'Hurt' } },
  flag: { won: {}, lost: {} },
  'battle-rules': {
    boarding: {
      name: 'Boarding',
      health: 'health',
      aim: 'aim',
      defense: 'defense',
      armor: 'armor',
      mobility: 'mobility',
    },
  },
  gun: GUNS,
  order: ORDERS,
  actor: {
    ...Object.fromEntries(['marine', 'engineer', 'medic', 'pirate', 'brute'].map((kind) => [kind, actor(kind)])),
    // Sure shots, for a duel whose every shot hits.
    ace: { ...actor('marine'), stats: { ...actor('marine').stats, aim: 200 } },
    dummy: { ...actor('brute'), stats: { ...actor('brute').stats, aim: 200, health: 1 } },
  },
  battle: {
    boarders: {
      name: 'Boarders',
      rules: 'boarding',
      space: 'deck',
      crew: [
        { actor: 'marine', at: 'bridge-1' },
        { actor: 'engineer', at: 'bridge-2' },
        { actor: 'medic', at: 'bridge-3' },
      ],
      foes: [
        { actor: 'pirate', at: 'hatch-1' },
        { actor: 'pirate', at: 'hatch-2' },
        { actor: 'brute', at: 'hatch-3' },
      ],
      press: true,
      win: [{ effect: 'set-flag', flag: 'won', to: true }],
      lose: [{ effect: 'set-flag', flag: 'lost', to: true }],
      falls: 'hurt',
    },
    duel: {
      rules: 'boarding',
      space: 'deck',
      crew: [{ actor: 'ace', at: 'bridge-1' }],
      foes: [{ actor: 'dummy', at: 'bridge-3' }],
      first: 'foes',
      win: [{ effect: 'set-flag', flag: 'won', to: true }],
      lose: [{ effect: 'set-flag', flag: 'lost', to: true }],
      falls: 'hurt',
    },
  },
};

const deck = defineModule<object>({
  id: 'deck',
  init: () => ({}),
  actions: {
    do: {
      run: (ctx, action) => {
        for (const effect of action.effects as Effect[]) ctx.apply(effect);
      },
      options: () => [],
    },
  },
  modes: { out: { actions: ['deck/*'] } },
});

export function deckFight(records: object = RECORDS, tiles = TILES) {
  const modules: Module[] = [
    ...engineModules,
    ...kitModules(['stats', 'tactics'], undefined, undefined, undefined, { uses: {}, tiles }),
    deck,
  ];
  const game = createGame({ modules, start: 'out' });
  const sim: SimContext = { content: createRecordStore(records as Record<string, Record<string, unknown>>) };
  const take = (state: GameState, action: Action) => game.reduce(state, action, sim);
  const must = (state: GameState, action: Action) => {
    const step = take(state, action);
    if (!step.accepted) throw new Error(`Refused ${JSON.stringify(action)}: ${JSON.stringify(step.beats[0])}`);
    return step;
  };
  const fact = (state: GameState, id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim);
  return {
    game,
    sim,
    start: (seed = 'deck') => game.init(seed, sim),
    take,
    must,
    fact,
    apply: (state: GameState, ...effects: Effect[]) => must(state, { type: 'deck/do', effects }),
    slice: (state: GameState) => state.tactics as TacticsSlice,
    health: (state: GameState, actor: string) => fact(state, 'stats.current', { actor, stat: 'health' }),
  };
}
