/**
 * Content packs: what the compiler writes and the runtime loads (docs/specs/project-format.md).
 * The runtime never reads a project folder, only packs, and checks each one here first.
 */
import { isRecordId, type RecordPack } from './records.ts';
import { stateHash } from './stateHash.ts';

/**
 * The newest format this engine reads and writes. Format 2 (M3.2) adds the project's scripts as
 * JavaScript. A pack without scripts is still written as format 1, so an older engine reads it and
 * its hash stays what it was.
 */
export const PACK_FORMAT = 2;

export interface PackProject {
  readonly id: string;
  readonly name: string;
  readonly version: string;
}

export interface Pack {
  readonly format: 1 | 2;
  readonly project: PackProject;
  readonly records: RecordPack;
  /** Format 2 only: each script's JavaScript by id, scripts/game.ts's among them (M3.2, D38). */
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

/** A pack of the records, and of the scripts when there are any (format 2). */
export function createPack(
  project: PackProject,
  records: RecordPack,
  scripts?: Readonly<Record<string, string>>,
): Pack {
  const content =
    scripts !== undefined && Object.keys(scripts).length > 0
      ? ({ format: 2, project, records, scripts } as const)
      : ({ format: 1, project, records } as const);
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
  if (value.format !== 1 && value.format !== 2) {
    throw new PackError(
      typeof value.format === 'number' && value.format > PACK_FORMAT
        ? `This pack is format ${value.format}; this engine reads formats 1 to ${PACK_FORMAT}. Update the engine.`
        : `Unknown pack format: ${JSON.stringify(value.format)}`,
    );
  }
  const scripted = value.format === 2;
  checkKeys(value, ['format', 'project', 'records', ...(scripted ? ['scripts'] : []), 'hash'], 'pack');
  checkProject(value.project);
  checkRecords(value.records);
  if (scripted) checkScripts(value.scripts);
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

function checkProject(project: unknown): void {
  if (!isObject(project)) throw new PackError('The pack has no project');
  checkKeys(project, ['id', 'name', 'version'], 'pack project');
  if (!isRecordId(project.id)) throw new PackError('The pack project has no valid id');
  for (const key of ['name', 'version'] as const) {
    if (typeof project[key] !== 'string') throw new PackError(`The pack project has no ${key}`);
  }
}

function checkScripts(scripts: unknown): void {
  if (!isObject(scripts) || Object.keys(scripts).length === 0) throw new PackError('A format 2 pack has no scripts');
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
