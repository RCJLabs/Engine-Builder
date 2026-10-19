/**
 * The stats kit's module (M3.4, D41, D42, docs/specs/stats.md): actors' values worked out from
 * their bases and statuses, damage kept apart, and statuses that stack and run out as time
 * passes. Built knowing whether the gear kit is on, whose sums each value then reads: a module
 * can't ask whether another's fact exists.
 */
import {
  type DeepReadonly,
  defineModule,
  type Effect,
  type FactArgs,
  type Module,
  type PreviewContext,
  type RecordStore,
} from '@eb/core';
import { addToStat, countOf, damageStat, healStat } from './pools.ts';
import { addStatus, expireDue, removeStatus } from './statuses.ts';
import { ACTOR, STAT, STATS, STATUS, type StatsSlice } from './types.ts';
import {
  actorRecord,
  baseOf,
  currentOf,
  type Part,
  settle,
  stacksOf,
  statParts,
  statRecord,
  statusesOf,
  statusRecord,
} from './values.ts';

type Fact = (id: string, args?: FactArgs) => unknown;
/** What a fact, an effect and a preview all have: content and the other facts. */
interface Reader {
  readonly content: RecordStore;
  fact: Fact;
}

/** The gear kit's sums for the actor's stat, as one part. */
const gearPart = (fact: Fact, actor: string, stat: string): Part => ({
  kind: 'gear',
  id: actor,
  add: fact('gear.add', { actor, stat }) as number,
  percent: fact('gear.percent', { actor, stat }) as number,
});

const ACTOR_ARG = { actor: { type: 'ref', to: ACTOR } } as const;
const STAT_ARG = { stat: { type: 'ref', to: STAT } } as const;
const STATUS_ARG = { status: { type: 'ref', to: STATUS } } as const;
const COUNT = { type: 'int', min: 1 } as const;
const STACKS = { type: 'int', min: 0 } as const;

const optionalCount = (effect: Effect, field: string): number | undefined =>
  effect[field] === undefined ? undefined : countOf(effect[field], effect.effect, field);

