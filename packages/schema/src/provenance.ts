/**
 * The provenance log a project keeps for its assets, `assets/assets.json` (D34, Evan's calls): an
 * entry for every file under assets/, saying where it came from and under what licence, so a game
 * never ships art it may not use, and its credits can be written from the log (M4.2). This is the
 * log's format, the licences that pass, and the checks the compiler and the editor share.
 */
import { pointerSegment } from '@eb/core';
import { z } from 'zod';
import { ASSET_PATH_PATTERN, ASSET_TYPES, type AssetKind } from './assets.ts';
import { schemaIssues } from './issues.ts';

export interface Licence {
  readonly id: string;
  /** As people write it: "CC BY 4.0". */
  readonly name: string;
  /** What it allows and asks, in a few words, for the editor's list. */
  readonly note: string;
  /** It asks for credit or for its notice to travel with the file: the log must say who made it. */
  readonly credit: boolean;
  /** The kinds of file it may cover; any kind when absent. */
  readonly kinds?: readonly AssetKind[];
}

/**
 * The licences that pass (D34, Evan's call): a fixed list, so a licence that limits a game in a way
 * no rule here names never slips through. Adding one is a change to the engine, not to a project.
 */
export const LICENCES: readonly Licence[] = [
  { id: 'own', name: 'Own work', note: 'Made for this project by its own people', credit: false },
  {
    id: 'generated',
    name: 'Generated',
    note: 'Made with a generator: its tool and prompt are logged',
    credit: false,
  },
  { id: 'public-domain', name: 'Public domain', note: 'No one holds rights in it', credit: false },
  { id: 'CC0-1.0', name: 'CC0 1.0', note: 'Given to the public domain: no credit needed', credit: false },
  { id: 'CC-BY-4.0', name: 'CC BY 4.0', note: 'Free to use: credit the author', credit: true },
  { id: 'CC-BY-3.0', name: 'CC BY 3.0', note: 'Free to use: credit the author', credit: true },
  { id: 'MIT', name: 'MIT', note: 'Free to use: keep its notice', credit: true },
  { id: 'Apache-2.0', name: 'Apache 2.0', note: 'Free to use: keep its notice', credit: true },
  {
    id: 'OFL-1.1',
    name: 'SIL Open Font License 1.1',
    note: 'Fonts: free to bundle, keep its notice; a changed font stays OFL',
    credit: true,
    kinds: ['font'],
  },
];

const BY_ID = new Map(LICENCES.map((licence) => [licence.id, licence]));

export const licenceOf = (id: string): Licence | undefined => BY_ID.get(id);

/** The kind of the file at `path` inside assets/, by its extension, or undefined for any other file. */
export function kindOfAsset(path: string): AssetKind | undefined {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return (Object.keys(ASSET_TYPES) as AssetKind[]).find((kind) =>
    (ASSET_TYPES[kind] as readonly string[]).includes(ext),
  );
}

// The terms Creative Commons licences add that a game can't live with.
const REFUSED: Record<string, string> = {
  NC: 'NonCommercial (NC) forbids selling the game',
  ND: 'NoDerivatives (ND) forbids changing the work, even to fit it in',
  SA: 'ShareAlike (SA) would bind what is made with it to the same licence',
};

/**
 * Why `id` can't cover the file at `path`, or null when it can. A licence for one kind also covers
 * files of no kind, so a font's notice (OFL.txt), which the OFL asks to travel with it, passes.
 */
