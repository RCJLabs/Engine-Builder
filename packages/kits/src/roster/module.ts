/**
 * The roster kit's module (M3.6, D44, docs/specs/roster.md): the party's members, recruits made
 * in play from templates and offered by halls, ranks on a ladder with the statuses they give,
 * bonds between pairs, and those who left with why. Built knowing whether the economy kit is on,
 * since only then is a fee charged (W117): a module can't ask whether another's effect exists.
 */
import {
  defineModule,
  type FactTest,
  type Module,
  type ModuleContext,
  type ModuleDef,
  OP_WORDS,
  type OptionsView,
} from '@eb/core';
import { own } from '../own.ts';
import { ACTOR } from '../stats/types.ts';
import { actorRecord } from '../stats/values.ts';
import { bondBandOf, bondOf, bondPreview, changeBond, changeBonds } from './bonds.ts';
import { type Hiring, hallIn, hire, hireOptions, leaveHall, openHall, refreshHall } from './hall.ts';
import {
  join,
  leave,
  makeRecruit,
  rankedCount,
  rankOf,
  reachedRank,
  roomOf,
  rosterRecord,
  settleRank,
} from './members.ts';
import { MADE, nextRecruit, recruitId } from './offers.ts';
import { HALL, HIRING, ROSTER, type RosterSlice } from './types.ts';

type Def = ModuleDef<RosterSlice>;

/** The salt is drawn below 2^31, so every port holds it in a plain integer. */
const SALT_MAX = 2147483646;

const ACTOR_ARG = { actor: { type: 'ref', to: ACTOR } } as const;
const PAIR = { ...ACTOR_ARG, with: { type: 'ref', to: ACTOR } } as const;
const HALL_ARG = { hall: { type: 'ref', to: HALL } } as const;
const COUNT = { type: 'int', min: 0 } as const;
const TEXT = { type: 'text' } as const;

const arg = (test: FactTest, key: string) => String(test.args?.[key]);
// "ana’s rank is veteran": tests in words by the ids they name, as a faction's standing's are.
const compared = (subject: (test: FactTest) => string) => (test: FactTest) =>
  test.op === undefined ? undefined : `${subject(test)} ${OP_WORDS[test.op]} ${String(test.value)}`;
const holds = (words: (test: FactTest) => string) => (test: FactTest) =>
  test.op === undefined ? words(test) : undefined;
const bondWords = (test: FactTest) => `the bond of ${arg(test, 'actor')} and ${arg(test, 'with')}`;

const facts: Def['facts'] = {
  count: { domain: COUNT, label: 'the roster’s size', read: ({ state }) => state.members.length },
  room: { domain: COUNT, label: 'room on the roster', read: (view) => roomOf(view, view.state) },
  member: {
    args: ACTOR_ARG,
    domain: { type: 'bool' },
    label: 'on the roster',
    describe: holds((test) => `${arg(test, 'actor')} is on the roster`),
    read: ({ state }, { actor }) => state.members.includes(actor as string),
  },
  left: {
    args: ACTOR_ARG,
    domain: TEXT,
    label: 'why it left',
    describe: compared((test) => `why ${arg(test, 'actor')} left`),
    read: ({ state }, { actor }) => own(state.gone, actor as string),
  },
  rank: {
    args: ACTOR_ARG,
    domain: TEXT,
    label: 'the rank',
    describe: compared((test) => `${arg(test, 'actor')}’s rank`),
    read: (view, { actor }) => rankOf(view, actor as string)?.id,
  },
  reached: {
    args: { ...ACTOR_ARG, rank: TEXT },
    domain: { type: 'bool' },
    label: 'at least the rank',
    describe: holds((test) => `${arg(test, 'actor')} is at least ${arg(test, 'rank')}`),
    read: (view, { actor, rank }) => reachedRank(view, actor as string, rank),
  },
  ranked: {
    args: { rank: TEXT },
    domain: COUNT,
    label: 'members at least the rank',
    describe: compared((test) => `the number of members at least ${arg(test, 'rank')}`),
    read: (view, { rank }) => rankedCount(view, view.state, rank),
  },
  bond: {
    args: PAIR,
    domain: { type: 'int' },
    label: 'the bond',
    describe: compared(bondWords),
    read: ({ content, state }, { actor, with: other }) => bondOf(content, state, actor, other),
  },
  'bond-band': {
    args: PAIR,
    domain: TEXT,
    label: 'the bond’s band',
    describe: compared(bondWords),
    read: ({ content, state }, { actor, with: other }) => bondBandOf(content, state, actor, other),
  },
};

