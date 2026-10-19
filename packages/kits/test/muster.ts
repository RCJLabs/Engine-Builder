/**
 * The muster: a test-only game for the roster kit. Space-Wrecked's crew: a dock offering two
 * recruits a round, deckhands three times as often as medics, a fee of 30 credits and more for a
 * steady or sharp hand, ranks at 3 and 8 fights, and Wasteland's bonds in bands at 4 and 10. Ana
 * and Bo start on the roster, Bo a veteran already. The economy kit is on unless a test leaves it
 * out, and the engine's own modules come first, as in every game.
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
  timeModule,
} from '@eb/core';
import { kitModules } from '../src/index.ts';

export const RECORDS = {
  stat: {
    fights: { name: 'Fights', min: 0 },
    aim: { name: 'Aim', min: 0, max: 10, start: 1 },
    health: { name: 'Health', min: 0, start: 10 },
  },
  status: {
    steady: { name: 'Steady', modifiers: [{ stat: 'aim', add: 1 }] },
    sharp: { name: 'Sharp', modifiers: [{ stat: 'aim', add: 2 }] },
    seasoned: { name: 'Seasoned', modifiers: [{ stat: 'health', add: 2 }] },
    hardened: { name: 'Hardened', modifiers: [{ stat: 'health', add: 5 }] },
  },
  actor: {
    ana: { name: 'Ana', stats: { aim: 3 } },
    bo: { name: 'Bo', stats: { fights: 4 } },
    cy: { name: 'Cy' },
    hand: { name: 'Deckhand', description: 'Knows ropes.', stats: { aim: 2, health: 8 }, statuses: ['steady'] },
    doc: { name: 'Medic', stats: { health: 9 } },
  },
  recruit: {
    deckhand: {
      name: 'Deckhand',
      actor: 'hand',
      names: ['Ketil', 'Asa', 'Bryn', 'Dag'],
      bynames: ['Ash', 'Reed'],
      stats: { fights: { min: 0, max: 2 }, aim: { min: 1, max: 4 } },
      traits: [
        { status: 'steady', chance: 50, fee: { credits: 20 } },
        { status: 'sharp', chance: 30, fee: { credits: 10 } },
      ],
      most: 1,
      fee: { credits: 30 },
    },
    medic: { name: 'Medic', actor: 'doc', names: ['Ida', 'Une'], fee: { credits: 50 } },
  },
  hall: {
    dock: {
      name: 'The dock',
      offers: 2,
      recruits: [{ recruit: 'deckhand', weight: 3 }, { recruit: 'medic' }],
    },
    camp: { name: 'The camp', recruits: [{ recruit: 'medic' }] },
  },
  roster: {
    crew: {
      name: 'The crew',
      cap: 4,
      start: ['ana', 'bo'],
      ranks: {
        stat: 'fights',
        bands: [
          { id: 'green', name: 'Green' },
          { id: 'veteran', from: 3, status: 'seasoned' },
          { id: 'elite', from: 8, status: 'hardened' },
        ],
      },
      bonds: {
        min: 0,
        max: 20,
        bands: [{ id: 'strangers' }, { id: 'mates', from: 4 }, { id: 'brothers', from: 10 }],
      },
    },
  },
  resource: { credits: { name: 'Credits', start: 100 } },
  flag: { berths: { number: { start: 3, min: 0, max: 6 } } },
};

/** A muster to act in: `do` applies any effects, `visit` opens a hall. */
const muster = defineModule<Record<string, never>>({
  id: 'muster',
  init: () => ({}),
  actions: {
    do: {
      run: (ctx, action) => {
        for (const effect of action.effects as Effect[]) ctx.apply(effect);
      },
      options: () => [],
    },
    visit: { run: (ctx, action) => ctx.apply({ effect: 'open-hall', hall: action.hall }), options: () => [] },
  },
  modes: { muster: { actions: ['muster/*'] } },
});

/** The muster's game, with these records or others, with the economy kit or without: the kits a project lists. */
export function musterWith(records: object = RECORDS, economy = true) {
  const kits = economy ? ['inventory', 'economy', 'stats', 'roster'] : ['inventory', 'stats', 'roster'];
  const modules: Module[] = [
    ...engineModules,
    timeModule({ calendar: { ticksPerDay: 1 } }),
    ...kitModules(kits),
    muster,
  ];
  const game = createGame({ modules, start: 'muster' });
  const sim: SimContext = { content: createRecordStore(records as Record<string, Record<string, unknown>>) };
  const step = (state: GameState, action: Action): GameState => {
    const result = game.reduce(state, action, sim);
    if (!result.accepted) throw new Error(`Refused ${action.type}: ${JSON.stringify(result.beats[0])}`);
    return result.state;
  };
  return {
    game,
    sim,
    start: (seed = 'muster') => game.init(seed, sim),
    step,
    apply: (state: GameState, ...effects: Effect[]) => step(state, { type: 'muster/do', effects }),
    attempt: (state: GameState, ...effects: Effect[]) => game.reduce(state, { type: 'muster/do', effects }, sim),
    visit: (state: GameState, hall: string) => step(state, { type: 'muster/visit', hall }),
    hire: (state: GameState, slot: number) => game.reduce(state, { type: 'roster/hire', slot }, sim),
    fact: (state: GameState, id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
    content: (state: GameState) => game.content(state, sim),
  };
}

export const mustered = musterWith();

/** Records with the roster's settings changed. */
export const withRoster = (roster: object) => ({ ...RECORDS, roster: { crew: { ...RECORDS.roster.crew, ...roster } } });
