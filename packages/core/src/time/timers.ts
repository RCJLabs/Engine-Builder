import type { Condition } from '../logic/types.ts';
import type { ModuleContext } from '../sim/module.ts';
import type { DeepReadonly, Effect } from '../sim/types.ts';
import type { Calendar } from './calendar.ts';
import { MAX_DAYS, nextDayStart, startsAt } from './starts.ts';

/** Timers one advance may fire before it is taken for a timer that keeps firing itself. */
export const MAX_FIRINGS = 10_000;

export interface Timer {
  /** Named by content, or "#n" for one content didn't name, so the two never clash. */
  readonly id: string;
  /** The tick it fires on. Due ticks are absolute, so saving needs nothing more. */
  readonly due: number;
  /** For a repeating timer, the ticks between firings. */
  readonly every?: number;
  /** Checked when it comes due; when it doesn't hold, this firing is skipped. */
  readonly when?: Condition;
  readonly effects: readonly Effect[];
  /** The order timers were scheduled in, which decides between timers due on the same tick. */
  readonly seq: number;
}

export interface TimeSlice {
  /** Ticks since the game started. */
  tick: number;
  /** Real milliseconds that time/elapse counted but that don't yet make a whole tick. */
  carry: number;
  /** The seq the next timer gets. */
  next: number;
  /** Sorted by due, then seq. */
  timers: Timer[];
}

/** Adds a timer in its place: after every timer due before it, or due with it and scheduled first. */
export function insert(slice: TimeSlice, timer: Timer): void {
  let i = slice.timers.length;
  while (i > 0 && comesAfter(slice.timers[i - 1] as Timer, timer)) i--;
  slice.timers.splice(i, 0, timer);
}

const comesAfter = (a: Timer, b: Timer) => a.due > b.due || (a.due === b.due && a.seq > b.seq);

/**
 * Moves time on to `target`, starting each day on the way and firing every timer due by then, in
 * tick order, a day's start before the timers due at its tick. Each day's start and each timer's
 * effects run as one attempt, heard with the clock at its tick, so a consequence that refuses is
 * dropped with a "refused" beat rather than stopping time from passing. A repeating timer is put
 * back before it fires, so its own effects can cancel it. Effects that wait move time on further,
 * and time never goes back.
 */
export function advanceTo(ctx: ModuleContext<TimeSlice>, calendar: Calendar, target: number): void {
  const from = ctx.read().tick;
  let days = 0;
  for (let fired = 0; ; ) {
    const first = ctx.read().timers[0] as DeepReadonly<Timer> | undefined;
    const dayStart = nextDayStart(calendar, ctx.read().tick);
    if (dayStart <= target && (first === undefined || dayStart <= first.due)) {
      if (++days > MAX_DAYS) throw new Error(`More than ${MAX_DAYS} days started in one advance: is a wait that long?`);
      ctx.write().tick = dayStart;
      ctx.attempt(() => {
        for (const [event, args] of startsAt(calendar, dayStart)) ctx.emit(event, args);
      });
      continue;
    }
    if (first === undefined || first.due > target) break;
    if (fired++ === MAX_FIRINGS)
      throw new Error(`More than ${MAX_FIRINGS} timers fired in one advance: is one repeating every tick?`);
    const slice = ctx.write();
    const timer = slice.timers.shift() as Timer;
    slice.tick = Math.max(slice.tick, timer.due);
    if (timer.every !== undefined) insert(slice, { ...timer, due: timer.due + timer.every, seq: slice.next++ });
    if (timer.when !== undefined && ctx.check(timer.when) !== true) {
      ctx.emit('skipped', { timer: timer.id, at: timer.due });
      continue;
    }
    const result = ctx.attempt(() => {
      ctx.emit('fired', { timer: timer.id, at: timer.due });
      for (const effect of timer.effects) ctx.apply(effect);
    });
    if (!result.ok) ctx.emit('refused', { timer: timer.id, at: timer.due, reason: result.reason });
  }
  const slice = ctx.write();
  slice.tick = Math.max(slice.tick, target);
  ctx.emit('passed', { from, to: slice.tick });
}
