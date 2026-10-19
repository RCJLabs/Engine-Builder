/**
 * The crag: a test-only game for the dialogue kit, after Dirtbag's people. Marge, a partner who
 * shows you round the first time and asks what you're doing after; gas money that costs, beta that
 * comes once with a bond, a send rolled 60 to 40, and gear she can show you in a shop. A ranger
 * who checks permits and shows the odds of talking your way past. A summit talk with nothing to
 * say until there is a permit. The economy kit is on unless a test leaves it out, and the engine's
 * own modules come first, as in every game.
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
} from '@eb/core';
import { kitModules } from '../src/index.ts';

const flagOn = (flag: string): Condition => ({ fact: 'flag.on', args: { flag } });
const bondAtLeast = (value: number): Condition => ({ fact: 'flag.number', args: { flag: 'bond' }, op: '>=', value });
const talkedTo = (talk: string): Condition => ({ fact: 'dialogue.talked', args: { talk }, op: '>=', value: 1 });
const addTo = (flag: string, by: number): Effect => ({ effect: 'add-to-flag', flag, by });
const set = (flag: string): Effect => ({ effect: 'set-flag', flag, to: true });
/** What Marge's beta needs: a bond of 2. */
export const BETA_NEEDS = bondAtLeast(2);

export const RECORDS = {
  item: { rope: { name: 'Rope', value: 30 } },
  resource: { cash: { name: 'Cash', start: 20 } },
  shop: { 'gear-shop': { name: 'The gear shop', currency: 'cash', stock: { items: [{ item: 'rope', count: 1 }] } } },
  flag: {
    bond: { number: { start: 0, min: 0, max: 5 } },
    sends: { number: { start: 0, min: 0, max: 9 } },
    'knows-arete': {},
    permit: {},
  },
  speaker: { marge: { name: 'Marge' }, ranger: { name: 'Ranger Ruiz' }, dex: { name: 'Dex' } },
  talk: {
    marge: {
      name: 'Marge at the crag',
      speaker: 'marge',
      starts: [{ if: talkedTo('marge'), line: 'again' }, { line: 'hello' }],
      lines: [
        {
          id: 'hello',
          text: 'First time at the crag?',
          options: [
            { id: 'first', label: 'It is. Show me around?', effects: [addTo('bond', 1)], next: 'tour' },
            { id: 'been', label: 'I’ve been before.', next: 'again' },
          ],
        },
        { id: 'tour', text: 'The slab is the warm-up. The arete is the prize.', next: 'again' },
        {
          id: 'again',
          text: 'What are we doing today?',
          options: [
            { id: 'gas', label: 'Chip in for gas', cost: { cash: 10 }, effects: [addTo('bond', 1)], next: 'thanks' },
            {
              id: 'beta',
              label: 'Any beta for the arete?',
              needs: BETA_NEEDS,
              once: true,
              effects: [set('knows-arete')],
              next: 'beta-given',
            },
            {
              id: 'send',
              label: 'Watch me send it',
              if: flagOn('knows-arete'),
              outcomes: [
                { chance: 60, effects: [addTo('sends', 1)], next: 'sent' },
                { chance: 40, effects: [], next: 'fell' },
              ],
            },
            {
              id: 'gear',
              label: 'Show me your gear',
              effects: [{ effect: 'open-shop', shop: 'gear-shop' }],
              next: 'after-gear',
            },
            { id: 'bye', label: 'See you around.' },
          ],
        },
        { id: 'thanks', text: 'Appreciated. Next round is on me.', next: 'again' },
        { id: 'beta-given', speaker: 'dex', text: 'Heel hook at the second bolt. Trust it.', next: 'again' },
        { id: 'sent', text: 'Clean! Drinks on you.', effects: [addTo('bond', 1)] },
        { id: 'fell', text: 'Whipper! Shake it off.', next: 'again' },
        { id: 'after-gear', text: 'Rope like that will last you.', next: 'again' },
      ],
    },
    ranger: {
      speaker: 'ranger',
      'show-odds': true,
      starts: [{ if: flagOn('permit'), line: 'checked' }, { line: 'stop' }],
      lines: [
        {
          id: 'stop',
          text: 'Climbing permit?',
          options: [
            { id: 'buy', label: 'Buy one', cost: { cash: 20 }, effects: [set('permit')], next: 'checked' },
            {
              id: 'charm',
              label: 'I’m only here for the view',
              outcomes: [
                { chance: 50, effects: [set('permit')], next: 'waved' },
                { chance: 50, effects: [], next: 'turned-back' },
              ],
            },
            { id: 'leave', label: 'Leave' },
          ],
        },
        { id: 'checked', text: 'Have a good climb.' },
        { id: 'waved', text: 'Fine. Stay on the trail.' },
        { id: 'turned-back', text: 'Not without a permit.' },
      ],
    },
    summit: { starts: [{ if: flagOn('permit'), line: 'top' }], lines: [{ id: 'top', text: 'The view from the top.' }] },
  },
};

