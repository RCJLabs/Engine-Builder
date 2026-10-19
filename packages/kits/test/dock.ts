/**
 * The dock: a test-only game for the quests kit, after Space-Wrecked's hangar. A broker's debt that
 * starts with the game, due in three days, paid or refused; a drone bounty posted on a flag,
 * counted by what is scrapped and failed by the alarm; a quest that waits on the bounty; a courier
 * run started by an effect; a night watch whose last night is also its deadline; a fork whose
 * Leads to comes before its Then; and a loop that never settles. The engine's own modules and a
 * day-a-tick calendar come first, as in every game.
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
import { kitModules, type QuestShown } from '../src/index.ts';

export const flagOn = (flag: string): Condition => ({ fact: 'flag.on', args: { flag } });
const repAtLeast = (value: number): Condition => ({ fact: 'flag.number', args: { flag: 'rep' }, op: '>=', value });
const stateIs = (quest: string, value: string): Condition => ({
  fact: 'quests.state',
  args: { quest },
  op: '==',
  value,
});
export const set = (flag: string): Effect => ({ effect: 'set-flag', flag, to: true });
const addTo = (flag: string, by: number): Effect => ({ effect: 'add-to-flag', flag, by });

export const RECORDS = {
  flag: {
    paid: {},
    refused: {},
    alarm: {},
    'met-chief': {},
    posted: {},
    ready: {},
    loop: {},
    rep: { number: { start: 0, min: 0, max: 9 } },
  },
  quest: {
    debt: {
      name: 'The broker’s debt',
      'at-start': true,
      stages: [
        {
          id: 'owed',
          log: 'The broker wants 30 credits within three days.',
          objectives: [
            { id: 'pay', text: 'Pay the broker', 'done-when': flagOn('paid'), next: 'square' },
            { id: 'refuse', text: 'Or tell her no', 'done-when': flagOn('refused'), next: 'hunted' },
          ],
          days: 3,
          why: 'The broker came to collect.',
        },
        { id: 'square', log: 'The broker shook your hand.', effects: [addTo('rep', 1)] },
        { id: 'hunted', log: 'You refused, and her crew found you.', fails: true },
      ],
    },
    bounty: {
      name: 'Drone bounty',
      'starts-when': flagOn('posted'),
      stages: [
        {
          id: 'hunt',
          log: 'The chief posted a bounty on rogue drones.',
          objectives: [
            {
              id: 'scrap',
              text: 'Scrap three drones',
              count: { event: 'dock/scrapped', args: { kind: 'drone' }, to: 3 },
            },
            { id: 'report', text: 'Tell the chief', 'done-when': flagOn('met-chief') },
          ],
          next: 'paid-out',
          'fail-when': flagOn('alarm'),
          why: 'The alarm brought the guards.',
        },
        { id: 'paid-out', log: 'The chief paid the bounty.', effects: [addTo('rep', 1)] },
      ],
    },
    trusted: {
      name: 'Trusted on the dock',
      'starts-when': stateIs('bounty', 'done'),
      stages: [
        {
          id: 'earn',
          log: 'Earn the dock’s trust.',
          objectives: [{ id: 'rep', text: 'Reach 2 reputation', 'done-when': repAtLeast(2) }],
        },
      ],
    },
    courier: {
      name: 'The courier run',
      stages: [
        {
          id: 'pickup',
          log: 'Pick up the parcel.',
          objectives: [
            { id: 'grab', text: 'Grab the crate', count: { event: 'dock/scrapped', args: { kind: 'crate' }, to: 1 } },
          ],
          next: 'deliver',
        },
        {
          id: 'deliver',
          log: 'Deliver it to the chief.',
          objectives: [{ id: 'hand-over', text: 'Hand it over', 'done-when': flagOn('met-chief') }],
        },
      ],
    },
    watch: {
      name: 'Night watch',
      stages: [
        {
          id: 'watching',
          log: 'Keep watch for two nights.',
          objectives: [{ id: 'nights', text: 'See two days start', count: { event: 'time/day-started', to: 2 } }],
          days: 2,
        },
      ],
    },
    fork: {
      name: 'The fork',
      stages: [
        {
          id: 'choose',
          objectives: [
            { id: 'gear-up', text: 'Gear up', 'done-when': flagOn('ready') },
            { id: 'bail', text: 'Or bail', 'done-when': flagOn('ready'), next: 'out' },
          ],
          next: 'in',
        },
        { id: 'in', log: 'You went in.' },
        { id: 'out', log: 'You bailed.' },
      ],
    },
    loop: {
      name: 'The loop',
      stages: [
        { id: 'round', objectives: [{ id: 'go', text: 'Go round', 'done-when': flagOn('loop'), next: 'again' }] },
        { id: 'again', objectives: [{ id: 'back', text: 'Come back', 'done-when': flagOn('loop'), next: 'round' }] },
      ],
    },
  },
};

/** A dock to act in: `do` applies any effects, `scrap` scraps a drone or a crate, `rest` waits a day. */
const dockModule = defineModule<Record<string, never>>({
  id: 'dock',
  init: () => ({}),
  actions: {
    do: {
      run: (ctx, action) => {
        for (const effect of action.effects as Effect[]) ctx.apply(effect);
      },
      options: () => [],
    },
    scrap: { run: (ctx, action) => ctx.emit('scrapped', { kind: action.kind }), options: () => [] },
    rest: { run: (ctx) => ctx.apply({ effect: 'wait', days: 1 }), options: () => [] },
  },
  events: { scrapped: { args: { kind: { type: 'text' } }, label: 'Something is scrapped' } },
  modes: { dock: { actions: ['dock/*'] } },
});

/** The dock's game with these records or others; `also` are modules after the dock's, as a game's own. */
export function dockWith(records: object = RECORDS, also: readonly Module[] = []) {
  const modules: Module[] = [
    ...engineModules,
    timeModule({ calendar: { ticksPerDay: 1 } }),
    ...kitModules(['quests']),
    dockModule,
    ...also,
  ];
  const game = createGame({ modules, start: 'dock' });
  const sim: SimContext = { content: createRecordStore(records as Record<string, Record<string, unknown>>) };
  const step = (state: GameState, action: Action): GameState => {
    const result = game.reduce(state, action, sim);
    if (!result.accepted) throw new Error(`Refused ${action.type}: ${JSON.stringify(result.beats[0])}`);
    return result.state;
  };
  return {
    game,
    sim,
    start: (seed = 'dock') => game.init(seed, sim),
    step,
    apply: (state: GameState, ...effects: Effect[]) => step(state, { type: 'dock/do', effects }),
    run: (state: GameState, ...effects: Effect[]) => game.reduce(state, { type: 'dock/do', effects }, sim),
    scrap: (state: GameState, kind: string) => game.reduce(state, { type: 'dock/scrap', kind }, sim),
    rest: (state: GameState) => game.reduce(state, { type: 'dock/rest' }, sim),
    fact: (state: GameState, id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
    /** A quest's journal entry, as the stage reads it: start-quest's preview. */
    journal: (state: GameState, quest: string) =>
      game.preview(state, [{ effect: 'start-quest', quest }], sim)[0] as unknown as QuestShown & { effect: string },
  };
}

export const dockGame = dockWith();

/** Records with one quest changed or added. */
export const withQuest = (id: string, value: object) => ({ ...RECORDS, quest: { ...RECORDS.quest, [id]: value } });
