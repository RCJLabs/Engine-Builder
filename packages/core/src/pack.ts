/**
 * Content packs: what the compiler writes and the runtime loads (docs/specs/project-format.md).
 * The runtime never reads a project folder, only packs, and checks each one here first.
 */
import { isRecordId, type RecordPack } from './records.ts';
import { stateHash } from './stateHash.ts';
import { type CalendarDef, calendarOf } from './time/calendar.ts';

/**
 * The newest format this engine reads and writes. Format 2 (M3.2) adds the project's scripts as
 * JavaScript; format 3 (M3.3) the kits its project lists, scripts or none; format 4 (M4.1) the
 * game's screens, kits and scripts or none; format 5 (M4.2) the game's feedback, the words its
 * beats are said in, screens or none; format 6 (M4.3) its play shell's settings, ui/shell.json,
 * feedback or none; format 7 (M4.4) its assets' credits, from the provenance log, ui or none. A
 * pack is written in the lowest format that holds it,
 * so one without scripts or kits is still format 1, an older engine reads it and its hash stays
 * what it was.
 */
export const PACK_FORMAT = 7;

export interface PackProject {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  /** Format 3 and up: the kits the project lists, in the engine's order (M3.3, D41). */
  readonly kits?: readonly string[];
  /** Format 3 and up, with the time kit: the calendar project.json gives (M3.5, D43). */
  readonly calendar?: CalendarDef;
}

/**
 * A game's screens, theme and feedback as ui/ holds them (M4.1, D51; M4.2, D52), checked by the
 * compiler. The sim never reads them, so the kernel keeps them as JSON: @eb/ui's format says what
 * they are.
 */
export interface PackUi {
  readonly screens: Readonly<Record<string, unknown>>;
  readonly theme?: unknown;
  /** Format 5: ui/feedback.json, its lines as written. */
  readonly feedback?: unknown;
  /** Format 6: ui/shell.json as written (M4.3, D53). */
  readonly shell?: unknown;
}

/**
 * Format 7: one asset's credit, as assets/assets.json logs it (M4.4, D54). The licence's name is
 * packed beside its id, so a credits screen shows it without the compiler's list of licences.
 */
export interface PackCredit {
  /** Its path inside assets/. */
  readonly asset: string;
  readonly licence: string;
  readonly licenceName: string;
  readonly source: string;
  readonly author?: string;
  readonly tool?: string;
}

export interface Pack {
  readonly format: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly project: PackProject;
  readonly records: RecordPack;
  /** Format 2, and 3 and 4 when there are any: each script's JavaScript by id, scripts/game.ts's among them (M3.2, D38). */
  readonly scripts?: Readonly<Record<string, string>>;
  /** Format 4: the screens, at least one, and the theme if there is one. Format 5: the feedback too, screens or none. Format 6: the shell, feedback or none. */
  readonly ui?: PackUi;
  /** Format 7: each asset's credit, by its path, at least one (M4.4). */
  readonly credits?: readonly PackCredit[];
  /** FNV-1a 64 of the canonical JSON of the rest of the pack: the same content gives the same hash anywhere. */
  readonly hash: string;
}

export const packHash = (pack: Omit<Pack, 'hash'>): string =>
  stateHash({
    format: pack.format,
    project: pack.project,
    records: pack.records,
    ...(pack.scripts !== undefined ? { scripts: pack.scripts } : {}),
    ...(pack.ui !== undefined ? { ui: pack.ui } : {}),
    ...(pack.credits !== undefined ? { credits: pack.credits } : {}),
  });

/**
 * A pack of the records, with the scripts when there are any (format 2), the kits when the project
 * lists any (format 3), the screens when there are any (format 4), the feedback when there is
 * any (format 5), the shell's settings when there are any (format 6) and the assets' credits
 * when there are any (format 7).
 */
export function createPack(
  project: PackProject,
  records: RecordPack,
  scripts?: Readonly<Record<string, string>>,
  ui?: PackUi,
  credits?: readonly PackCredit[],
): Pack {
  const scripted = scripts !== undefined && Object.keys(scripts).length > 0;
  // The calendar travels only with the kits: it is the time kit's.
  const { kits, calendar, ...plain } = project;
  const hasKits = kits !== undefined && kits.length > 0;
  const kitted = hasKits ? { ...plain, kits, ...(calendar !== undefined ? { calendar } : {}) } : plain;
  const hasUi =
    ui !== undefined && (Object.keys(ui.screens).length > 0 || ui.feedback !== undefined || ui.shell !== undefined);
  const content =
    credits !== undefined && credits.length > 0
      ? ({
          format: 7,
          project: kitted,
          records,
          ...(scripted ? { scripts } : {}),
          ...(hasUi ? { ui: uiOf(ui as PackUi) } : {}),
          credits: [...credits].sort((a, b) => (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0)),
        } as const)
      : ui?.shell !== undefined
        ? ({ format: 6, project: kitted, records, ...(scripted ? { scripts } : {}), ui: uiOf(ui) } as const)
        : ui?.feedback !== undefined
          ? ({ format: 5, project: kitted, records, ...(scripted ? { scripts } : {}), ui: uiOf(ui) } as const)
          : ui !== undefined && Object.keys(ui.screens).length > 0
            ? ({ format: 4, project: kitted, records, ...(scripted ? { scripts } : {}), ui: uiOf(ui) } as const)
            : hasKits
              ? ({ format: 3, project: kitted, records, ...(scripted ? { scripts } : {}) } as const)
              : scripted
                ? ({ format: 2, project: plain, records, scripts } as const)
                : ({ format: 1, project: plain, records } as const);
  return { ...content, hash: packHash(content) };
}

