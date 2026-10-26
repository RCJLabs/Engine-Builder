/**
 * Edits to project.json's name and version: the first things the editor edits. M2.4's forms
 * build steps the same way, for records. Since M3.3, its kits too (D41), and since M3.5 its
 * calendar (D43).
 */
import { MANIFEST_FILE, type ProjectSource, projectSchema } from '@eb/compiler';
import { KITS } from '@eb/kits';
import type { FileChange } from './history.ts';
import { editJson, readJson } from './jsonText.ts';

export type ManifestField = 'name' | 'version';

export const FIELD_LABELS: Record<ManifestField, string> = {
  name: 'Rename the project',
  version: 'Change the version',
};

/** Why `value` can't go in the field, in a sentence, or null when it can. */
export function manifestProblem(field: ManifestField, value: string): string | null {
  // The schema takes any name of one character or more; a name of spaces alone reads as none.
  if (field === 'name') return value.trim() === '' ? 'A project needs a name.' : null;
  const checked = projectSchema.shape.version.safeParse(value);
  return checked.success ? null : (checked.error.issues[0]?.message ?? 'Not a version.');
}

/**
 * The change that puts `value` in project.json, in the file's own layout, or null when there is
 * no project.json or the field already holds it.
 */
export async function manifestChange(
  source: ProjectSource,
  field: ManifestField,
  value: string,
): Promise<FileChange | null> {
  const before = await source.read(MANIFEST_FILE);
  if (before === undefined) return null;
  // Spreading keeps each key where it was, so only the edited line moves in a diff.
  const after = editJson(before, (manifest) => ({ ...(manifest as object), [field]: value }));
  return after === before ? null : { path: MANIFEST_FILE, before, after };
}

/**
 * The change that turns kits on or off: `kits` in the engine's order, or no `kits` at all when
 * none are on, as a project made before M3.3 has it. Null when there is no project.json, or the
 * kits are already those.
 */
export async function kitsChange(source: ProjectSource, kits: readonly string[]): Promise<FileChange | null> {
  const before = await source.read(MANIFEST_FILE);
  if (before === undefined) return null;
  // Spreading keeps `kits` where it was; a project without it gets it last.
  const after = editJson(before, (manifest) => {
    const { kits: _, ...rest } = manifest as Record<string, unknown>;
    return kits.length === 0 ? rest : { ...(manifest as object), kits: [...kits] };
  });
  return after === before ? null : { path: MANIFEST_FILE, before, after };
}

/**
 * The change that turns `kit` on or off, from the kits project.json lists as the edit runs rather
 * than the boxes as last drawn: a second box ticked before the first one's edit landed undid it
 * (M3.8, seen on CI with Dialogue then Economy).
 */
export async function kitToggle(source: ProjectSource, kit: string, wanted: boolean): Promise<FileChange | null> {
  const bytes = await source.read(MANIFEST_FILE);
  if (bytes === undefined) return null;
  const listed = (readJson(bytes).value as { kits?: unknown }).kits;
  const on = Array.isArray(listed) ? listed.filter((id): id is string => typeof id === 'string') : [];
  return kitsChange(source, kitsWith(on, kit, wanted));
}

/** The kits on once `kit` is turned on or off, in the engine's order. */
export function kitsWith(on: readonly string[], kit: string, wanted: boolean): string[] {
  const next = new Set(on);
  if (wanted) {
    const add = (id: string): void => {
      next.add(id);
      for (const need of KITS.find((k) => k.id === id)?.needs ?? []) add(need);
    };
    add(kit);
  } else {
    const drop = (id: string): void => {
      next.delete(id);
      for (const other of KITS) if (other.needs.includes(id) && next.has(other.id)) drop(other.id);
    };
    drop(kit);
  }
  return KITS.map((k) => k.id).filter((id) => next.has(id));
}

/** "Turn on the economy kit, with inventory" or "Turn off the inventory kit, with economy". */
export function kitsStep(kit: string, wanted: boolean, before: readonly string[], after: readonly string[]): string {
  const also = wanted
    ? after.filter((id) => id !== kit && !before.includes(id))
    : before.filter((id) => id !== kit && !after.includes(id));
  return `Turn ${wanted ? 'on' : 'off'} the ${kit} kit${also.length > 0 ? `, with ${also.join(' and ')}` : ''}`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * project.json with `calendar` in place of its own (M3.5). A list left empty is taken out: the
 * engine reads an empty list of weekdays or months as a calendar that doesn't hold together, and
 * none is what removing the last one means. A calendar with nothing left in it is taken out too.
 */
export function withCalendar(manifest: unknown, calendar: unknown): unknown {
  if (!isObject(manifest)) return manifest;
  const kept = isObject(calendar)
    ? Object.fromEntries(Object.entries(calendar).filter(([, v]) => !(Array.isArray(v) && v.length === 0)))
    : calendar;
  const empty = isObject(kept) && Object.keys(kept).length === 0;
  // Spreading keeps `calendar` where it was; a project without one gets it last.
  const { calendar: _, ...rest } = manifest;
  return empty || kept === undefined ? rest : { ...manifest, calendar: kept };
}

/** The change `change` makes to project.json's calendar, a calendar left out read as an empty one. */
export async function calendarChange(
  source: ProjectSource,
  change: (calendar: unknown) => unknown,
): Promise<FileChange[]> {
  const before = await source.read(MANIFEST_FILE);
  if (before === undefined) return [];
  const after = editJson(before, (manifest) =>
    withCalendar(manifest, change(isObject(manifest) ? (manifest.calendar ?? {}) : {})),
  );
  return after === before ? [] : [{ path: MANIFEST_FILE, before, after }];
}

/** The change `change` makes to project.json's `key`, left out read as empty and taken out once emptied. */
async function partChange(
  source: ProjectSource,
  key: string,
  change: (part: unknown) => unknown,
): Promise<FileChange[]> {
  const before = await source.read(MANIFEST_FILE);
  if (before === undefined) return [];
  const after = editJson(before, (manifest) => {
    if (!isObject(manifest)) return manifest;
    const next = change(manifest[key] ?? {});
    const { [key]: _, ...rest } = manifest;
    return next === undefined || (isObject(next) && Object.keys(next).length === 0)
      ? rest
      : { ...manifest, [key]: next };
  });
  return after === before ? [] : [{ path: MANIFEST_FILE, before, after }];
}

/**
 * The change `change` makes to project.json's clock (M6.3, D75), a clock left out read as an empty
 * one: one with nothing left in it is taken out, so an emptied Rate means the default again.
 */
export const clockChange = (source: ProjectSource, change: (clock: unknown) => unknown): Promise<FileChange[]> =>
  partChange(source, 'clock', change);

/**
 * The change `change` makes to project.json's fighting (M6.4, D76): who the player is and the
 * combat record a hit reads. Both emptied takes it out, which E082 names once the project has a space.
 */
export const fightingChange = (source: ProjectSource, change: (fighting: unknown) => unknown): Promise<FileChange[]> =>
  partChange(source, 'fighting', change);
