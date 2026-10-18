import { type CalendarDef, calendarOf, type PackProject, RECORD_ID_PATTERN } from '@eb/core';
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
 * project.json, format 1. `kits` (M3.3, D41) and `calendar` (M3.5, D43) need no new format: a
 * project without them reads as before. Kits' ids are checked beyond the schema (E033, E034), and
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
  calendar: calendarSchema.optional(),
});

export interface ManifestProblem extends SchemaIssue {
  readonly code: 'E008' | 'E009' | 'E033' | 'E034' | 'E038' | 'W116';
}

/** The calendar the time kit reads, or why there is none to read (E038, W116). */
function calendarFor(calendar: CalendarDef | undefined, on: readonly string[]) {
  if (calendar === undefined) return { problems: [] };
  if (!on.includes(TIME)) {
    const message = "Nothing reads this calendar: it is the time kit's, which project.json doesn't turn on";
    return { problems: [{ code: 'W116' as const, path: '/calendar', message }] };
  }
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
 * The project's id, name, version and the kits on, in the engine's order, or the problems that
 * stop project.json being read. A kit's problems don't stop it: that kit is off.
 */
export function checkManifest(value: unknown): { project: PackProject | null; problems: ManifestProblem[] } {
  const format = typeof value === 'object' && value !== null ? (value as { format?: unknown }).format : undefined;
  if (typeof format === 'number' && Number.isInteger(format) && format > PROJECT_FORMAT) {
    const message = `This project is format ${format}; this engine reads formats up to ${PROJECT_FORMAT}. Update the engine.`;
    return { project: null, problems: [{ code: 'E009', path: '/format', message }] };
  }
  const issues = schemaIssues(projectSchema, value);
  if (issues.length > 0) return { project: null, problems: issues.map((issue) => ({ code: 'E008', ...issue })) };
  const { id, name, version, kits = [], calendar } = value as z.infer<typeof projectSchema>;
  const { on, problems } = kitsOn(kits);
  const listed: ManifestProblem[] = problems.map(({ code, index, message }) => ({
    code,
    path: `/kits/${index}`,
    message,
  }));
  const timed = calendarFor(calendar, on);
  const kitted = { id, name, version, kits: on, ...(timed.calendar ? { calendar: timed.calendar } : {}) };
  return { project: on.length > 0 ? kitted : { id, name, version }, problems: [...listed, ...timed.problems] };
}
