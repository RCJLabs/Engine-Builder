/**
 * export.json (M4.10, D60): a project's targets and the editions they ship, beside project.json.
 * Its shape is here; what it names is checked against the project in exportCheck.ts. The spec is
 * docs/specs/export.md.
 */
import { RECORD_ID_PATTERN } from '@eb/core';
import { z } from '@eb/schema';

export const EXPORT_FILE = 'export.json';

/** The edition with nothing left out: always there, and no edition in export.json may take its name. */
export const FULL = 'full';

export const TARGETS = ['web', 'file', 'itch', 'android'] as const;
export type TargetName = (typeof TARGETS)[number];

const COLOUR = /^#[0-9a-fA-F]{6}$/;
// A host name: lowercase labels joined by dots, ending in a top-level name. No scheme, port or path.
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
// Java's package names, as Play takes them: two or more parts, each a letter then letters, digits or _.
const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
// A SHA-256 certificate fingerprint as keytool and Play Console print it.
const FINGERPRINT = /^(?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/;

const id = z.string().regex(RECORD_ID_PATTERN, { error: 'Not an id: use lowercase words joined by hyphens' });
const ids = (what: string) => z.array(z.string(), { error: `Expected a list of ${what}` }).optional();
const edition = z.strictObject({ edition: id.optional() });

export const leaveOutSchema = z.strictObject({
  types: ids('record types'),
  records: ids('records, as "type:id"'),
  scenes: ids('scene ids'),
  assets: ids('asset paths inside assets/'),
});

export const exportSchema = z.strictObject({
  name: z.string().min(1).optional(),
  'short-name': z.string().min(1).optional(),
  description: z.string().optional(),
  icon: z.string().min(1).optional(),
  orientation: z.enum(['any', 'portrait', 'landscape']).optional(),
  colors: z
    .strictObject({
      background: z.string().regex(COLOUR, { error: 'Expected a colour like "#10161d"' }).optional(),
      theme: z.string().regex(COLOUR, { error: 'Expected a colour like "#10161d"' }).optional(),
    })
    .optional(),
  editions: z.record(z.string(), z.strictObject({ 'leave-out': leaveOutSchema.optional() })).optional(),
  targets: z
    .strictObject({
      web: z
        .strictObject({
          edition: id.optional(),
          domain: z
            .string()
            .regex(HOST, { error: 'Expected a host name like "hut.example.com": no https:// and no path' })
            .optional(),
        })
        .optional(),
      file: edition.optional(),
      itch: edition.optional(),
      android: z
        .strictObject({
          package: z.string().regex(PACKAGE, { error: 'Expected an Android package id like "com.rcjlabs.thehut"' }),
          fingerprints: z
            .array(
              z
                .string()
                .regex(FINGERPRINT, { error: 'Expected a SHA-256 fingerprint: 32 pairs of hex digits joined by ":"' }),
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export type ExportJson = z.infer<typeof exportSchema>;

/** What an edition leaves out, every list there, "type:id" for records. */
export interface LeaveOut {
  readonly types: readonly string[];
  readonly records: readonly string[];
  readonly scenes: readonly string[];
  readonly assets: readonly string[];
}

export const NOTHING_LEFT_OUT: LeaveOut = { types: [], records: [], scenes: [], assets: [] };

/** An edition's leave-out lists, or nothing for `full` and for an edition export.json doesn't have. */
export function leaveOutOf(settings: ExportJson | undefined, edition: string): LeaveOut {
  if (edition === FULL) return NOTHING_LEFT_OUT;
  const given = settings?.editions?.[edition]?.['leave-out'];
  return {
    types: given?.types ?? [],
    records: given?.records ?? [],
    scenes: given?.scenes ?? [],
    assets: given?.assets ?? [],
  };
}

/** The edition a target ships: export.json's, else the full game. Android ships the web build's. */
export function editionOf(settings: ExportJson | undefined, target: TargetName): string {
  const targets = settings?.targets;
  if (target === 'android') return targets?.web?.edition ?? FULL;
  return targets?.[target]?.edition ?? FULL;
}

/**
 * The Android package id the engine offers for a game: com.rcjlabs.<id without hyphens> (D60). A
 * part of a package id can't start with a digit, so a game named "2060td" gets "game2060td".
 */
export function packageIdFor(game: string): string {
  const part = game.replace(/-/g, '');
  return `com.rcjlabs.${/^[0-9]/.test(part) ? `game${part}` : part}`;
}
