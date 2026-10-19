/**
 * The barracks: a test-only game for the stats and gear kits. Two soldiers with Space-Wrecked's
 * marine numbers (health 10, aim 70), statuses that stack and run out over days, and gear for two
 * slots, with the kits' modules beside the engine's and a day a tick, unless a test asks for more.
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
  type Module,
  type SimContext,
  timeModule,
} from '@eb/core';
import { gearKit, inventoryKit, statsModule } from '../src/index.ts';

export const RECORDS = {
  stat: {
    health: { name: 'Health', min: 0, max: 100, start: 10 },
    aim: { name: 'Aim', min: 0, max: 100, start: 50 },
    speed: { name: 'Speed', min: 1, start: 4 },
    grit: { name: 'Grit', min: -10 },
  },
  actor: {
    ana: { name: 'Ana', stats: { health: 10, aim: 70 }, statuses: ['steady'], slots: ['hand', 'body'] },
    bo: { name: 'Bo', stats: { health: 12 }, wears: { hand: 'pistol' } },
  },
  status: {
    steady: { name: 'Steady', modifiers: [{ stat: 'aim', add: 5 }] },
    bleeding: {
      name: 'Bleeding',
      modifiers: [
        { stat: 'aim', add: -10 },
        { stat: 'speed', percent: -25 },
      ],
      lasts: { days: 3 },
      stacks: 3,
      tags: ['injury'],
    },
    dazed: { name: 'Dazed', modifiers: [{ stat: 'aim', percent: -50 }], lasts: { ticks: 1 }, tags: ['injury'] },
    hale: { name: 'Hale', modifiers: [{ stat: 'health', add: 5 }], tags: ['boon'] },
  },
  slot: { hand: { name: 'Hand' }, body: { name: 'Body' }, head: { name: 'Head' } },
  item: {
    rifle: { name: 'Rifle', value: 120, slot: 'hand', modifiers: [{ stat: 'aim', add: 10 }] },
    pistol: { name: 'Pistol', value: 60, slot: 'hand', max: 1, modifiers: [{ stat: 'aim', add: 4 }] },
    vest: {
      name: 'Vest',
      value: 80,
      slot: 'body',
      modifiers: [
        { stat: 'speed', percent: 50 },
        { stat: 'health', add: 5 },
      ],
    },
    helmet: {
      name: 'Helmet',
      value: 40,
      slot: 'head',
      modifiers: [
        { stat: 'health', add: 2 },
        { stat: 'health', percent: 10 },
      ],
    },
    medkit: { name: 'Medkit', value: 30 },
  },
};

/** A barracks to act in: `do` applies any effects, `wait` passes days. */
const barracks = defineModule<Record<string, never>>({
  id: 'barracks',
  init: () => ({}),
  actions: {
    do: {
      run: (ctx, action) => {
        for (const effect of action.effects as Effect[]) ctx.apply(effect);
      },
      options: () => [],
    },
    wait: (ctx, action) => ctx.apply({ effect: 'wait', days: (action.days as number | undefined) ?? 1 }),
  },
  modes: { barracks: { actions: ['barracks/*'] } },
});

/** The game with both kits, or with the stats kit alone; `after`, modules a test listens with. */
export function gameWith(gear: boolean, records: object = RECORDS, ticksPerDay = 1, after: readonly Module[] = []) {
  const engine = [logicModule, timeModule({ calendar: { ticksPerDay } }), flagModule];
  const modules: Module[] = [
    ...engine,
    inventoryKit,
    statsModule(gear),
    ...(gear ? [gearKit] : []),
    barracks,
    ...after,
  ];
  const game = createGame({ modules, start: 'barracks' });
  const sim: SimContext = { content: createRecordStore(records as Record<string, Record<string, unknown>>) };
  const step = (state: GameState, action: Action): GameState => {
    const result = game.reduce(state, action, sim);
    if (!result.accepted) throw new Error(`Refused ${action.type}: ${JSON.stringify(result.beats[0])}`);
    return result.state;
  };
  return {
    game,
    sim,
    start: (seed = 'barracks') => game.init(seed, sim),
    step,
    apply: (state: GameState, ...effects: Effect[]) => step(state, { type: 'barracks/do', effects }),
    attempt: (state: GameState, ...effects: Effect[]) => game.reduce(state, { type: 'barracks/do', effects }, sim),
    fact: (state: GameState, id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
  };
}

export const kitted = gameWith(true);
