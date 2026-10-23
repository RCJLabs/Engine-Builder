/**
 * The brawl: a test-only game for the encounters kit. A crew of three (Ana at the front, then Bo,
 * then Cy) and a ship of their own, against raiders and a brute; a combat that reads hit points,
 * aim, guard, blows and plate. The roster kit is on unless a test leaves it out, and the engine's
 * own modules come first, as in every game.
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
} from '@eb/core';
import { kitModules } from '../src/index.ts';

export const RECORDS = {
  stat: {
    hp: { name: 'Hit points', min: 0, start: 4 },
    aim: { name: 'Aim', min: 0, max: 100, start: 50 },
    guard: { name: 'Guard', min: 0 },
    blow: { name: 'Blow', min: 0, start: 1 },
    plate: { name: 'Plate', min: 0 },
  },
  status: {
    downed: { name: 'Downed', tags: ['hurt'] },
    keen: { name: 'Keen', modifiers: [{ stat: 'aim', add: 20 }] },
  },
  actor: {
    ana: { name: 'Ana', stats: { hp: 5, aim: 60, blow: 2 } },
    bo: { name: 'Bo', stats: { hp: 3, aim: 50 } },
    cy: { name: 'Cy', stats: { hp: 2, aim: 70, guard: 10 } },
    ship: { name: 'The ship', stats: { hp: 6, aim: 60, blow: 2, plate: 1 } },
    raider: { name: 'Raider', stats: { hp: 3, aim: 50, blow: 2 } },
    brute: { name: 'Brute', stats: { hp: 6, aim: 30, blow: 3, plate: 1 } },
  },
  combat: {
    melee: { name: 'Melee', health: 'hp', hit: 'aim', dodge: 'guard', damage: 'blow', armour: 'plate', rounds: 8 },
  },
  encounter: {
    raiders: {
      name: 'Raiders',
      combat: 'melee',
      foes: [{ actor: 'raider', count: 3 }],
      win: [{ effect: 'add-to-flag', flag: 'loot', by: 3 }],
      lose: [{ effect: 'add-to-flag', flag: 'loot', by: -1 }],
      falls: { status: 'downed', leave: 'fell to raiders' },
    },
    brute: { name: 'The brute', combat: 'melee', foes: [{ actor: 'brute' }], breaks: 50 },
    boarding: { name: 'A boarding', combat: 'melee', fighters: ['ship'], foes: [{ actor: 'raider', count: 3 }] },
  },
  roster: { crew: { name: 'The crew', start: ['ana', 'bo', 'cy'] } },
  flag: { loot: { number: { start: 0, min: -10, max: 100 } } },
};

/** A brawl to act in: `do` applies any effects. */
const brawl = defineModule<Record<string, never>>({
  id: 'brawl',
  init: () => ({}),
  actions: {
    do: {
      run: (ctx, action) => {
        for (const effect of action.effects as Effect[]) ctx.apply(effect);
      },
      options: () => [],
    },
  },
  modes: { brawl: { actions: ['brawl/*'] } },
});

/** The brawl's game, with these records or others, with the roster kit or without. */
export function brawlWith(records: object = RECORDS, roster = true) {
  const kits = roster ? ['stats', 'roster', 'encounters'] : ['stats', 'encounters'];
  const modules: Module[] = [...engineModules, ...kitModules(kits), brawl];
  const game = createGame({ modules, start: 'brawl' });
  const sim: SimContext = { content: createRecordStore(records as Record<string, Record<string, unknown>>) };
  const step = (state: GameState, action: Action): GameState => {
    const result = game.reduce(state, action, sim);
    if (!result.accepted) throw new Error(`Refused ${action.type}: ${JSON.stringify(result.beats[0])}`);
    return result.state;
  };
  return {
    game,
    sim,
    start: (seed = 'brawl') => game.init(seed, sim),
    apply: (state: GameState, ...effects: Effect[]) => step(state, { type: 'brawl/do', effects }),
    reduce: (state: GameState, ...effects: Effect[]) => game.reduce(state, { type: 'brawl/do', effects }, sim),
    fact: (state: GameState, id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
    preview: (state: GameState, effect: Effect) => game.preview(state, [effect], sim)[0] as Record<string, unknown>,
  };
}

export const brawled = brawlWith();
