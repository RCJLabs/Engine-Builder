/**
 * A game played through its screens (M4.1, docs/specs/screens.md#session): a kernel session, and
 * after each step the view the page draws from. It runs where the game's scripts run, in a worker,
 * and gives back only JSON. A button can only ask for an action the game offers: one it doesn't is
 * refused here before the sim sees it, as the sim would refuse it.
 */
import {
  type Action,
  type Beat,
  type Condition,
  canonicalJson,
  checkCondition,
  createSession,
  type FactCatalog,
  type Game,
  type GameState,
  parseCondition,
  type RecordStore,
  type Session,
  type SimContext,
} from '@eb/core';
import type { Source } from '../format/screen.ts';
import type { Entry, Shown, View, Wants } from './types.ts';
import { bagEntries, eventShows, frameOf, journalEntries, type Reading, shelfShows, talkShows } from './views.ts';
import { actionLabel } from './words.ts';

export interface Play {
  readonly view: View;
  readonly state: GameState;
  /** Takes an action on offer: the step's beats, and the view after it. */
  act(action: Action): { readonly view: View; readonly beats: readonly Beat[]; readonly accepted: boolean };
}

export interface PlaySetup {
  readonly game: Game;
  readonly sim: SimContext;
  /** The kits the project has on: which lists apply. */
  readonly kits: readonly string[];
  readonly wants: Wants;
}

interface Read {
  readonly fact: string;
  readonly args?: Readonly<Record<string, unknown>>;
}

/**
 * The screens' facts and conditions, parsed and checked against the game once. One that doesn't
 * read, or names what the game lacks, reads as no value rather than throwing in the kernel: the
 * compiler has said why (E048).
 */
function parsedWants(wants: Wants, catalog: FactCatalog) {
  const sound = (text: string, bare: boolean): Condition | undefined => {
    const parsed = parseCondition(text, catalog);
    if (!parsed.ok || (bare && !('fact' in parsed.condition && parsed.condition.op === undefined))) return undefined;
    // A bare fact is shown, not tested, so it needn't be yes or no (E014).
    const issues = checkCondition(parsed.condition, { catalog }).filter((i) => !(bare && i.code === 'E014'));
    return issues.length === 0 ? parsed.condition : undefined;
  };
  const facts = new Map(wants.facts.map((text) => [text, sound(text, true) as Read | undefined]));
  const conditions = new Map(wants.conditions.map((text) => [text, sound(text, false)]));
  return { facts, conditions };
}

const asShown = (value: unknown): Shown =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;

export function startPlay(setup: PlaySetup, seed: string): Play {
  const { game, sim, kits } = setup;
  const catalog = game.catalog();
  const wants = parsedWants(setup.wants, catalog);
  const session: Session = createSession(game, sim, game.init(seed, sim));

  function viewOf(state: GameState): View {
    const offered = game.options(state, sim);
    const content: RecordStore = game.content(state, sim);
    const reading: Reading = {
      state,
      content,
      catalog,
      offered: new Set(offered.map((action) => canonicalJson(action))),
      fact: (id, args) => game.fact(state, id, args as never, sim),
      preview: (effect) => game.preview(state, [effect as never], sim)[0] ?? { effect: String(effect.effect) },
    };
    const facts: Record<string, Shown> = {};
    for (const [text, read] of wants.facts) facts[text] = read ? asShown(reading.fact(read.fact, read.args)) : null;
    const conditions: Record<string, boolean | null> = {};
    for (const [text, condition] of wants.conditions) {
      conditions[text] = condition ? game.check(state, condition, sim) : null;
    }
    const { fields, lists } = kitViews(reading, kits);
    lists.offered = offered.map((action, i) => ({
      key: `${i}:${canonicalJson(action)}`,
      fields: { type: action.type, label: actionLabel(action, content) },
      action,
      enabled: true,
    }));
    return {
      modes: state.kernel.modes.map((frame) => frame.id),
      offered,
      facts,
      conditions,
      fields,
      lists,
      turn: state.kernel.step,
      ended: offered.length === 0,
    };
  }

  let view = viewOf(session.state);
  return {
    get view() {
      return view;
    },
    get state() {
      return session.state;
    },
    act(action) {
      if (!view.offered.some((offer) => canonicalJson(offer) === canonicalJson(action))) {
        return { view, beats: [], accepted: false };
      }
      const step = session.dispatch(action);
      view = viewOf(session.state);
      return { view, beats: session.drain(), accepted: step.accepted };
    },
  };
}

/** The talk, the event, the shop and the bag while each applies, and the journal, by the kits that are on. */
function kitViews(reading: Reading, kits: readonly string[]) {
  const fields: Record<string, Shown> = {};
  const lists: Partial<Record<Source, readonly Entry[]>> = {};
  const data = (mode: string, key: string) => {
    const value = (frameOf(reading.state, mode)?.data as Record<string, unknown> | undefined)?.[key];
    return typeof value === 'string' ? value : undefined;
  };
  const talk = kits.includes('dialogue') ? data('talking', 'talk') : undefined;
  if (talk !== undefined) {
    const shows = talkShows(reading, talk);
    Object.assign(fields, shows.fields);
    lists.talk = shows.entries;
  }
  const event = kits.includes('events') ? data('choosing', 'event') : undefined;
  if (event !== undefined) {
    const shows = eventShows(reading, event);
    Object.assign(fields, shows.fields);
    lists.event = shows.entries;
  }
  const shop = kits.includes('economy') ? data('shopping', 'shop') : undefined;
  if (shop !== undefined) {
    const shows = shelfShows(reading, shop);
    Object.assign(fields, shows.fields);
    lists.shelf = shows.entries;
  }
  if (kits.includes('inventory')) lists.bag = bagEntries(reading, shop);
  if (kits.includes('quests')) lists.journal = journalEntries(reading);
  return { fields, lists };
}
