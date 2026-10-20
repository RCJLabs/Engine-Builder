/**
 * The sector: a test-only game for the maps kit, after Space-Wrecked's sector run. Seven layers
 * from a way in to a jump point, two stations and a nebula placed apart, the rest rolled from a
 * mix; a jump that costs a supply and two heat, a long jump that costs three and cools the ship.
 * The jump point enters the next sector. Beside it the valley, a map drawn by hand after
 * Dirtbag's, whose drives take hours and cash along the quickest road.
 */
import {
  type Action,
  type CalendarDef,
  createGame,
  createRecordStore,
  defineModule,
  type Effect,
  engineModules,
  type GameState,
  type Module,
  type SimContext,
} from '@eb/core';
import { kitModules, type MapsSlice } from '../src/index.ts';

const heat = (by: number): Effect => ({ effect: 'add-to-flag', flag: 'heat', by });

export const SECTOR_RULES = {
  count: 7,
  widths: { min: 2, max: 3 },
  start: 'way-in',
  end: 'jump-point',
  links: 'both',
  extra: 35,
  place: [
    { kind: 'station', min: 2, max: 2, apart: true },
    { kind: 'nebula', min: 1, max: 1, apart: true },
  ],
  mix: [
    { kind: 'empty', weight: 2 },
    { kind: 'derelict', weight: 2 },
    { kind: 'hostile', weight: 2 },
  ],
} as const;

export const RECORDS = {
  item: { crate: { name: 'Crate', value: 5 } },
  resource: { supplies: { name: 'Supplies', start: 12 }, credits: { name: 'Credits', start: 10 } },
  flag: { heat: { number: { start: 0, min: 0, max: 100 } }, home: {} },
  'node-kind': {
    'way-in': { name: 'Way in' },
    'jump-point': {
      name: 'Jump point',
      arrive: [{ effect: 'enter-map', map: 'sector' }],
    },
    station: {
      name: 'Station',
      charted: true,
      names: ['Mac’s Pumps', 'Halfway House', 'Rest Stop Nine'],
      arrive: [{ effect: 'add-resource', resource: 'supplies', by: 2 }],
    },
    nebula: { name: 'Nebula', charted: true, arrive: [heat(-5)] },
    empty: { name: 'Empty space' },
    derelict: {
      name: 'Derelict',
      names: ['Drift Four', 'The Hulk'],
      arrive: [{ effect: 'add-resource', resource: 'credits', by: 3 }],
    },
    hostile: { name: 'Hostile ship', arrive: [heat(5)] },
    home: { name: 'Home', arrive: [{ effect: 'set-flag', flag: 'home', to: true }] },
    town: { name: 'Town' },
    crag: { name: 'Crag' },
  },
  map: {
    sector: {
      name: 'The Shoals',
      layers: SECTOR_RULES,
      moves: [
        { id: 'jump', label: 'Jump', reach: 1, cost: { supplies: 1 }, effects: [heat(2)] },
        { id: 'long', label: 'Long jump', reach: 2, cost: { supplies: 3 }, effects: [heat(-10)] },
      ],
    },
    valley: {
      name: 'The valley',
      start: 'van',
      nodes: [
        { id: 'van', name: 'The van', kind: 'home', x: 10, y: 80 },
        { id: 'town', kind: 'town', x: 40, y: 70 },
        { id: 'slab', name: 'The slab', kind: 'crag', x: 70, y: 30 },
        { id: 'tower', name: 'The tower', kind: 'crag', x: 90, y: 10 },
      ],
      roads: [
        { from: 'van', to: 'town', takes: { hours: 1 }, cost: { credits: 2 } },
        { from: 'town', to: 'slab', takes: { hours: 2 }, cost: { credits: 1 } },
        { from: 'van', to: 'slab', takes: { hours: 4 } },
        { from: 'slab', to: 'tower', takes: { hours: 1 } },
        { from: 'town', to: 'tower', takes: { hours: 3 }, cost: { credits: 1 }, 'one-way': true },
      ],
      moves: [{ id: 'drive', label: 'Drive' }],
      reveal: 0,
    },
  },
};

export const HOURS: CalendarDef = { ticksPerDay: 24, units: { hours: 1 } };

/** A trip to act in: `do` applies any effects. */
const tripModule = (first: string) =>
  defineModule<Record<string, never>>({
    id: 'trip',
    init: () => ({}),
    start: (ctx) => ctx.apply({ effect: 'enter-map', map: first }),
    actions: {
      do: {
        run: (ctx, action) => {
          for (const effect of action.effects as Effect[]) ctx.apply(effect);
        },
        options: () => [],
      },
    },
    modes: { trip: { actions: ['trip/*', 'maps/*'] } },
  });

interface Setup {
  /** The map the trip starts on: the sector when left out. */
  readonly first?: string;
  readonly economy?: boolean;
  readonly time?: boolean;
  readonly records?: object;
  readonly also?: readonly Module[];
}

/** The sector's game: the kits a project lists, then the trip. */
export function sectorWith(setup: Setup = {}) {
  const { first = 'sector', economy = true, time = true, records = RECORDS, also = [] } = setup;
  const kits = ['inventory', ...(economy ? ['economy'] : []), ...(time ? ['time'] : []), 'maps'];
  const modules: Module[] = [...engineModules, ...kitModules(kits, HOURS), tripModule(first), ...also];
  const game = createGame({ modules, start: 'trip' });
  const sim: SimContext = { content: createRecordStore(records as Record<string, Record<string, unknown>>) };
  const step = (state: GameState, action: Action): GameState => {
    const result = game.reduce(state, action, sim);
    if (!result.accepted) throw new Error(`Refused ${action.type}: ${JSON.stringify(result.beats[0])}`);
    return result.state;
  };
  return {
    game,
    sim,
    start: (seed = 'sector') => game.init(seed, sim),
    step,
    travel: (state: GameState, to: string, move = 'jump') => step(state, { type: 'maps/travel', to, move }),
    attempt: (state: GameState, to: string, move = 'jump') =>
      game.reduce(state, { type: 'maps/travel', to, move }, sim),
    apply: (state: GameState, ...effects: Effect[]) => step(state, { type: 'trip/do', effects }),
    options: (state: GameState) => game.options(state, sim),
    fact: (state: GameState, id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
    slice: (state: GameState) => state.maps as MapsSlice,
  };
}

export const sectorGame = sectorWith();
