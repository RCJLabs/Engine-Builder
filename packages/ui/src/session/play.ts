/**
 * A game played through its screens (M4.1, docs/specs/screens.md#session): a kernel session, and
 * after each step the view the page draws from. It runs where the game's scripts run, in a worker,
 * and gives back only JSON. A button can only ask for an action the game offers: one it doesn't is
 * refused here before the sim sees it, as the sim would refuse it. The one action no button asks
 * for are the stage's (world/trigger since M5.8, world/npcs-at since M6.2, time/elapse since M6.3, the
 * fighting kit's hits, shots and searches since M6.4), never on offer, which the sim's own checks decide.
 */
import {
  type Action,
  type Beat,
  type Condition,
  canonicalJson,
  createSession,
  type FactCatalog,
  type Game,
  type GameState,
  type PackCredit,
  type PackFighting,
  type RecordStore,
  type Session,
  type SimContext,
  WORLD,
  type WorldSlice,
} from '@eb/core';
import { FALLEN } from '@eb/kits';
import type { Cue } from '../format/audio.ts';
import type { Feedback, Said } from '../format/feedback.ts';
import { heldShows, openedOf } from './containers.ts';
import { type FightView, fightOf } from './fighting.ts';
import { mapShows } from './mapView.ts';
import { markersOf, type QuestMarker } from './markers.ts';
import { codexEntries, creditEntries, parseCodex } from './records.ts';
import { feedbackSayer } from './say.ts';
import { soundCondition } from './sound.ts';
import type { Entry, Shown, View, Wants, WorldView } from './types.ts';
import { bagEntries, eventShows, frameOf, journalEntries, type Reading, shelfShows, talkShows } from './views.ts';
import { actionLabel } from './words.ts';

/**
 * What the stage sends as the character walks into a zone (M5.8), uses what it faces and stands
 * (M5.9), as its NPCs walk and arrive (M6.2), and as the clock runs and its NPCs sense the player (M6.3).
 */
const ELAPSE = 'time/elapse';
const WALKED = new Set([
  `${WORLD}/trigger`,
  `${WORLD}/use`,
  `${WORLD}/at`,
  `${WORLD}/npcs-at`,
  ELAPSE,
  'ai/sensed',
  'fighting/hit',
  'fighting/loosed',
  'fighting/search',
  // An essential NPC down gets up as the stage says, ten seconds on (M6.10).
  'fighting/rise',
]);
/** The journal's Track (M6.6): it takes no time and no mode offers it, as looking at the journal doesn't. */
const TRACK = 'quests/track';

export interface Play {
  readonly view: View;
  readonly state: GameState;
  /** What a save of the play holds (M4.3): where its log starts, the log, and the state now. */
  readonly run: { readonly snapshot: GameState; readonly log: readonly Action[]; readonly state: GameState };
  /** Makes the state now the start of the log, so saves stop growing. */
  compact(): void;
  /** The view of the state now for other wants, taking no step: a screen being designed (M4.5, D55). */
  look(wants: Wants): View;
  /** Takes an action on offer: the step's beats, what the game's feedback says of them (M4.2), and the view after it. */
  act(action: Action): Taken;
  /**
   * Takes an action whether or not it is on offer, as the sim would: the editor's debug steps,
   * which nothing offers, and a recording stepped forward (M4.9).
   */
  take(action: Action): Taken;
}

export interface Taken {
  readonly view: View;
  readonly beats: readonly Beat[];
  readonly said: readonly Said[];
  /** The sounds and buzzes the feedback gives the beats (M4.8). */
  readonly cues: readonly Cue[];
  readonly accepted: boolean;
}

export interface PlaySetup {
  readonly game: Game;
  readonly sim: SimContext;
  /** The kits the project has on: which lists apply. */
  readonly kits: readonly string[];
  readonly wants: Wants;
  /** ui/feedback.json: the words the step's beats are said in. Without it, nothing is said. */
  readonly feedback?: Feedback;
  /** The assets' credits the pack carries (M4.4), for a credits list. */
  readonly credits?: readonly PackCredit[];
  /** project.json's fighting (M6.4), in a game with spaces: the stage's view of the fights reads it. */
  readonly fighting?: PackFighting;
  /** Each container's name by `space/object` (M6.8), for the Container screen's heading. */
  readonly containers?: Readonly<Record<string, string>>;
}

interface Read {
  readonly fact: string;
  readonly args?: Readonly<Record<string, unknown>>;
}

/** The screens' facts and conditions, and each codex list's, parsed and checked against the game once. */
function parsedWants(wants: Wants, catalog: FactCatalog) {
  const facts = new Map(wants.facts.map((text) => [text, soundCondition(text, catalog, true) as Read | undefined]));
  const conditions = new Map(wants.conditions.map((text) => [text, soundCondition(text, catalog, false)]));
  const codexes = (wants.records ?? []).map((want) => parseCodex(want, catalog));
  return { facts, conditions, codexes };
}

const asShown = (value: unknown): Shown =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;

/** A new game, from its seed. */
export const startPlay = (setup: PlaySetup, seed: string): Play => playFrom(setup, setup.game.init(seed, setup.sim));

/** A game from a state, as a save loads it (M4.3). Its log starts there. */
export const resumePlay = (setup: PlaySetup, state: GameState): Play => playFrom(setup, state);

