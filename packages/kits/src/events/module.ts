/**
 * The events kit's module (M3.7, D45, docs/specs/events.md): choice events opened, drawn from
 * decks and chosen in the mode `choosing`, and consequences that land days, choices or a number
 * flag's rise later. Built knowing whether the economy kit is on, since only then is a cost
 * charged (W119): a module can't ask whether another's effect exists.
 */
import {
  type Beat,
  defineModule,
  type FactTest,
  type Module,
  type ModuleContext,
  type ModuleDef,
  OP_WORDS,
} from '@eb/core';
import { own } from '../own.ts';
import { type Choosing, chooseOptions, eventView } from './choices.ts';
import { choose } from './choose.ts';
import { drawEvent } from './decks.ts';
import { book, cancelLater, dueOf, landDue, leftOf } from './laters.ts';
import { openEvent } from './open.ts';
import { namedChoice } from './records.ts';
import { CHOOSING, DECK, EVENT, EVENTS, type EventsSlice } from './types.ts';

type Def = ModuleDef<EventsSlice>;

/** The salt is drawn below 2^31, so every port holds it in a plain integer. */
const SALT_MAX = 2147483646;

const EVENT_ARG = { event: { type: 'ref', to: EVENT } } as const;
const DECK_ARG = { deck: { type: 'ref', to: DECK } } as const;
const LATER_ARG = { later: { type: 'text' } } as const;
const COUNT = { type: 'int', min: 0 } as const;
const TEXT = { type: 'text' } as const;

const arg = (test: FactTest, key: string) => String(test.args?.[key]);
// "the times raiders has been seen is at least 2": tests in words by the ids they name.
const compared = (subject: (test: FactTest) => string) => (test: FactTest) =>
  test.op === undefined ? undefined : `${subject(test)} ${OP_WORDS[test.op]} ${String(test.value)}`;
const holds = (words: (test: FactTest) => string) => (test: FactTest) =>
  test.op === undefined ? words(test) : undefined;

const facts: Def['facts'] = {
  open: { domain: { type: 'ref', to: EVENT }, label: 'the open event', read: ({ state }) => state.open },
  seen: {
    args: EVENT_ARG,
    domain: COUNT,
    label: 'times seen',
    describe: compared((test) => `the times ${arg(test, 'event')} has been seen`),
    read: ({ state }, { event }) => own(state.seen, event as string) ?? 0,
  },
  chose: {
    args: { ...EVENT_ARG, choice: TEXT },
    domain: { type: 'bool' },
    label: 'chosen',
    describe: holds((test) => `${arg(test, 'choice')} was chosen at ${arg(test, 'event')}`),
    read: ({ content, state }, { event, choice }) => {
      namedChoice(content, event, choice);
      return own(state.chose, event as string)?.includes(choice as string) ?? false;
    },
  },
  choices: { domain: COUNT, label: 'the choices made', read: ({ state }) => state.choices },
  booked: { domain: COUNT, label: 'the consequences still to land', read: ({ state }) => state.laters.length },
  pending: {
    args: LATER_ARG,
    domain: { type: 'bool' },
    label: 'still to land',
    describe: holds((test) => `${arg(test, 'later')} is still to land`),
    read: ({ state }, { later }) => state.laters.some((each) => each.id === later),
  },
  left: {
    args: LATER_ARG,
    domain: COUNT,
    label: 'the countdown',
    describe: compared((test) => `${arg(test, 'later')}’s countdown`),
    read: (view, { later }) => leftOf({ slice: view.state, fact: view.fact }, later),
  },
};

const events: Def['events'] = {
  opened: { args: EVENT_ARG, label: 'An event opens' },
  chosen: { args: { ...EVENT_ARG, choice: TEXT }, label: 'A choice is made' },
  rolled: {
    args: { ...EVENT_ARG, choice: TEXT, outcome: COUNT, roll: { type: 'int', min: 1, max: 100 } },
    label: 'A choice’s outcome is rolled',
  },
  drawn: { args: { ...DECK_ARG, ...EVENT_ARG }, label: 'An event is drawn' },
  'nothing-drawn': { args: DECK_ARG, label: 'A deck has nothing to draw' },
  booked: { args: LATER_ARG, label: 'A consequence is booked' },
  landed: { args: { ...LATER_ARG, event: TEXT, choice: TEXT }, label: 'A consequence lands' },
  dropped: { args: LATER_ARG, label: 'A consequence is dropped' },
  cancelled: { args: LATER_ARG, label: 'A consequence is cancelled' },
};

/** A day's start lands the consequences counting days; a flag's change, those waiting on it. */
function hear(ctx: ModuleContext<EventsSlice>, event: Beat): void {
  if (event.type === 'time/day-started') {
    const day = event.day as number;
    landDue(ctx, (due) => 'day' in due && due.day <= day);
  } else if (event.type === 'flag/changed') {
    const { flag } = event;
    if (!ctx.read().laters.some((each) => 'flag' in each.due && each.due.flag === flag)) return;
    const value = ctx.fact('flag.number', { flag }) as number;
    landDue(ctx, (due) => 'flag' in due && due.flag === flag && value >= due.at);
  }
}

export function eventsModule(economy: boolean): Module {
  const choosingOf = (view: Omit<Choosing, 'costs'>): Choosing => ({
    content: view.content,
    fact: view.fact,
    check: view.check,
    costs: economy,
  });

  return defineModule<EventsSlice>({
    id: EVENTS,
    init: (ctx) => ({
      salt: ctx.rng('salt').int(0, SALT_MAX),
      waiting: [],
      seen: {},
      chose: {},
      choices: 0,
      decks: {},
      laters: [],
      next: 0,
    }),
    facts,
    effects: {
      'open-event': {
        run: (ctx, effect) => openEvent(ctx, effect.event),
        preview: (ctx, effect) => eventView(choosingOf(ctx), effect.event, ctx.preview),
      },
      'draw-event': (ctx, effect) => drawEvent(ctx, effect.deck),
      later: {
        run: (ctx, effect) => book(ctx, effect),
        preview: (ctx, effect) => ({ due: dueOf({ slice: ctx.read(), fact: ctx.fact }, effect.after) }),
      },
      'cancel-later': (ctx, effect) => cancelLater(ctx, effect.id),
    },
    events,
    actions: {
      choose: {
        run: (ctx, action) => choose(ctx, choosingOf(ctx), action.choice),
        options: (view) => {
          const open = view.mode.id === CHOOSING ? view.state.open : undefined;
          return open === undefined ? [] : chooseOptions(choosingOf(view), open);
        },
      },
    },
    modes: { [CHOOSING]: { actions: [`${EVENTS}/*`] } },
    on: { '*': hear },
  });
}
