/**
 * Writing the stats slice so it holds only what differs from content: an actor as its record has
 * it holds nothing, so a content update to its record reaches every save.
 */
import type { ModuleContext } from '@eb/core';
import type { StatsSlice, StatusState } from './types.ts';
import { actorRecord } from './values.ts';

interface WritableActor {
  raised?: Record<string, number>;
  damage?: Record<string, number>;
  statuses?: Record<string, StatusState>;
}

const actorsOf = (ctx: ModuleContext<StatsSlice>) => ctx.write().actors as Record<string, WritableActor>;

/** Sets one number of an actor's (a raised base, a stat's damage), dropping it at 0. */
export function setNumber(
  ctx: ModuleContext<StatsSlice>,
  actor: string,
  part: 'raised' | 'damage',
  stat: string,
  to: number,
): void {
  const actors = actorsOf(ctx);
  const state = actors[actor] ?? {};
  const numbers = { ...(state[part] ?? {}) };
  if (to === 0) delete numbers[stat];
  else numbers[stat] = to;
  store(actors, actor, { ...state, [part]: numbers });
}

/** Sets a status's stacks and time: dropped when it is as the actor's record has it, untimed. */
export function setStatus(ctx: ModuleContext<StatsSlice>, actor: string, status: string, held: StatusState): void {
  const actors = actorsOf(ctx);
  const state = actors[actor] ?? {};
  const statuses = { ...(state.statuses ?? {}) };
  const listed = actorRecord(ctx.content, actor).statuses?.includes(status) ? 1 : 0;
  if (held.stacks === listed && held.until === undefined) delete statuses[status];
  else statuses[status] = held.stacks === 0 ? { stacks: 0 } : held;
  store(actors, actor, { ...state, statuses });
}

function store(actors: Record<string, WritableActor>, actor: string, state: WritableActor): void {
  const kept: WritableActor = {};
  if (state.raised && Object.keys(state.raised).length > 0) kept.raised = state.raised;
  if (state.damage && Object.keys(state.damage).length > 0) kept.damage = state.damage;
  if (state.statuses && Object.keys(state.statuses).length > 0) kept.statuses = state.statuses;
  if (Object.keys(kept).length === 0) delete actors[actor];
  else actors[actor] = kept;
}
