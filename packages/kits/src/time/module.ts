/**
 * The time kit's module: the time module for the project's calendar, or a day a tick; with a clock
 * (M6.3, D75), following the walk's real time at its rate.
 */
import { type CalendarDef, type ClockDef, ELAPSE_CAP_MS, type Module, msPerTickAt, timeModule } from '@eb/core';
import { DEFAULT_CALENDAR } from './types.ts';

export function timeKit(calendar: CalendarDef = DEFAULT_CALENDAR, clock?: ClockDef): Module {
  if (clock === undefined) return timeModule({ calendar });
  const msPerTick = msPerTickAt(calendar.ticksPerDay, clock.rate);
  // readPack and E080 keep any other clock from a game: one here is a programmer's error.
  if (msPerTick === undefined) throw new Error(`A clock at ${clock.rate}x can't run this calendar`);
  return timeModule({ calendar, realTime: { msPerTick, maxElapseMs: ELAPSE_CAP_MS } });
}
