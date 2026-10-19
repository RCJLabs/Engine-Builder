/**
 * The caravan: a test-only game for the events kit. Wasteland's road: raiders who take a toll,
 * can be fled with fuel, fought at 60 to 40 or hidden from, and are parleyed with once the caravan
 * has helped someone; a trader who shows the odds; a loan shark whose debt comes due three nodes on; a medic
 * whose patch takes a medkit the caravan may not have. A road deck draws among them. The economy
 * kit is on unless a test leaves it out, and the engine's own modules come first, as in every
 * game.
 */
import {
  type Action,
  type Condition,
  createGame,
  createRecordStore,
  defineModule,
  type Effect,
  engineModules,
  type GameState,
  type Module,
  type SimContext,
  timeModule,
} from '@eb/core';
import { kitModules } from '../src/index.ts';

const fuelAtLeast = (value: number): Condition => ({
  fact: 'economy.amount',
  args: { resource: 'fuel' },
  op: '>=',
  value,
});
const helped: Condition = { fact: 'flag.on', args: { flag: 'helped' } };
const add = (resource: string, by: number): Effect => ({ effect: 'add-resource', resource, by });

export const RECORDS = {
  item: { medkit: { name: 'Medkit', value: 10 } },
  resource: { scrap: { name: 'Scrap', start: 40 }, fuel: { name: 'Fuel', start: 3 } },
  flag: { nodes: { number: { start: 0, min: 0, max: 8 } }, helped: {} },
  event: {
    raiders: {
      name: 'Raiders',
      text: 'Bikes on the ridge.',
      choices: [
        { id: 'pay', label: 'Pay the toll', cost: { scrap: 30 }, result: 'They take it and go.' },
        { id: 'flee', label: 'Flee', needs: fuelAtLeast(2), effects: [add('fuel', -2)] },
        {
          id: 'fight',
          label: 'Fight',
          // Its worse outcome takes fuel, so it needs some: without, an unlucky roll would refuse it.
          needs: fuelAtLeast(1),
          outcomes: [
            { chance: 60, result: 'They scatter.', effects: [add('scrap', 15)] },
            { chance: 40, result: 'They hole the tank.', effects: [add('fuel', -1)] },
          ],
        },
        { id: 'parley', label: 'Parley', if: helped, result: 'They know your name.' },
        { id: 'hide', label: 'Hide', result: 'You wait them out.', effects: [{ effect: 'wait', days: 1 }] },
      ],
    },
    trader: {
      name: 'Trader',
      'show-odds': true,
      choices: [
        { id: 'buy', label: 'Buy fuel', cost: { scrap: 10 }, effects: [add('fuel', 2)] },
        {
          id: 'haggle',
          label: 'Haggle',
          outcomes: [
            { chance: 50, result: 'A deal.', effects: [add('fuel', 1)] },
            { chance: 50, result: 'No deal.', effects: [] },
          ],
        },
        { id: 'leave', label: 'Leave' },
      ],
    },
    'loan-shark': {
      name: 'Loan shark',
      choices: [
        {
          id: 'borrow',
          label: 'Borrow 40',
          effects: [
            add('scrap', 40),
            {
              effect: 'later',
              id: 'debt',
              after: { flag: 'nodes', by: 3 },
              do: [{ effect: 'open-event', event: 'debt-due' }],
            },
          ],
        },
        { id: 'decline', label: 'Decline' },
      ],
    },
    'debt-due': {
      name: 'The debt',
      choices: [
        { id: 'pay', label: 'Pay 50', cost: { scrap: 50 } },
        { id: 'run', label: 'Run' },
      ],
    },
    medic: {
      name: 'A medic',
      choices: [
        { id: 'patch', label: 'Patch them up', effects: [{ effect: 'take-item', item: 'medkit' }] },
        { id: 'walk-on', label: 'Walk on' },
      ],
    },
    quiet: { name: 'Quiet road', choices: [{ id: 'go-on', label: 'Go on' }] },
  },
  deck: {
    road: {
      name: 'The road',
      recent: 1,
      unseen: 3,
      events: [
        { event: 'raiders', weight: 2 },
        { event: 'trader' },
        { event: 'loan-shark', once: true },
        { event: 'quiet' },
      ],
    },
    favours: { events: [{ event: 'quiet', if: helped }] },
  },
};

/**
 * A caravan to act in: `do` applies any effects, `travel` moves a node on, a day out, and draws
 * from the road. With `first`, its start opens that event, as a game made only of events does.
 */
const caravanModule = (first?: string) =>
  defineModule<Record<string, never>>({
    id: 'caravan',
    init: () => ({}),
    ...(first ? { start: (ctx) => ctx.apply({ effect: 'open-event', event: first }) } : {}),
    actions: {
      do: {
        run: (ctx, action) => {
          for (const effect of action.effects as Effect[]) ctx.apply(effect);
        },
        options: () => [],
      },
      travel: (ctx) => {
        ctx.apply({ effect: 'add-to-flag', flag: 'nodes', by: 1 });
        ctx.apply({ effect: 'wait', days: 1 });
        ctx.apply({ effect: 'draw-event', deck: 'road' });
      },
    },
    modes: { caravan: { actions: ['caravan/*'] } },
  });

interface Setup {
  readonly economy?: boolean;
  /** The mode a new game starts in: the caravan's when left out. */
  readonly start?: string;
  /** The event the caravan's start opens. */
  readonly first?: string;
}

/** The caravan's game, with these records or others, with the economy kit or without: the kits a project lists. */
export function caravanWith(records: object = RECORDS, setup: Setup = {}) {
  const { economy = true, start = 'caravan', first } = setup;
  const kits = economy ? ['inventory', 'economy', 'events'] : ['inventory', 'events'];
  const modules: Module[] = [
    ...engineModules,
    timeModule({ calendar: { ticksPerDay: 1 } }),
    ...kitModules(kits),
    caravanModule(first),
  ];
  const game = createGame({ modules, start });
  const sim: SimContext = { content: createRecordStore(records as Record<string, Record<string, unknown>>) };
  const step = (state: GameState, action: Action): GameState => {
    const result = game.reduce(state, action, sim);
    if (!result.accepted) throw new Error(`Refused ${action.type}: ${JSON.stringify(result.beats[0])}`);
    return result.state;
  };
  return {
    game,
    sim,
    start: (seed = 'caravan') => game.init(seed, sim),
    step,
    apply: (state: GameState, ...effects: Effect[]) => step(state, { type: 'caravan/do', effects }),
    attempt: (state: GameState, ...effects: Effect[]) => game.reduce(state, { type: 'caravan/do', effects }, sim),
    open: (state: GameState, event: string) =>
      step(state, { type: 'caravan/do', effects: [{ effect: 'open-event', event }] }),
    choose: (state: GameState, choice: string) => game.reduce(state, { type: 'events/choose', choice }, sim),
    fact: (state: GameState, id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
    /** What the open event shows, as the stage reads it: open-event's preview. */
    view: (state: GameState) =>
      game.preview(
        state,
        [{ effect: 'open-event', event: game.fact(state, 'events.open', {}, sim) }],
        sim,
      )[0] as unknown as EventView,
  };
}

/** What open-event's preview gives: the event, and its choices as the player sees them. */
export interface EventView {
  readonly effect: string;
  readonly event: unknown;
  readonly choices: readonly Record<string, unknown>[];
}

export const caravanGame = caravanWith();

/** Records with one event's or deck's fields changed. */
export const withRecord = (type: 'event' | 'deck', id: string, value: object) => ({
  ...RECORDS,
  [type]: { ...RECORDS[type], [id]: value },
});