const effects: Def['effects'] = {
  recruit: {
    run: (ctx, effect) => {
      makeRecruit(ctx, nextRecruit(ctx.content, ctx.read(), effect.recruit));
    },
    preview: (ctx, effect) => {
      const slice = ctx.read();
      const rolled = nextRecruit(ctx.content, slice, effect.recruit);
      const full = (roomOf(ctx, slice) ?? 1) < 1;
      return {
        actor: recruitId(rolled.recruit, slice.next),
        name: rolled.name,
        stats: rolled.stats ?? {},
        traits: rolled.traits ?? [],
        ...(full ? { refused: 'roster-full' } : {}),
      };
    },
  },
  join: (ctx, effect) => {
    actorRecord(ctx.content, effect.actor);
    join(ctx, effect.actor as string);
  },
  leave: (ctx, effect) => {
    actorRecord(ctx.content, effect.actor);
    if (typeof effect.why !== 'string' || effect.why === '') throw new Error('leave: "why" is text, such as "dead"');
    leave(ctx, effect.actor as string, effect.why);
  },
  'change-bond': {
    run: (ctx, effect) => changeBond(ctx, effect.actor, effect.with, effect.by),
    preview: (ctx, effect) => bondPreview(ctx.content, ctx.read(), effect),
  },
  'change-bonds': (ctx, effect) => changeBonds(ctx, effect.by),
  'open-hall': (ctx, effect) => openHall(ctx, effect.hall),
  'refresh-hall': (ctx, effect) => refreshHall(ctx, effect.hall),
};

const events: Def['events'] = {
  joined: { args: ACTOR_ARG, label: 'A member joins' },
  left: { args: { ...ACTOR_ARG, why: TEXT }, label: 'A member leaves' },
  hired: { args: { ...HALL_ARG, slot: COUNT, ...ACTOR_ARG }, label: 'A recruit is hired' },
  'rank-changed': { args: { ...ACTOR_ARG, from: TEXT, to: TEXT }, label: 'A member’s rank changes' },
  'bond-changed': { args: { ...PAIR, by: { type: 'int' }, to: { type: 'int' } }, label: 'A bond changes' },
  'bond-band-changed': { args: { ...PAIR, from: TEXT, to: TEXT }, label: 'A bond’s band changes' },
  'hall-opened': { args: HALL_ARG, label: 'A hall opens' },
  'hall-left': { args: HALL_ARG, label: 'A hall is left' },
};

/** A rank is worked out again after anything changes a member's stats or what it wears. */
const movesRanks = (type: string) => type.startsWith('stats/') || type.startsWith('gear/');

export function rosterModule(economy: boolean): Module {
  const hiringIn = (ctx: ModuleContext<RosterSlice>): Hiring => ({
    content: ctx.content,
    slice: ctx.read(),
    fact: ctx.fact,
    fees: economy,
  });
  const hiringOf = (view: OptionsView<RosterSlice>): Hiring => ({
    content: view.content,
    slice: view.state,
    fact: view.fact,
    fees: economy,
  });

  return defineModule<RosterSlice>({
    id: ROSTER,
    init: (ctx) => ({
      salt: ctx.rng('salt').int(0, SALT_MAX),
      next: 0,
      members: [...(rosterRecord(ctx.content)?.start ?? [])],
      made: {},
      gone: {},
      halls: {},
      bonds: {},
      ranks: {},
    }),
    // Those on the roster from the start get their ranks' statuses once every kit's slice exists.
    start: (ctx) => {
      for (const actor of ctx.read().members) settleRank(ctx, actor);
    },
    made: MADE,
    facts,
    effects,
    actions: {
      hire: {
        run: (ctx, action) => hire(ctx, hiringIn(ctx), action.slot),
        options: (view) => {
          const hall = hallIn(view.mode);
          return hall === undefined ? [] : hireOptions(hiringOf(view), hall);
        },
      },
      'leave-hall': {
        run: (ctx) => leaveHall(ctx),
        options: (view) => (hallIn(view.mode) === undefined ? [] : [{}]),
      },
    },
    modes: { [HIRING]: { actions: ['roster/hire', 'roster/leave-hall'] } },
    // The stats and gear kits' events, which a listener for each by name would need both kits on for.
    on: {
      '*': (ctx, event) => {
        if (!movesRanks(event.type) || typeof event.actor !== 'string') return;
        if (ctx.read().members.includes(event.actor)) settleRank(ctx, event.actor);
      },
    },
    events,
  });
}