export function statsModule(gear: boolean): Module {
  const parts = (view: Reader, slice: DeepReadonly<StatsSlice>, actor: string, stat: string) => {
    actorRecord(view.content, actor);
    return statParts(view.content, slice, actor, stat, gear ? [gearPart(view.fact, actor, stat)] : []);
  };
  const valueIn = (ctx: Reader & { read(): DeepReadonly<StatsSlice> }, actor: string, stat: string) =>
    parts(ctx, ctx.read(), actor, stat).value;

  return defineModule<StatsSlice>({
    id: STATS,
    init: () => ({ actors: {} }),
    facts: {
      value: {
        args: { ...ACTOR_ARG, ...STAT_ARG },
        domain: { type: 'int' },
        label: 'the value',
        read: (view, { actor, stat }) => parts(view, view.state, actor as string, stat as string).value,
      },
      current: {
        args: { ...ACTOR_ARG, ...STAT_ARG },
        domain: { type: 'int' },
        label: 'what is left',
        read: (view, { actor, stat }) => {
          const { value } = parts(view, view.state, actor as string, stat as string);
          return currentOf(view.content, view.state, actor as string, stat as string, value);
        },
      },
      has: {
        args: { ...ACTOR_ARG, ...STATUS_ARG },
        domain: STACKS,
        label: 'stacks',
        read: ({ content, state }, { actor, status }) => {
          statusRecord(content, status);
          return stacksOf(content, state, actor as string, status as string);
        },
      },
      tagged: {
        args: { ...ACTOR_ARG, tag: { type: 'text' } },
        domain: STACKS,
        label: 'stacks with the tag',
        read: ({ content, state }, { actor, tag }) =>
          statusesOf(content, state, actor as string)
            .filter(([id]) => statusRecord(content, id).tags?.includes(tag as string) === true)
            .reduce((sum, [, stacks]) => sum + stacks, 0),
      },
    },
    effects: {
      'add-to-stat': {
        run: (ctx, effect) => addToStat(ctx, effect.actor as string, effect.stat as string, effect.by),
        preview: (ctx, effect) => {
          const actor = effect.actor as string;
          const stat = effect.stat as string;
          const now = parts(ctx, ctx.read(), actor, stat);
          const adds = now.parts.reduce((sum, p) => sum + p.add, 0);
          const percents = now.parts.reduce((sum, p) => sum + p.percent, 0);
          const base = baseOf(ctx.content, ctx.read(), actor, stat) + (effect.by as number);
          return { actor, stat, from: now.value, to: settle(statRecord(ctx.content, stat), base + adds, percents) };
        },
      },
      'damage-stat': {
        run: (ctx, effect) => {
          const actor = effect.actor as string;
          const stat = effect.stat as string;
          damageStat(ctx, actor, stat, countOf(effect.by, 'damage-stat', 'by'), valueIn(ctx, actor, stat));
        },
        preview: (ctx, effect) => poolPreview(ctx, effect, valueIn(ctx, effect.actor as string, effect.stat as string)),
      },
      'heal-stat': {
        run: (ctx, effect) => healStat(ctx, effect.actor as string, effect.stat as string, optionalCount(effect, 'by')),
        preview: (ctx, effect) => poolPreview(ctx, effect, valueIn(ctx, effect.actor as string, effect.stat as string)),
      },
      'add-status': {
        run: (ctx, effect) =>
          addStatus(ctx, effect.actor as string, effect.status as string, optionalCount(effect, 'stacks') ?? 1),
        preview: (ctx, effect) => {
          const actor = effect.actor as string;
          const status = effect.status as string;
          const from = stacksOf(ctx.content, ctx.read(), actor, status);
          const cap = statusRecord(ctx.content, status).stacks ?? 1;
          return { actor, status, from, to: Math.min(cap, from + (optionalCount(effect, 'stacks') ?? 1)) };
        },
      },
      'remove-status': {
        run: (ctx, effect) =>
          removeStatus(ctx, effect.actor as string, effect.status as string, optionalCount(effect, 'stacks')),
        preview: (ctx, effect) => {
          const actor = effect.actor as string;
          const status = effect.status as string;
          statusRecord(ctx.content, status);
          const from = stacksOf(ctx.content, ctx.read(), actor, status);
          const stacks = optionalCount(effect, 'stacks');
          return { actor, status, from, to: stacks === undefined ? 0 : Math.max(0, from - stacks) };
        },
      },
    },
    // Time passing is the time module's event, which a game may not have: a listener for an event
    // no module declares is refused, so the kit hears every event and picks that one out.
    on: {
      '*': (ctx, event) => {
        // As each day starts, so the rows of the days after the end don't see it (M3.5); and once
        // time has passed, for a status that ends on a tick within a day.
        if (event.type === 'time/day-started' || event.type === 'time/passed') expireDue(ctx);
      },
    },
    events: {
      'base-changed': { args: { ...ACTOR_ARG, ...STAT_ARG, by: { type: 'int' } }, label: 'A base changes' },
      damaged: { args: { ...ACTOR_ARG, ...STAT_ARG, by: COUNT }, label: 'A stat takes damage' },
      healed: { args: { ...ACTOR_ARG, ...STAT_ARG, by: COUNT }, label: 'A stat is healed' },
      emptied: { args: { ...ACTOR_ARG, ...STAT_ARG }, label: 'A stat runs out' },
      'status-added': { args: { ...ACTOR_ARG, ...STATUS_ARG, stacks: COUNT }, label: 'A status is added' },
      'status-removed': { args: { ...ACTOR_ARG, ...STATUS_ARG, stacks: STACKS }, label: 'A status comes off' },
    },
  });
}

/** What damage or healing would leave: what is left before and after. */
function poolPreview(ctx: PreviewContext<StatsSlice>, effect: Effect, value: number): Record<string, unknown> {
  const actor = effect.actor as string;
  const stat = effect.stat as string;
  const from = currentOf(ctx.content, ctx.read(), actor, stat, value);
  const floor = statRecord(ctx.content, stat).min ?? 0;
  if (effect.effect === 'damage-stat') {
    const by = countOf(effect.by, 'damage-stat', 'by');
    return { actor, stat, from, to: Math.max(floor, from - by) };
  }
  const damage = ctx.read().actors[actor]?.damage?.[stat] ?? 0;
  const by = optionalCount(effect, 'by') ?? damage;
  return { actor, stat, from, to: Math.max(floor, value - Math.max(0, damage - by)) };
}