export function licenceProblem(id: string, path: string): string | null {
  const licence = licenceOf(id);
  if (licence) {
    const kind = kindOfAsset(path);
    if (!licence.kinds || kind === undefined || licence.kinds.includes(kind)) return null;
    return `${licence.name} is for ${licence.kinds.join(' and ')} files and their notices`;
  }
  const terms = id.toUpperCase().split(/[^A-Z0-9]+/);
  const refused = Object.keys(REFUSED).filter((term) => terms.includes(term));
  if (refused.length > 0) return `Refused: ${refused.map((term) => REFUSED[term]).join('; ')}`;
  return `"${id}" isn't a licence the engine accepts: ${LICENCES.map((l) => l.id).join(', ')}`;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real day, written as YYYY-MM-DD. */
export function isDay(text: string): boolean {
  const match = DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** What the log holds for one file. */
export interface Provenance {
  readonly licence: string;
  /** Where it came from: a link, or words ("Drawn by Evan", "Kenney's UI pack"). */
  readonly source: string;
  /** When it came into the project: YYYY-MM-DD. */
  readonly date: string;
  /** Who made it: needed where the licence asks for credit. */
  readonly author?: string;
  /** For generated art: the tool, and what it was asked. */
  readonly tool?: string;
  readonly prompt?: string;
  /** Hand edits made since, oldest first. */
  readonly edits?: readonly string[];
  /** A placeholder the editor made, to be replaced by real art (W107). */
  readonly standIn?: true;
}

export interface ProvenanceLog {
  /** By path inside assets/. */
  readonly files: Readonly<Record<string, Provenance>>;
}

const text = (said: string) => z.string({ error: 'Expected text' }).min(1, { error: said });

export const provenanceSchema = z.strictObject({
  licence: text('Choose a licence'),
  source: text('Say where it came from: a link, or words'),
  date: z.string({ error: 'Expected a date' }).refine(isDay, { error: 'Expected a date like 2026-10-18' }),
  author: text('Say who made it').optional(),
  tool: text('Name the tool').optional(),
  prompt: text('Write what it was asked').optional(),
  edits: z.array(text('An edit can’t be empty')).optional(),
  standIn: z.literal(true, { error: 'Either true or left out' }).optional(),
}) as unknown as z.ZodType<Provenance>;

export const provenanceLogSchema = z.strictObject({
  files: z.record(
    z.string().regex(ASSET_PATH_PATTERN, { error: 'Expected a path inside assets/, with "/" between folders' }),
    provenanceSchema,
  ),
}) as unknown as z.ZodType<ProvenanceLog>;

export type ProvenanceCode = 'E019' | 'E020' | 'E021' | 'W106' | 'W107';

export interface ProvenanceIssue {
  readonly code: ProvenanceCode;
  /** The asset it is about, for E019 and W107; the others are about the log. */
  readonly asset?: string;
  /** A JSON Pointer into the log, or '' for the asset as a whole. */
  readonly path: string;
  readonly message: string;
}

const at = (file: string, key?: string) => `/files/${pointerSegment(file)}${key ? `/${key}` : ''}`;

/** What one entry's licence asks for and the entry doesn't give, beside the licence itself. */
function entryProblems(file: string, entry: Provenance): ProvenanceIssue[] {
  const found: ProvenanceIssue[] = [];
  const problem = licenceProblem(entry.licence, file);
  if (problem) found.push({ code: 'E020', path: at(file, 'licence'), message: problem });
  const licence = licenceOf(entry.licence);
  if (licence?.credit && entry.author === undefined) {
    found.push({ code: 'E020', path: at(file), message: `${licence.name} asks for credit: say who made it` });
  }
  if (entry.licence === 'generated') {
    for (const key of ['tool', 'prompt'] as const) {
      if (entry[key] === undefined) {
        found.push({ code: 'E020', path: at(file), message: `Generated art logs its ${key}: add it` });
      }
    }
  }
  return found;
}

/**
 * The log's problems against the files under assets/ (`assets`, paths inside it): its shape
 * (E021), each entry's licence (E020), files with no entry (E019), entries for no file (W106) and
 * stand-ins (W107). `log` undefined means there is no log at all. A log whose files can't be
 * read as entries gives E021 alone: one problem, one diagnostic.
 */
export function checkProvenance(log: unknown, assets: ReadonlySet<string>): ProvenanceIssue[] {
  const issues: ProvenanceIssue[] = [];
  const files =
    typeof log === 'object' && log !== null && !Array.isArray(log) ? (log as { files?: unknown }).files : undefined;
  if (log !== undefined) {
    for (const { path, message } of schemaIssues(provenanceLogSchema, log))
      issues.push({ code: 'E021', path, message });
  }
  const readable = typeof files === 'object' && files !== null && !Array.isArray(files);
  if (log !== undefined && !readable) return issues;
  const entries = (readable ? files : {}) as Record<string, unknown>;
  for (const asset of [...assets].sort()) {
    if (!Object.hasOwn(entries, asset)) {
      issues.push({ code: 'E019', asset, path: '', message: 'No provenance: log its licence and source' });
    }
  }
  for (const [file, entry] of Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!assets.has(file)) {
      issues.push({ code: 'W106', path: at(file), message: `No file assets/${file}: the entry can go` });
    }
    // An entry that isn't the right shape has its E021s already; its licence may still be read.
    const shaped = typeof entry === 'object' && entry !== null && typeof (entry as Provenance).licence === 'string';
    if (shaped) issues.push(...entryProblems(file, entry as Provenance));
    if (shaped && (entry as Provenance).standIn === true && assets.has(file)) {
      issues.push({ code: 'W107', asset: file, path: '', message: 'A stand-in: replace it with real art' });
    }
  }
  return issues;
}
