/**
 * The time module (docs/specs/time.md): one tick count, read through a calendar, with timers
 * that fire content's effects when they come due. Time moves only when an action moves it: a
 * game's own action applying `wait`, `time/advance` from the stage, or `time/elapse` carrying
 * the wall-clock time since the stage last looked, which counts up to a cap.
 */
import type { Condition, Domain, FactInfo } from '../logic/types.ts';
import { NAME_PATTERN } from '../logic/values.ts';
import { defineModule, type FactSpec, type Module, type ModuleContext } from '../sim/module.ts';
import type { Action, DeepReadonly, Effect } from '../sim/types.ts';
import { type Calendar, type CalendarDef, calendarOf, dateAt, ticksOf } from './calendar.ts';
import { advanceTo, insert, type Timer, type TimeSlice } from './timers.ts';

export interface RealTime {
  /** Real milliseconds per tick, for time/elapse. */
  readonly msPerTick: number;
  /** The most one time/elapse counts, the offline cap; the rest is dropped. A real-time game that pauses when hidden sets it near one frame's worth. */
  readonly maxElapseMs: number;
}

/** A timer as content or the game's setup writes it: the `schedule` effect without `effect`. */
export interface ScheduleSpec {
  readonly after: Readonly<Record<string, number>>;
  readonly every?: Readonly<Record<string, number>>;
  /** Names the timer, for `cancel-timer`, for the time.pending and time.left facts, and to replace it by scheduling the name again. */
  readonly timer?: string;
  /** Checked when the timer comes due: if it doesn't hold, the timer is skipped (rule-or-drool's dropped cards). */
  readonly when?: Condition;
  readonly effects: readonly Effect[];
}

export interface TimeOptions {
  readonly calendar: CalendarDef;
  /** Leave it out for a game whose time never follows the wall clock: time/elapse then doesn't exist. */
  readonly realTime?: RealTime;
  /** Timers the game starts with, such as weekly wages. */
  readonly timers?: readonly ScheduleSpec[];
}

/** Makes the time module for one calendar. Throws on a programmer error in the options. */
export function timeModule(options: TimeOptions): Module {
  const calendar = calendarOf(options.calendar);
  const realTime = options.realTime && checkRealTime(options.realTime);
  return defineModule<TimeSlice>({
    id: 'time',
    init: () => {
      const slice: TimeSlice = { tick: 0, carry: 0, next: 0, timers: [] };
      for (const spec of options.timers ?? []) schedule(calendar, slice, spec);
      return slice;
    },
    actions: {
      advance(ctx, action) {
        const { type: _, ...duration } = action;
        const ticks = tryTicks(calendar, duration);
        if (ticks === undefined) return ctx.refuse('bad-duration');
        advanceTo(ctx, ctx.read().tick + ticks);
      },
      ...(realTime
        ? { elapse: (ctx: ModuleContext<TimeSlice>, action: Action) => elapse(ctx, action.ms, realTime) }
        : {}),
    },
    effects: {
      wait: {
        run: (ctx, effect) => advanceTo(ctx, ctx.read().tick + ticksOf(calendar, durationIn(effect))),
        preview: (ctx, effect) => waitPreview(ctx.read(), ctx.read().tick + ticksOf(calendar, durationIn(effect))),
      },
      schedule: {
        run(ctx, effect) {
          const timer = schedule(calendar, ctx.write(), effect as unknown as ScheduleSpec, ctx.read().tick);
          ctx.emit('scheduled', { timer: timer.id, due: timer.due });
        },
        preview: (ctx, effect) => {
          const spec = effect as unknown as ScheduleSpec;
          const due = ctx.read().tick + ticksOf(calendar, spec.after);
          return spec.every ? { due, every: ticksOf(calendar, spec.every) } : { due };
        },
      },
      'cancel-timer'(ctx, effect) {
        const index = ctx.read().timers.findIndex((t) => t.id === effect.timer);
        if (index === -1) return;
        ctx.write().timers.splice(index, 1);
        ctx.emit('cancelled', { timer: effect.timer as string });
      },
    },
    facts: facts(calendar),
  });
}

function checkRealTime(realTime: RealTime): RealTime {
  const { msPerTick, maxElapseMs } = realTime;
  if (!Number.isSafeInteger(msPerTick) || msPerTick < 1)
    throw new Error('realTime.msPerTick must be a whole number, at least 1');
  if (!Number.isSafeInteger(maxElapseMs) || maxElapseMs < msPerTick) {
    throw new Error('realTime.maxElapseMs must be a whole number, at least msPerTick');
  }
  return realTime;
}

/**
 * Wall-clock time into ticks. The milliseconds short of a whole tick carry over to the next
 * elapse, so many short elapses add up to exactly one long one. Time past the cap is dropped.
 */
