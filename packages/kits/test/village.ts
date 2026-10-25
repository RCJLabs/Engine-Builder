/**
 * The village: a test-only game for the ai kit (M6.3). A smith who works at the forge by day,
 * sleeps in the cottage at night and wanders the green between; a guard who walks the walls by
 * night and stands at the gate by day, faces a player they are suspicious of and halts one they
 * are alerted to; a dog that only follows. A tick is a minute, so 08:00 is tick 480.
 */
import {
  type Action,
  type CalendarDef,
  type Condition,
  createGame,
  createRecordStore,
  defineModule,
  engineModules,
  type GameState,
  type Module,
  type SimContext,
  type WorldSlice,
  worldModule,
} from '@eb/core';
import type { AiSlice } from '../src/ai/types.ts';
import { kitModules } from '../src/index.ts';

export const CALENDAR: CalendarDef = {
  ticksPerDay: 1440,
  units: { minutes: 1, hours: 60 },
  weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
};

const level = (value: string): Condition => ({ fact: 'ai.level', args: { actor: '@self' }, op: '==', value });

export const BEHAVIOURS = {
  'smiths-day': {
    name: 'The smith’s day',
    do: {
      first: [
        { hours: [8, 18], do: { work: 'forge' } },
        { hours: [22, 6], do: { sleep: 'bed' } },
        { do: { sandbox: ['bench', 'well', 'stall'], dwell: { minutes: 20 } } },
      ],
    },
  },
  'guards-watch': {
    name: 'The guard’s watch',
    do: {
      first: [
        {
          if: level('alerted'),
          cooldown: { minutes: 30 },
          do: { 'in-order': [{ face: 'player' }, { effects: [{ effect: 'set-flag', flag: 'halted', to: true }] }] },
        },
        { if: level('suspicious'), do: { face: 'player' } },
        { hours: [20, 6], do: { patrol: ['wall-n', 'wall-e', 'wall-s'], dwell: { minutes: 5 } } },
        { do: { travel: 'gate' } },
      ],
    },
  },
  heel: { do: { follow: 'player', distance: 3 } },
  rounds: {
    do: {
      'in-order': [{ travel: 'well' }, { wait: { minutes: 10 } }, { travel: 'bench' }],
    },
  },
};

export const RECORDS = {
  actor: {
    smith: { name: 'Ada', behaviour: 'smiths-day' },
    guard: { name: 'Bram', behaviour: 'guards-watch', sight: 20 },
    dog: { name: 'Patch', behaviour: 'heel' },
    crier: { name: 'Cal', behaviour: 'rounds' },
    stranger: { name: 'A stranger', behaviour: 'heel' },
  },
  behaviour: BEHAVIOURS,
  flag: { halted: {} },
};

export const WORLD = {
  triggers: {},
  uses: {},
  spawns: { green: [], inn: [] },
  start: 'green',
  actors: {
    smith: { space: 'green', path: 'smith' },
    guard: { space: 'green', path: 'guard' },
    dog: { space: 'green', path: 'dog' },
    crier: { space: 'inn', path: 'crier' },
  },
};

const village = defineModule<object>({
  id: 'village',
  init: () => ({}),
  modes: { out: { actions: ['world/*', 'time/*', 'ai/*'] } },
});

export function villageWith(records: object = RECORDS, start?: { tick?: number }) {
  const calendar = { ...CALENDAR, ...(start?.tick !== undefined ? { start: { tick: start.tick } } : {}) };
  const modules: Module[] = [
    ...engineModules,
    ...kitModules(['stats', 'time', 'ai'], calendar, { rate: 60 }),
    worldModule(WORLD),
    village,
  ];
  const game = createGame({ modules, start: 'out' });
  const sim: SimContext = { content: createRecordStore(records as Record<string, Record<string, unknown>>) };
  const take = (state: GameState, action: Action) => {
    const step = game.reduce(state, action, sim);
    if (!step.accepted) throw new Error(`Refused ${action.type}: ${JSON.stringify(step.beats[0])}`);
    return step;
  };
  return {
    game,
    sim,
    start: (seed = 'village') => game.init(seed, sim),
    take,
    /** Game minutes passing, as the time kit's advance. */
    pass: (state: GameState, minutes: number) => take(state, { type: 'time/advance', minutes }).state,
    /** Where the stage says NPCs of the green stand, and which arrived. */
    stand: (state: GameState, npcs: Record<string, { feet?: number[]; arrived?: string }>) =>
      take(state, {
        type: 'world/npcs-at',
        space: 'green',
        npcs: Object.fromEntries(
          Object.entries(npcs).map(([actor, n]) => [actor, { feet: n.feet ?? [0, 0, 0], yaw: 0, ...n }]),
        ),
      }).state,
    sensed: (state: GameState, npcs: Record<string, { seen?: number[]; heard?: number }>, ms = 1000) =>
      game.reduce(state, { type: 'ai/sensed', space: 'green', ms, npcs }, sim),
    fact: (state: GameState, id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
    ai: (state: GameState) => state.ai as AiSlice,
    npcs: (state: GameState) => (state.world as WorldSlice).npcs,
  };
}