const uiOf = ({ screens, theme, feedback, shell }: PackUi): PackUi => ({
  screens,
  ...(theme !== undefined ? { theme } : {}),
  ...(feedback !== undefined ? { feedback } : {}),
  ...(shell !== undefined ? { shell } : {}),
});

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
  if (![1, 2, 3, 4, 5, 6, 7].includes(value.format as number)) {
    throw new PackError(
      typeof value.format === 'number' && value.format > PACK_FORMAT
        ? `This pack is format ${value.format}; this engine reads formats 1 to ${PACK_FORMAT}. Update the engine.`
        : `Unknown pack format: ${JSON.stringify(value.format)}`,
    );
  }
  const format = value.format as Pack['format'];
  const fields = [
    'format',
    'project',
    'records',
    ...(format >= 2 ? ['scripts'] : []),
    ...(format >= 4 ? ['ui'] : []),
    ...(format >= 7 ? ['credits'] : []),
  ];
  checkKeys(value, [...fields, 'hash'], 'pack');
  checkProject(value.project, format);
  checkRecords(value.records);
  if (format === 2 || value.scripts !== undefined) checkScripts(value.scripts, format);
  // Format 7 is the format for credits, which a game without screens may carry.
  if (format >= 4 && (format < 7 || value.ui !== undefined)) checkUi(value.ui, format);
  if (format >= 7) checkCredits(value.credits);
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

function checkProject(project: unknown, format: number): void {
  if (!isObject(project)) throw new PackError('The pack has no project');
  checkKeys(project, ['id', 'name', 'version', ...(format >= 3 ? ['kits', 'calendar'] : [])], 'pack project');
  if (!isRecordId(project.id)) throw new PackError('The pack project has no valid id');
  for (const key of ['name', 'version'] as const) {
    if (typeof project[key] !== 'string') throw new PackError(`The pack project has no ${key}`);
  }
  // Formats 4 and 5 list kits only when the project has some; format 3 is the format for kits.
  if (format < 3 || (format >= 4 && project.kits === undefined && project.calendar === undefined)) return;
  const { kits, calendar } = project;
  if (!Array.isArray(kits) || kits.length === 0 || !kits.every(isRecordId)) {
    throw new PackError(
      format === 3 ? 'A format 3 pack lists its kits' : `A format ${format} pack with kits lists them`,
    );
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

const MISSING: Readonly<Record<number, string>> = { 4: 'screens', 5: 'feedback', 6: 'shell', 7: 'screens' };

// The screens', the feedback's and the shell's own shape is the compiler's to check: the kernel only makes sure they are there.
function checkUi(ui: unknown, format: number): void {
  if (!isObject(ui)) throw new PackError(`A format ${format} pack has no ${MISSING[format]}`);
  checkKeys(
    ui,
    ['screens', 'theme', ...(format >= 5 ? ['feedback'] : []), ...(format >= 6 ? ['shell'] : [])],
    'pack ui',
  );
  const { screens, theme, feedback, shell } = ui;
  // Formats 5 and 6 are the formats for feedback and the shell, which play with the fallback where there are no screens.
  if (!isObject(screens) || (format === 4 && Object.keys(screens).length === 0)) {
    throw new PackError(`A format ${format} pack has no screens`);
  }
  const lined = isObject(feedback) && Array.isArray(feedback.lines);
  if ((format === 5 && !lined) || (format >= 6 && feedback !== undefined && !lined)) {
    throw new PackError(`A format ${format} pack has no feedback`);
  }
  if ((format === 6 && !isObject(shell)) || (format >= 7 && shell !== undefined && !isObject(shell))) {
    throw new PackError(`A format ${format} pack has no shell`);
  }
  for (const [id, screen] of Object.entries(screens)) {
    if (!isRecordId(id)) throw new PackError(`"${id}" is not a valid screen name`);
    if (!isObject(screen)) throw new PackError(`The pack's screen "${id}" is not an object`);
  }
  if (theme !== undefined && !isObject(theme)) throw new PackError("The pack's theme is not an object");
}

const CREDIT_TEXT = ['asset', 'licence', 'licenceName', 'source'] as const;

function checkCredits(credits: unknown): void {
  if (!Array.isArray(credits) || credits.length === 0) throw new PackError('A format 7 pack has no credits');
  for (const credit of credits) {
    if (!isObject(credit)) throw new PackError("A pack's credit is not an object");
    checkKeys(credit, [...CREDIT_TEXT, 'author', 'tool'], 'pack credit');
    for (const key of [...CREDIT_TEXT, 'author', 'tool'] as const) {
      const optional = key === 'author' || key === 'tool';
      if (optional && credit[key] === undefined) continue;
      if (typeof credit[key] !== 'string') throw new PackError(`A pack's credit has no ${key}`);
    }
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
