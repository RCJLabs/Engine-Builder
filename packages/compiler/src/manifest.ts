import { type CalendarDef, calendarOf, MAX_RATE, msPerTickAt, type PackProject, RECORD_ID_PATTERN } from '@eb/core';
import { kitsOn, TIME } from '@eb/kits';
import { calendarSchema, type SchemaIssue, schemaIssues, z } from '@eb/schema';

/**
 * The project format this engine writes and reads. Like SAVE_VERSION, it goes up when a project
 * written today would no longer load unchanged; the new format then brings a migration and a
 * fixture of the old one that must still compile (docs/specs/project-format.md).
 */
export const PROJECT_FORMAT = 1;

// Semantic versioning's MAJOR.MINOR.PATCH, with an optional pre-release such as "-beta.2".
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * project.json, format 1. `kits` (M3.3, D41), `calendar` (M3.5, D43), `start-space` (M5.9, D71) and `clock` (M6.3, D75)
 * need no new format: a project without them reads as before. Kits' ids are checked beyond the schema (E033, E034), and
 * a calendar's sense too (E038), so neither stops the project being read.
 */
export const projectSchema = z.strictObject({
  format: z.literal(PROJECT_FORMAT),
  id: z.string().regex(RECORD_ID_PATTERN, { error: 'Not a valid project id: use lowercase words joined by hyphens' }),
  name: z.string().min(1),
  version: z.string().regex(VERSION, { error: 'Expected a version like "1.2.0" or "1.2.0-beta.1"' }),
  kits: z
    .array(z.string({ error: 'A kit is named by its id, like "inventory"' }), { error: 'Expected a list of kits' })
    .optional(),
  // Checked apart (E038), so a calendar half filled in never stops project.json being read.
  calendar: z.unknown().optional(),
  // Checked apart (E080), as the calendar is: the clock while walking (M6.3, D75).
  clock: z.unknown().optional(),
  // The space a game of two or more starts in (M5.9): checked against the spaces once they are read (E075).
  'start-space': z.string().regex(RECORD_ID_PATTERN, { error: "Not a valid space id: use its file's name" }).optional(),
});

export interface ManifestProblem extends SchemaIssue {
  readonly code: 'E008' | 'E009' | 'E033' | 'E034' | 'E038' | 'E080' | 'W116';
}

/**
 * The calendar the time kit reads, a day a tick unless it says otherwise, or why there is none to
 * read: its shape, then its sense (E038), or the time kit off (W116). The kit then keeps a day a tick.
 */
function calendarFor(given: unknown, on: readonly string[]): { calendar?: CalendarDef; problems: ManifestProblem[] } {
  if (given === undefined) return { problems: [] };
  if (!on.includes(TIME)) {
    const message = "Nothing reads this calendar: it is the time kit's, which project.json doesn't turn on";
    return { problems: [{ code: 'W116', path: '/calendar', message }] };
  }
  const issues = schemaIssues(calendarSchema, given);
  if (issues.length > 0) {
    return {
      problems: issues.map((issue) => ({ code: 'E038', path: `/calendar${issue.path}`, message: issue.message })),
    };
  }
  const calendar = { ticksPerDay: 1, ...(given as Partial<CalendarDef>) };
  try {
    calendarOf(calendar);
    return { calendar, problems: [] };
  } catch (error) {
    // calendarOf's words name the calendar already: "Calendar: weekdays must not be empty".
    const message = error instanceof Error ? error.message : String(error);
    return { problems: [{ code: 'E038' as const, path: '/calendar', message }] };
  }
}

/**
 * The clock's rate as given, when it is one the calendar runs at (0 stops it), or E080: the time
 * kit off, a rate that isn't a whole number from 0 to MAX_RATE, or ticks that aren't whole real
 * milliseconds at it. Whether a project with no clock runs at 20 waits for its spaces (W149).
 */
function clockFor(
  given: unknown,
  on: readonly string[],
  calendar: CalendarDef | undefined,
): { rate?: number; problems: ManifestProblem[] } {
  if (given === undefined) return { problems: [] };
  const fail = (path: string, message: string) => ({ problems: [{ code: 'E080' as const, path, message }] });
  if (!on.includes(TIME)) return fail('/clock', "The clock is the time kit's, which project.json doesn't turn on");
  const rate = typeof given === 'object' && given !== null ? (given as { rate?: unknown }).rate : undefined;
  const extra = typeof given === 'object' && given !== null ? Object.keys(given).filter((k) => k !== 'rate') : [];
  if (extra.length > 0 || typeof given !== 'object' || given === null || Array.isArray(given))
    return fail('/clock', 'A clock is { "rate": game seconds a real second }');
  if (typeof rate !== 'number' || !Number.isSafeInteger(rate) || rate < 0 || rate > MAX_RATE)
    return fail(
      '/clock/rate',
      `The rate is game seconds a real second: a whole number from 0, which stops it, to ${MAX_RATE}`,
    );
  const ticksPerDay = calendar?.ticksPerDay ?? 1;
  if (rate > 0 && msPerTickAt(ticksPerDay, rate) === undefined) {
    const message = `At ${rate}x a tick of ${ticksPerDay} a day isn't a whole number of real milliseconds: pick a rate that splits 86,400,000 ms by ${ticksPerDay} ticks`;
    return fail('/clock/rate', message);
  }
  return { rate, problems: [] };
}

/**
 * The project's id, name, version and the kits on, in the engine's order, or the problems that
 * stop project.json being read. A kit's problems don't stop it: that kit is off. `clockRate` is
 * project.json's clock when it gives one: its rate when sound, null when E080 refused it.
 */
export function checkManifest(value: unknown): {
  project: PackProject | null;
  problems: ManifestProblem[];
  startSpace?: string;
  clockRate?: number | null;
} {
  const format = typeof value === 'object' && value !== null ? (value as { format?: unknown }).format : undefined;
  if (typeof format === 'number' && Number.isInteger(format) && format > PROJECT_FORMAT) {
    const message = `This project is format ${format}; this engine reads formats up to ${PROJECT_FORMAT}. Update the engine.`;
    return { project: null, problems: [{ code: 'E009', path: '/format', message }] };
  }
  const issues = schemaIssues(projectSchema, value);
  if (issues.length > 0) return { project: null, problems: issues.map((issue) => ({ code: 'E008', ...issue })) };
  const {
    id,
    name,
    version,
    kits = [],
    calendar,
    clock,
    'start-space': startSpace,
  } = value as z.infer<typeof projectSchema>;
  const { on, problems } = kitsOn(kits);
  const listed: ManifestProblem[] = problems.map(({ code, index, message }) => ({
    code,
    path: `/kits/${index}`,
    message,
  }));
  const timed = calendarFor(calendar, on);
  const clocked = clockFor(clock, on, timed.calendar);
  const kitted = { id, name, version, kits: on, ...(timed.calendar ? { calendar: timed.calendar } : {}) };
  return {
    project: on.length > 0 ? kitted : { id, name, version },
    problems: [...listed, ...timed.problems, ...clocked.problems],
    ...(startSpace !== undefined ? { startSpace } : {}),
    ...(clock !== undefined ? { clockRate: clocked.rate ?? null } : {}),
  };
}
