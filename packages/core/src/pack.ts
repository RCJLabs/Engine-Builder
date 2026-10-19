/**
 * Content packs: what the compiler writes and the runtime loads (docs/specs/project-format.md).
 * The runtime never reads a project folder, only packs, and checks each one here first.
 */
import { isRecordId, type RecordPack } from './records.ts';
import { stateHash } from './stateHash.ts';
import { type CalendarDef, calendarOf } from './time/calendar.ts';

/**
 * The newest format this engine reads and writes. Format 2 (M3.2) adds the project's scripts as
 * JavaScript; format 3 (M3.3) the kits its project lists, scripts or none. A pack is written in
 * the lowest format that holds it, so one without scripts or kits is still format 1, an older
 * engine reads it and its hash stays what it was.
 */
export const PACK_FORMAT = 3;

export interface PackProject {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  /** Format 3 only: the kits the project lists, in the engine's order (M3.3, D41). */
  readonly kits?: readonly string[];
  /** Format 3 with the time kit: the calendar project.json gives (M3.5, D43). */
  readonly calendar?: CalendarDef;
}

export interface Pack {
  readonly format: 1 | 2 | 3;
  readonly project: PackProject;
  readonly records: RecordPack;
  /** Format 2, and 3 when there are any: each script's JavaScript by id, scripts/game.ts's among them (M3.2, D38). */
  readonly scripts?: Readonly<Record<string, string>>;
  /** FNV-1a 64 of the canonical JSON of the rest of the pack: the same content gives the same hash anywhere. */
  readonly hash: string;
}

export const packHash = (pack: Omit<Pack, 'hash'>): string =>
  stateHash({
    format: pack.format,
    project: pack.project,
    records: pack.records,
    ...(pack.scripts !== undefined ? { scripts: pack.scripts } : {}),
  });

/** A pack of the records, with the scripts when there are any (format 2) and the kits when the project lists any (format 3). */
export function createPack(
  project: PackProject,
  records: RecordPack,
  scripts?: Readonly<Record<string, string>>,
): Pack {
  const scripted = scripts !== undefined && Object.keys(scripts).length > 0;
  // The calendar travels only with the kits: it is the time kit's.
  const { kits, calendar, ...plain } = project;
  const kitted = { ...plain, kits, ...(calendar !== undefined ? { calendar } : {}) };
  const content =
    kits !== undefined && kits.length > 0
      ? ({ format: 3, project: kitted, records, ...(scripted ? { scripts } : {}) } as const)
      : scripted
        ? ({ format: 2, project: plain, records, scripts } as const)
        : ({ format: 1, project: plain, records } as const);
  return { ...content, hash: packHash(content) };
}

export class PackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackError';
  }
}

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Checks a parsed pack before the sim uses it: its format, its shape and its hash. A pack that
 * was edited by hand or cut short fails here rather than as a missing record mid-game.
 */
export function readPack(value: unknown): Pack {
  if (!isObject(value)) throw new PackError('A pack must be a JSON object');
  if (value.format !== 1 && value.format !== 2 && value.format !== 3) {
    throw new PackError(
      typeof value.format === 'number' && value.format > PACK_FORMAT
        ? `This pack is format ${value.format}; this engine reads formats 1 to ${PACK_FORMAT}. Update the engine.`
        : `Unknown pack format: ${JSON.stringify(value.format)}`,
    );
  }
  const { format } = value;
  checkKeys(value, ['format', 'project', 'records', ...(format >= 2 ? ['scripts'] : []), 'hash'], 'pack');
  checkProject(value.project, format === 3);
  checkRecords(value.records);
  if (format === 2 || value.scripts !== undefined) checkScripts(value.scripts, format);
  if (typeof value.hash !== 'string') throw new PackError('The pack has no hash');
  const pack = value as unknown as Pack;
  const actual = packHash(pack);
  if (actual !== pack.hash) throw new PackError(`The pack's hash is ${pack.hash}, but its content hashes to ${actual}`);
  return pack;
}

// Packs are machine-written, so an unexpected field means a different format, not a typo.
function checkKeys(value: Readonly<Record<string, unknown>>, allowed: readonly string[], what: string): void {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length > 0) throw new PackError(`Unknown ${what} fields: ${extra.join(', ')}`);
}

function checkProject(project: unknown, kitted: boolean): void {
  if (!isObject(project)) throw new PackError('The pack has no project');
  checkKeys(project, ['id', 'name', 'version', ...(kitted ? ['kits', 'calendar'] : [])], 'pack project');
  if (!isRecordId(project.id)) throw new PackError('The pack project has no valid id');
  for (const key of ['name', 'version'] as const) {
    if (typeof project[key] !== 'string') throw new PackError(`The pack project has no ${key}`);
  }
  if (!kitted) return;
  const { kits, calendar } = project;
  if (!Array.isArray(kits) || kits.length === 0 || !kits.every(isRecordId)) {
    throw new PackError('A format 3 pack lists its kits');
  }
  if (calendar === undefined) return;
  if (!kits.includes('time')) throw new PackError("A pack's calendar is the time kit's, which it doesn't list");
  try {
    calendarOf(calendar as CalendarDef);
  } catch (error) {
    throw new PackError(`The pack's calendar: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function checkScripts(scripts: unknown, format: number): void {
  if (!isObject(scripts) || Object.keys(scripts).length === 0)
    throw new PackError(`A format ${format} pack has no scripts`);
  for (const [id, js] of Object.entries(scripts)) {
    if (!isRecordId(id)) throw new PackError(`"${id}" is not a valid script name`);
    if (typeof js !== 'string') throw new PackError(`The pack's script "${id}" is not text`);
  }
}

function checkRecords(records: unknown): void {
  if (!isObject(records)) throw new PackError('The pack has no records');
  for (const [type, group] of Object.entries(records)) {
    if (!isRecordId(type)) throw new PackError(`"${type}" is not a valid record type name`);
    if (!isObject(group)) throw new PackError(`The pack's ${type} records are not an object`);
    for (const id of Object.keys(group)) {
      if (!isRecordId(id)) throw new PackError(`"${type}:${id}" does not have a valid record id`);
    }
  }
}
