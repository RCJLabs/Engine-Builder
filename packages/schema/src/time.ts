import { type CalendarDef, calendarOf, type Effect, NAME_PATTERN } from '@eb/core';
import { z } from 'zod';
import { condition } from './condition.ts';

/**
 * Schemas for the time module's effects, for a game's union of effects (docs/specs/time.md).
 * Durations take the calendar's own units, so `{ "months": 1 }` fails when the project is built
 * rather than when the timer is set.
 */
const unitsOf = (calendar: CalendarDef) => Object.keys(calendarOf(calendar).units);

/** A length of time, like `{ "days": 3 }`: whole counts of the calendar's units. */
const durationShape = (calendar: CalendarDef) =>
  Object.fromEntries(unitsOf(calendar).map((unit) => [unit, z.int().min(0).optional()]));

const timerName = z.string().regex(NAME_PATTERN, { error: 'A timer name is lowercase words joined by hyphens' });

// A timer must fall due later than now, and repeat no faster than every tick.
const atLeastATick = (duration: Readonly<Record<string, number | undefined>>) =>
  Object.values(duration).some((count) => (count ?? 0) > 0);

/** `{ "effect": "wait", "hours": 8 }` */
export const waitEffect = (calendar: CalendarDef) =>
  z.strictObject({ effect: z.literal('wait'), ...durationShape(calendar) });

/** `{ "effect": "schedule", "after": { "days": 3 }, "every"?: …, "timer"?: "debt", "when"?: condition, "effects": [...] }` */
export function scheduleEffect(effect: z.ZodType<Effect>, calendar: CalendarDef) {
  const duration = z
    .strictObject(durationShape(calendar))
    .refine(atLeastATick, { error: 'A length of at least one tick' });
  return z.strictObject({
    effect: z.literal('schedule'),
    after: duration,
    every: duration.optional(),
    timer: timerName.optional(),
    when: condition().optional(),
    effects: z.array(effect),
  });
}

/** `{ "effect": "cancel-timer", "timer": "debt" }` */
export const cancelTimerEffect = () => z.strictObject({ effect: z.literal('cancel-timer'), timer: timerName });
