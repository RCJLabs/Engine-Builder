/**
 * The market: a test-only game for the kits. A town where the party works jobs that roll loot,
 * waits for days to pass, and visits two shops, with the kits' modules beside the engine's. The
 * numbers are Space-Wrecked's where it has them: parts at their values, credits in steps of 5,
 * and a dealer who sells at 100% and buys back at 50%.
 */
import {
  type Action,
  createGame,
  createRecordStore,
  defineModule,
  type Effect,
  flagModule,
  type GameState,
  logicModule,
  type SimContext,
  timeModule,
} from '@eb/core';
import { economyKit, inventoryKit } from '../src/index.ts';

const owesDutch = { fact: 'flag.on', args: { flag: 'owes-dutch' } };

export const RECORDS = {
  item: {
    reactor: { name: 'Reactor', value: 200, max: 2, tags: ['part', 'power'] },
    airlock: { name: 'Airlock', value: 45, tags: ['part'] },
    corridor: { name: 'Corridor', value: 10, tags: ['part'] },
    medkit: { name: 'Medkit', value: 30, tags: ['supply'] },
    junk: { name: 'Junk' },
  },
  resource: {
    credits: { name: 'Credits', start: 60, step: 5 },
    fuel: { name: 'Fuel', start: 3, max: 5 },
  },
  'loot-table': {
    scrap: { nothing: 60, entries: [{ table: 'scrap-parts', weight: 40 }] },
    'scrap-parts': {
      entries: [
        { item: 'airlock', weight: 1 },
        { item: 'corridor', weight: 1 },
        { item: 'reactor', weight: 1 },
      ],
    },
    cash: { entries: [{ resource: 'credits', weight: 1, count: { min: 5, max: 15 } }] },
    stock: {
      picks: { min: 2 },
      unique: true,
      entries: [
        { item: 'reactor', weight: 1 },
        { item: 'airlock', weight: 2 },
        { item: 'corridor', weight: 3 },
        { item: 'medkit', weight: 1 },
      ],
    },
  },
  shop: {
    dutch: {
      name: "Dutch's yard",
      currency: 'credits',
      buys: {},
      stock: { items: [{ item: 'medkit', count: 2 }], table: 'stock', every: { days: 2 } },
      rules: [{ if: owesDutch, percent: 120 }],
    },
    picky: {
      currency: 'credits',
      'sells-at': 150,
      'buys-at': 60,
      buys: { tags: ['part'] },
      stock: { items: [{ item: 'corridor' }] },
    },
  },
  flag: { 'owes-dutch': {} },
};

export const content = createRecordStore(RECORDS);
export const sim: SimContext = { content };

/** A town to act in: `do` applies any effects, for tests to reach every effect inside a real action. */
const town = defineModule<Record<string, never>>({
  id: 'town',
  init: () => ({}),
  actions: {
    do: {
      run: (ctx, action) => {
        for (const effect of action.effects as Effect[]) ctx.apply(effect);
      },
      options: () => [],
    },
    visit: {
      run: (ctx, action) => ctx.apply({ effect: 'open-shop', shop: action.shop }),
      options: () => [{ shop: 'dutch' }, { shop: 'picky' }],
    },
    work: {
      run: (ctx, action) => {
        ctx.apply({ effect: 'wait', days: 1 });
        ctx.apply({ effect: 'roll-loot', table: action.table });
      },
      options: () => [{ table: 'scrap' }, { table: 'cash' }],
    },
    wait: (ctx) => ctx.apply({ effect: 'wait', days: 1 }),
  },
  modes: { town: { actions: ['town/*'] } },
});

export const MODULES = [
  logicModule,
  timeModule({ calendar: { ticksPerDay: 1 } }),
  flagModule,
  inventoryKit,
  economyKit,
  town,
];
export const game = createGame({ modules: MODULES, start: 'town' });

export const start = (seed = 'market'): GameState => game.init(seed, sim);

/** Takes the action, and throws if it is refused: a step a test expects to go through. */
export function step(state: GameState, action: Action): GameState {
  const result = game.reduce(state, action, sim);
  if (!result.accepted) throw new Error(`Refused ${action.type}: ${JSON.stringify(result.beats[0])}`);
  return result.state;
}

export const apply = (state: GameState, ...effects: Effect[]) => step(state, { type: 'town/do', effects });
export const fact = (state: GameState, id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim);
