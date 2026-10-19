/**
 * The time kit's effects (M3.5, D43): `wait` and `cancel-timer` as fields, for the editor's forms,
 * with wait's lengths in the calendar's own units; `schedule` as a schema only, since no field
 * holds a list of effects, so the editor writes it as JSON.
 */
import { type CalendarDef, calendarOf, canonicalJson } from '@eb/core';
import { TIME } from '@eb/kits';
import type { z } from 'zod';
import { effect } from './effect.ts';
import type { EffectFile } from './kitEffects.ts';
import { cancelTimerEffect, scheduleEffect } from './time.ts';
import type { Fields } from './typeFile.ts';

const label = (unit: string) => `${unit.charAt(0).toUpperCase()}${unit.slice(1)}`;

/** The time kit's effects with forms, for this calendar. */
export function timeEffectFiles(calendar: CalendarDef): EffectFile[] {
  const units = Object.keys(calendarOf(calendar).units);
  const lengths: Fields = Object.fromEntries(
    units.map((unit) => [unit, { kind: 'int', min: 0, optional: true, label: label(unit) }]),
  );
  return [
    { effect: 'wait', kit: TIME, label: 'Wait', fields: lengths },
    {
      effect: 'cancel-timer',
      kit: TIME,
      label: 'Cancel a timer',
      fields: {
        timer: { kind: 'text', min: 1, label: 'Timer', description: 'Its name: lowercase words joined by hyphens' },
      },
    },
  ];
}

// Made once for each calendar: a project's checks run after every edit in the editor.
const made = new Map<string, readonly z.core.$ZodType[]>();

/** The time kit's effect schemas for this calendar: wait's from its fields, schedule's and cancel-timer's as written. */
export function timeEffectSchemas(
  calendar: CalendarDef,
  fromFile: (file: EffectFile) => z.core.$ZodType,
): readonly z.core.$ZodType[] {
  const key = canonicalJson(calendar);
  let found = made.get(key);
  if (!found) {
    const [wait] = timeEffectFiles(calendar);
    found = [fromFile(wait as EffectFile), scheduleEffect(effect(), calendar), cancelTimerEffect()];
    made.set(key, found);
  }
  return found;
}
