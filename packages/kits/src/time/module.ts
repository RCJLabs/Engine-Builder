/** The time kit's module: the time module for the project's calendar, or a day a tick. */
import { type CalendarDef, type Module, timeModule } from '@eb/core';
import { DEFAULT_CALENDAR } from './types.ts';

export const timeKit = (calendar: CalendarDef = DEFAULT_CALENDAR): Module => timeModule({ calendar });