function elapse(ctx: ModuleContext<TimeSlice>, ms: unknown, { msPerTick, maxElapseMs }: RealTime) {
  if (typeof ms !== 'number' || !Number.isSafeInteger(ms)) return ctx.refuse('bad-elapsed');
  if (ms < 0) return ctx.refuse('clock-went-back', { ms });
  const counted = Math.min(ms, maxElapseMs);
  if (counted < ms) ctx.emit('capped', { ms, counted });
  const slice = ctx.write();
  const total = slice.carry + counted;
  slice.carry = total % msPerTick;
  advanceTo(ctx, slice.tick + (total - slice.carry) / msPerTick);
}

function schedule(calendar: Calendar, slice: TimeSlice, spec: ScheduleSpec, now = 0): Timer {
  const after = ticksOf(calendar, spec.after ?? {});
  if (after < 1) throw new Error('A timer must come due at least one tick later: give "after" a length');
  const every = spec.every === undefined ? undefined : ticksOf(calendar, spec.every);
  if (every !== undefined && every < 1) throw new Error('"every" must be at least one tick');
  if (!Array.isArray(spec.effects)) throw new Error('A timer needs a list of effects');
  if (spec.timer !== undefined && !NAME_PATTERN.test(spec.timer))
    throw new Error(`"${spec.timer}" is not a valid timer name`);
  const seq = slice.next++;
  const id = spec.timer ?? `#${seq}`;
  // Scheduling a name again replaces its timer: how a cooldown restarts.
  const kept = slice.timers.filter((t) => t.id !== id);
  slice.timers.length = 0;
  slice.timers.push(...kept);
  const timer: Timer = {
    id,
    due: now + after,
    ...(every === undefined ? {} : { every }),
    ...(spec.when === undefined ? {} : { when: spec.when }),
    effects: [...spec.effects],
    seq,
  };
  insert(slice, timer);
  return timer;
}

const durationIn = (effect: Effect): Record<string, unknown> => {
  const { effect: _, ...duration } = effect;
  return duration;
};

function tryTicks(calendar: Calendar, duration: Readonly<Record<string, unknown>>): number | undefined {
  try {
    return ticksOf(calendar, duration);
  } catch {
    return undefined;
  }
}

/** The timers a wait would fire, each once with how many times; not those its firings would add. */
function waitPreview(slice: DeepReadonly<TimeSlice>, to: number) {
  const fires = slice.timers
    .filter((t) => t.due <= to)
    .map((t) => ({ timer: t.id, at: t.due, times: t.every ? 1 + Math.floor((to - t.due) / t.every) : 1 }));
  return { to, fires };
}

function facts(calendar: Calendar): Record<string, FactSpec<TimeSlice>> {
  const date = (state: DeepReadonly<TimeSlice>) => dateAt(calendar, state.tick);
  const int = (min: number, max?: number): Domain =>
    max === undefined ? { type: 'int', min } : { type: 'int', min, max };
  const oneOf = (values: readonly string[]): Domain => ({ type: 'enum', values });
  const fact = (domain: Domain, read: (state: DeepReadonly<TimeSlice>) => unknown, info: FactInfo = {}) => ({
    read: ({ state }: { state: DeepReadonly<TimeSlice> }) => read(state),
    domain,
    ...info,
  });
  const { def, daysPerYear } = calendar;
  const timer = { timer: { type: 'text' } } as const;
  const found = (state: DeepReadonly<TimeSlice>, id: unknown) => state.timers.find((t) => t.id === id);
  return {
    tick: fact(int(0), (s) => s.tick),
    day: fact(int(0), (s) => date(s).day),
    'of-day': fact(int(0, calendar.ticksPerDay - 1), (s) => date(s).ofDay),
    ...(def.phases ? { phase: fact(oneOf(def.phases.map((p) => p.id)), (s) => date(s).phase) } : {}),
    ...(def.weekdays ? { weekday: fact(oneOf(def.weekdays), (s) => date(s).weekday) } : {}),
    ...(daysPerYear === undefined
      ? {}
      : {
          year: fact(int(1), (s) => date(s).year),
          'day-of-year': fact(int(0, daysPerYear - 1), (s) => date(s).dayOfYear),
        }),
    ...(def.months
      ? {
          month: fact(oneOf(def.months.map((m) => m.id)), (s) => date(s).month),
          'day-of-month': fact(int(1, Math.max(...def.months.map((m) => m.days))), (s) => date(s).dayOfMonth),
        }
      : {}),
    ...(calendar.seasons.length > 0
      ? { season: fact(oneOf(calendar.seasons.map((s) => s.id)), (s) => date(s).season) }
      : {}),
    pending: {
      read: ({ state }, args) => found(state, args.timer) !== undefined,
      args: timer,
      domain: { type: 'bool' },
    },
    left: {
      read: ({ state }, args) => {
        const t = found(state, args.timer);
        return t === undefined ? undefined : t.due - state.tick;
      },
      args: timer,
      // 0 while another timer due on the same tick fires first.
      domain: int(0),
    },
  };
}
