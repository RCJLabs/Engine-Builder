/**
 * The time kit (M3.5, D43, docs/specs/time.md#the-time-kit): the engine's own time module, with
 * the calendar project.json gives, so a project made only of data can keep time.
 */
import type { CalendarDef } from '@eb/core';

/** The kit's id, which is the time module's. */
export const TIME = 'time';

/** A calendar for a project that turns the kit on and gives none: a tick is a day. */
export const DEFAULT_CALENDAR: CalendarDef = Object.freeze({ ticksPerDay: 1 });
