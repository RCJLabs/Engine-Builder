/**
 * Statuses applied and taken off (docs/specs/stats.md, D42): stacks to a cap, the later end when
 * applied again (Wasteland Protocol's `Math.max` of old and new), and those whose time has come
 * taken off as time passes.
 */
import type { ModuleContext } from '@eb/core';
import { setStatus } from './state.ts';
import type { Lasts, StatsSlice, Until } from './types.ts';
import { actorRecord, actorState, stacksOf, statusRecord } from './values.ts';

/** When a status that lasts `lasts` ends, applied now: it needs the time module's day or tick. */
function untilFrom(ctx: ModuleContext<StatsSlice>, lasts: Lasts): Until {
  if (lasts.days !== undefined) return { day: (ctx.fact('time.day') as number) + lasts.days };
  if (lasts.ticks !== undefined) return { tick: (ctx.fact('time.tick') as number) + lasts.ticks };
  throw new Error('A status lasts days or ticks');
}

/** The later of two ends; of two kinds (content changed between), the new one. */
function later(old: Until | undefined, next: Until): Until {
  if (old === undefined) return next;
  if ('day' in old && 'day' in next) return old.day >= next.day ? old : next;
  if ('tick' in old && 'tick' in next) return old.tick >= next.tick ? old : next;
  return next;
}

/** Adds stacks up to the cap. One with stacks and no end outlasts any time, so keeps none. */
export function addStatus(ctx: ModuleContext<StatsSlice>, actor: string, status: string, stacks: number): void {
  actorRecord(ctx.content, actor);
  const record = statusRecord(ctx.content, status);
  const have = stacksOf(ctx.content, ctx.read(), actor, status);
  const held = actorState(ctx.read(), actor).statuses?.[status];
  const next = Math.min(record.stacks ?? 1, have + stacks);
  const untimed = record.lasts === undefined || (have > 0 && held?.until === undefined);
  const until = untimed ? undefined : later(held?.until, untilFrom(ctx, record.lasts as Lasts));
  setStatus(ctx, actor, status, until === undefined ? { stacks: next } : { stacks: next, until });
  ctx.emit('status-added', { actor, status, stacks: next });
}

/** Takes stacks off, all of them when `stacks` is left out; nothing when it has none. */
export function removeStatus(
  ctx: ModuleContext<StatsSlice>,
  actor: string,
  status: string,
  stacks: number | undefined,
): void {
  statusRecord(ctx.content, status);
  const have = stacksOf(ctx.content, ctx.read(), actor, status);
  if (have === 0) return;
  const left = stacks === undefined ? 0 : Math.max(0, have - stacks);
  const until = actorState(ctx.read(), actor).statuses?.[status]?.until;
  setStatus(ctx, actor, status, left > 0 && until !== undefined ? { stacks: left, until } : { stacks: left });
  ctx.emit('status-removed', { actor, status, stacks: left });
}

const reached = (until: Until, day: () => number, tick: () => number): boolean =>
  'day' in until ? until.day <= day() : until.tick <= tick();

/** Every timed status whose end has come loses all its stacks, actor by actor and status by status in id order. */
export function expireDue(ctx: ModuleContext<StatsSlice>): void {
  const due: [string, string][] = [];
  const day = () => ctx.fact('time.day') as number;
  const tick = () => ctx.fact('time.tick') as number;
  for (const actor of Object.keys(ctx.read().actors).sort()) {
    const statuses = ctx.read().actors[actor]?.statuses ?? {};
    for (const status of Object.keys(statuses).sort()) {
      const until = statuses[status]?.until;
      if (until !== undefined && reached(until, day, tick)) due.push([actor, status]);
    }
  }
  for (const [actor, status] of due) removeStatus(ctx, actor, status, undefined);
}
