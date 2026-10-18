/**
 * The embassy: a test-only game for the factions kit. Space-Wrecked's free traders, from −10 to
 * 10 in its five levels and their prices; Landnam's raiders, from −10 in its bands of −100 to 100,
 * drifting back toward 0 a point every 8 days; and a crown with no bands. A trading post names the
 * traders, and a sheet's row on each day's start counts the days it finds the raiders at −10. The
 * engine's own modules come first, as in every game, and a day is a tick.
 */
import {
  type Action,
  createGame,
  createRecordStore,
  defineModule,
  type Effect,
  engineModules,
  type GameState,
  type SimContext,
  timeModule,
} from '@eb/core';
import { economyKit, factionsKit, inventoryKit } from '../src/index.ts';

const RAIDERS_AT_START = { fact: 'factions.standing', args: { faction: 'raiders' }, op: '==', value: -10 };

export const RECORDS = {
  faction: {
    traders: {
      name: 'The Free Traders',
      min: -10,
      max: 10,
      bands: [
        { id: 'hostile', price: 150 },
        { id: 'cold', from: -5, price: 125 },
        { id: 'neutral', from: -1 },
        { id: 'friendly', from: 2, price: 90 },
        { id: 'trusted', from: 6, price: 75 },
      ],
    },
    raiders: {
      name: 'Raiders',
      min: -100,
      max: 100,
      start: -10,
      bands: [
        { id: 'hostile' },
        { id: 'cold', from: -35 },
        { id: 'wary', from: -10 },
        { id: 'friendly', from: 25 },
        { id: 'sworn', from: 60 },
      ],
      drift: { every: 8, toward: 0 },
    },
    crown: { name: 'The Crown', start: 5 },
  },
  item: { salt: { name: 'Salt', value: 40 }, wine: { name: 'Wine', value: 120 } },
  resource: { silver: { name: 'Silver', start: 500, step: 5 } },
  shop: {
    post: {
      name: 'Trading post',
      currency: 'silver',
      faction: 'traders',
      buys: {},
      'buys-at': 80,
      stock: {
        items: [
          { item: 'salt', count: 9 },
          { item: 'wine', count: 9 },
        ],
      },
    },
    market: { name: 'Market', currency: 'silver', stock: { items: [{ item: 'salt', count: 9 }] } },
  },
  flag: { 'raiders-at-start': { number: { max: 1000 } } },
  sheet: {
    watch: {
      rows: [
        {
          id: 'dawn',
          when: { event: 'time/day-started' },
          if: RAIDERS_AT_START,
          do: [{ effect: 'add-to-flag', flag: 'raiders-at-start', by: 1 }],
        },
      ],
    },
  },
};

/** An embassy to act in: `do` applies any effects, `wait` passes days, `visit` opens a shop. */
const embassy = defineModule<Record<string, never>>({
  id: 'embassy',
  init: () => ({}),
  actions: {
    do: {
      run: (ctx, action) => {
        for (const effect of action.effects as Effect[]) ctx.apply(effect);
      },
      options: () => [],
    },
    wait: (ctx, action) => ctx.apply({ effect: 'wait', days: (action.days as number | undefined) ?? 1 }),
    visit: (ctx, action) => ctx.apply({ effect: 'open-shop', shop: action.shop }),
  },
  modes: { embassy: { actions: ['embassy/*'] } },
});

/** The embassy's game, with these records or others. */
export function embassyWith(records: object = RECORDS) {
  const modules = [
    ...engineModules,
    timeModule({ calendar: { ticksPerDay: 1 } }),
    inventoryKit,
    economyKit,
    factionsKit,
    embassy,
  ];
  const game = createGame({ modules, start: 'embassy' });
  const sim: SimContext = { content: createRecordStore(records as Record<string, Record<string, unknown>>) };
  const step = (state: GameState, action: Action): GameState => {
    const result = game.reduce(state, action, sim);
    if (!result.accepted) throw new Error(`Refused ${action.type}: ${JSON.stringify(result.beats[0])}`);
    return result.state;
  };
  return {
    game,
    sim,
    start: (seed = 'embassy') => game.init(seed, sim),
    step,
    apply: (state: GameState, ...effects: Effect[]) => step(state, { type: 'embassy/do', effects }),
    attempt: (state: GameState, ...effects: Effect[]) => game.reduce(state, { type: 'embassy/do', effects }, sim),
    wait: (state: GameState, days = 1) => game.reduce(state, { type: 'embassy/wait', days }, sim),
    fact: (state: GameState, id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
  };
}

export const embassyGame = embassyWith();
