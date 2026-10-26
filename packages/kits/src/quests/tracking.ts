/**
 * The tracked quest (M6.6, D78, docs/specs/markers.md#tracking): the walk's markers point at its open
 * objectives' targets. A quest that starts is tracked; when the tracked quest ends, the first active
 * quest by id is, or none. The journal tracks another by quests/track, which takes no time.
 */
import type { DeepReadonly, ModuleContext } from '@eb/core';
import { own } from '../own.ts';
import type { QuestsSlice } from './types.ts';

type Ctx = ModuleContext<QuestsSlice>;

/** The first active quest by id, or none. */
export function firstActive(quests: DeepReadonly<QuestsSlice['quests']>): string | undefined {
  return Object.keys(quests)
    .sort()
    .find((id) => own(quests, id)?.state === 'active');
}

/** A quest that starts is tracked. */
export function trackStarted(ctx: Ctx, id: string): void {
  if (ctx.read().tracked !== id) ctx.write().tracked = id;
}

/** The tracked quest has ended: the first active by id is tracked, or none. */
export function trackEnded(ctx: Ctx, id: string): void {
  const slice = ctx.read();
  if (slice.tracked !== id) return;
  const next = firstActive(slice.quests);
  const written = ctx.write();
  if (next === undefined) delete written.tracked;
  else written.tracked = next;
}

/** quests/track: the journal tracks an active quest. */
export function track(ctx: Ctx, quest: unknown): void {
  if (typeof quest !== 'string' || own(ctx.read().quests, quest)?.state !== 'active') {
    ctx.refuse('not-active', { quest: String(quest) });
  }
  trackStarted(ctx, quest as string);
}

/** Version 3's migration: a save made before tracks its first active quest. */
export function withTracked(slice: unknown): unknown {
  const before = slice as QuestsSlice;
  const tracked = firstActive(before.quests);
  return tracked === undefined ? before : { ...before, tracked };
}
