import { type PackProject, RECORD_ID_PATTERN } from '@eb/core';
import { kitsOn } from '@eb/kits';
import { type SchemaIssue, schemaIssues, z } from '@eb/schema';

/**
 * The project format this engine writes and reads. Like SAVE_VERSION, it goes up when a project
 * written today would no longer load unchanged; the new format then brings a migration and a
 * fixture of the old one that must still compile (docs/specs/project-format.md).
 */
export const PROJECT_FORMAT = 1;

// Semantic versioning's MAJOR.MINOR.PATCH, with an optional pre-release such as "-beta.2".
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * project.json, format 1. `kits` (M3.3, D41) needs no new format: a project without it reads as
 * before. Its ids are checked beyond the schema (E033, E034), so a kit misspelled doesn't stop
 * the project being read.
 */
export const projectSchema = z.strictObject({
  format: z.literal(PROJECT_FORMAT),
  id: z.string().regex(RECORD_ID_PATTERN, { error: 'Not a valid project id: use lowercase words joined by hyphens' }),
  name: z.string().min(1),
  version: z.string().regex(VERSION, { error: 'Expected a version like "1.2.0" or "1.2.0-beta.1"' }),
  kits: z
    .array(z.string({ error: 'A kit is named by its id, like "inventory"' }), { error: 'Expected a list of kits' })
    .optional(),
});

export interface ManifestProblem extends SchemaIssue {
  readonly code: 'E008' | 'E009' | 'E033' | 'E034';
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
  const { id, name, version, kits = [] } = value as z.infer<typeof projectSchema>;
  const { on, problems } = kitsOn(kits);
  const listed = problems.map(({ code, index, message }) => ({ code, path: `/kits/${index}`, message }));
  return { project: on.length > 0 ? { id, name, version, kits: on } : { id, name, version }, problems: listed };
}
