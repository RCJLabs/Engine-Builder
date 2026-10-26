/**
 * The post: a test-only game for barter and containers (M6.8, D80). Hild keeps a trading post from
 * her own bag and purse; a chest holds bread and a candle, and a barrel nothing. `open` stands for
 * the world module's use of a container, which applies the same effect.
 */
import {
  type Action,
  type Containers,
  createGame,
  createRecordStore,
  defineModule,
  type Effect,
  type GameState,
  logicModule,
  type SimContext,
  timeModule,
} from '@eb/core';
import { economyKit, factionsKit, inventoryModule } from '../src/index.ts';

export const RECORDS = {
  item: {
    lamp: { name: 'Lamp', value: 20 },
    bread: { name: 'Bread', value: 2, max: 3 },
    candle: { name: 'Candle', value: 4 },
    rope: { name: 'Rope', value: 10 },
  },
  resource: { coin: { name: 'Coin', start: 50 }, shell: { name: 'Shell' } },
  faction: {
    valley: { name: 'The valley', bands: [{ id: 'stranger' }, { id: 'friend', from: 5, price: 80 }] },
  },
  actor: {
    hild: { name: 'Hild', carries: { lamp: 1, bread: 3 }, purse: { coin: 30, shell: 2 }, faction: 'valley' },
    tam: { name: 'Tam', carries: { rope: 1 } },
  },
  shop: {
    post: {
      name: "Hild's post",
      actor: 'hild',
      currency: 'coin',
      buys: {},
      // Bread's max is 3, which Hild carries already: the stock's two don't fit.
      stock: {
        items: [
          { item: 'candle', count: 2 },
          { item: 'bread', count: 2 },
        ],
        every: { days: 3 },
      },
    },
    stall: { name: 'Stall', currency: 'coin', buys: {}, stock: { items: [{ item: 'rope' }] } },
  },
};

export const CONTAINERS: Containers = { 'yard/barrel': {}, 'yard/chest': { bread: 2, candle: 1 } };

export const content = createRecordStore(RECORDS);
export const sim: SimContext = { content };

const yard = defineModule<Record<string, never>>({
  id: 'yard',
  init: () => ({}),
  actions: {
    do: {
      run: (ctx, action) => {
        for (const effect of action.effects as Effect[]) ctx.apply(effect);
      },
      options: () => [],
    },
    open: {
      run: (ctx, action) => ctx.apply({ effect: 'open-container', space: 'yard', object: action.object }),
      options: () => [{ object: 'barrel' }, { object: 'chest' }],
    },
    trade: (ctx) => ctx.apply({ effect: 'open-shop', shop: 'post' }),
    wait: (ctx) => ctx.apply({ effect: 'wait', days: 1 }),
  },
  modes: { yard: { actions: ['yard/*'] } },
});

export const MODULES = [
  logicModule,
  timeModule({ calendar: { ticksPerDay: 1 } }),
  inventoryModule(CONTAINERS),
  economyKit,
  factionsKit,
  yard,
];
export const game = createGame({ modules: MODULES, start: 'yard' });

export const start = (seed = 'post'): GameState => game.init(seed, sim);

/** Takes the action, and throws if it is refused: a step a test expects to go through. */
export function step(state: GameState, action: Action): GameState {
  const result = game.reduce(state, action, sim);
  if (!result.accepted) throw new Error(`Refused ${action.type}: ${JSON.stringify(result.beats[0])}`);
  return result.state;
}

/** The reason a refused action gives. */
export function refusal(state: GameState, action: Action): string | undefined {
  const result = game.reduce(state, action, sim);
  return result.accepted ? undefined : (result.beats[0] as { reason?: string }).reason;
}

export const fact = (state: GameState, id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim);