function playFrom(setup: PlaySetup, start: GameState): Play {
  const { game, sim, kits } = setup;
  const catalog = game.catalog();
  const parsed = parsedWants(setup.wants, catalog);
  const session: Session = createSession(game, sim, start);
  const say = setup.feedback ? feedbackSayer(setup.feedback, game.events()) : undefined;
  const credits = setup.credits && setup.credits.length > 0 ? creditEntries(setup.credits) : undefined;

  function viewOf(state: GameState, wants = parsed): View {
    const offered = game.options(state, sim);
    const content: RecordStore = game.content(state, sim);
    const reading: Reading = {
      state,
      content,
      catalog,
      offered: new Set(offered.map((action) => canonicalJson(action))),
      fact: (id, args) => game.fact(state, id, args as never, sim),
      preview: (effect) => game.preview(state, [effect as never], sim)[0] ?? { effect: String(effect.effect) },
      check: (condition: Condition) => game.check(state, condition, sim),
    };
    const facts: Record<string, Shown> = {};
    for (const [text, read] of wants.facts) facts[text] = read ? asShown(reading.fact(read.fact, read.args)) : null;
    const conditions: Record<string, boolean | null> = {};
    for (const [text, condition] of wants.conditions) {
      conditions[text] = condition ? game.check(state, condition, sim) : null;
    }
    const { fields, lists, map } = kitViews(reading, kits, setup.containers ?? {});
    for (const codex of wants.codexes) lists[codex.key] = codexEntries(reading, codex);
    if (credits) lists.credits = credits;
    lists.offered = offered.map((action, i) => ({
      key: `${i}:${canonicalJson(action)}`,
      fields: { type: action.type, label: actionLabel(action, content) },
      action,
      enabled: true,
    }));
    const fight = fightOf(state, content, reading.fact, setup.fighting);
    const world = worldOf(state, game.allowedActions(state).includes(ELAPSE), fight, markersOf(reading, kits));
    return {
      modes: state.kernel.modes.map((frame) => frame.id),
      offered,
      facts,
      conditions,
      fields,
      lists,
      ...(map ? { map } : {}),
      ...(world ? { world } : {}),
      turn: state.kernel.step,
      // A fallen player's game has nothing on offer but isn't over: the shell offers its checkpoint (M6.4).
      ended: offered.length === 0 && !state.kernel.modes.some((frame) => frame.id === FALLEN),
    };
  }

  let view = viewOf(session.state);
  const take = (action: Action): Taken => {
    const step = session.dispatch(action);
    view = viewOf(session.state);
    const beats = session.drain();
    // The step's records name what its beats carry, those it made among them.
    const felt = say ? say(beats, game.content(session.state, sim)) : { said: [], cues: [] };
    return { view, beats, said: felt.said, cues: felt.cues, accepted: step.accepted };
  };
  return {
    get view() {
      return view;
    },
    get state() {
      return session.state;
    },
    get run() {
      return { snapshot: session.start, log: session.log, state: session.state };
    },
    compact: () => session.compact(),
    look: (wants) => viewOf(session.state, parsedWants(wants, catalog)),
    act(action) {
      const walked = WALKED.has(action.type) || action.type === TRACK;
      if (!walked && !view.offered.some((offer) => canonicalJson(offer) === canonicalJson(action))) {
        return { view, beats: [], said: [], cues: [], accepted: false };
      }
      return take(action);
    },
    take,
  };
}

/**
 * The world module's slice, as the stage reads it: only what it says, in a game with spaces. `clocked`
 * when the walk should send time/elapse now: the game follows real time and its mode allows it (M6.3).
 */
function worldOf(
  state: GameState,
  clocked: boolean,
  fight: FightView | undefined,
  markers: readonly QuestMarker[],
): WorldView | undefined {
  const slice = state[WORLD] as WorldSlice | undefined;
  if (!slice) return undefined;
  const { space, at, arrive, taken, npcs } = slice;
  const walking = npcs && Object.keys(npcs).length > 0 ? { npcs } : {};
  return {
    space,
    ...(at ? { at } : {}),
    ...(arrive !== undefined ? { arrive } : {}),
    taken,
    ...walking,
    ...(clocked ? { clock: true as const } : {}),
    ...(fight ? { fight } : {}),
    ...(markers.length > 0 ? { markers } : {}),
  };
}

/**
 * The talk, the event, the shop, the open container (M6.8) and the bag while each applies, the
 * journal and the map, by the kits that are on.
 */
function kitViews(reading: Reading, kits: readonly string[], containers: Readonly<Record<string, string>>) {
  const fields: Record<string, Shown> = {};
  const lists: Record<string, readonly Entry[]> = {};
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
  const opened = kits.includes('inventory') ? openedOf(frameOf(reading.state, 'container')?.data) : undefined;
  if (opened !== undefined) {
    const shows = heldShows(reading, opened, containers);
    Object.assign(fields, shows.fields);
    lists.held = shows.entries;
  }
  // The bag puts into a container while one is the mode on top, and sells while a shop is.
  const putting = opened !== undefined && reading.state.kernel.modes.at(-1)?.id === 'container';
  if (kits.includes('inventory')) lists.bag = bagEntries(reading, shop, putting);
  if (kits.includes('quests')) lists.journal = journalEntries(reading);
  const map = kits.includes('maps') ? mapShows(reading) : undefined;
  if (map) fields['map.name'] = map.name;
  return { fields, lists, map };
}