/**
 * A crag to act in: `do` applies any effects, `visit` opens a talk. With `first`, its start opens
 * that talk, as a game made only of talks does.
 */
const cragModule = (first?: string) =>
  defineModule<Record<string, never>>({
    id: 'crag',
    init: () => ({}),
    ...(first ? { start: (ctx) => ctx.apply({ effect: 'open-talk', talk: first }) } : {}),
    actions: {
      do: {
        run: (ctx, action) => {
          for (const effect of action.effects as Effect[]) ctx.apply(effect);
        },
        options: () => [],
      },
      visit: {
        run: (ctx, action) => ctx.apply({ effect: 'open-talk', talk: action.who }),
        options: () => [],
      },
    },
    modes: { crag: { actions: ['crag/*'] } },
  });

interface Setup {
  readonly economy?: boolean;
  /** The mode a new game starts in: the crag's when left out. */
  readonly start?: string;
  /** The talk the crag's start opens. */
  readonly first?: string;
  /** Modules after the crag's, as a game's own. */
  readonly also?: readonly Module[];
}

/** What open-talk's preview gives: the talk's line, its speaker and text, and its options or how it goes on. */
export interface TalkView {
  readonly effect: string;
  readonly talk: unknown;
  readonly line?: string;
  readonly speaker?: string;
  readonly text?: string;
  readonly options?: readonly Record<string, unknown>[];
  readonly 'go-on'?: 'next' | 'end';
}

/** The crag's game, with these records or others, with the economy kit or without: the kits a project lists. */
export function cragWith(records: object = RECORDS, setup: Setup = {}) {
  const { economy = true, start = 'crag', first, also = [] } = setup;
  const kits = economy ? ['inventory', 'economy', 'dialogue'] : ['inventory', 'dialogue'];
  const modules: Module[] = [...engineModules, ...kitModules(kits), cragModule(first), ...also];
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
    start: (seed = 'crag') => game.init(seed, sim),
    step,
    apply: (state: GameState, ...effects: Effect[]) => step(state, { type: 'crag/do', effects }),
    attempt: (state: GameState, ...effects: Effect[]) => game.reduce(state, { type: 'crag/do', effects }, sim),
    visit: (state: GameState, who: string) => step(state, { type: 'crag/visit', who }),
    say: (state: GameState, option: string) => game.reduce(state, { type: 'dialogue/say', option }, sim),
    goOn: (state: GameState) => game.reduce(state, { type: 'dialogue/go-on' }, sim),
    fact: (state: GameState, id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
    /** What a talk shows, as the stage reads it: open-talk's preview. */
    view: (state: GameState, talk: string) =>
      game.preview(state, [{ effect: 'open-talk', talk }], sim)[0] as unknown as TalkView,
  };
}

export const cragGame = cragWith();

/** Records with one talk changed. */
export const withTalk = (id: string, value: object) => ({ ...RECORDS, talk: { ...RECORDS.talk, [id]: value } });
