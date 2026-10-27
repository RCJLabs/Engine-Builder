/**
 * Content packs: what the compiler writes and the runtime loads (docs/specs/project-format.md).
 * The runtime never reads a project folder, only packs, and checks each one here first.
 */
import { isRecordId, type RecordPack } from './records.ts';
import { stateHash } from './stateHash.ts';
import { type CalendarDef, calendarOf } from './time/calendar.ts';
import { type ClockDef, MAX_RATE, msPerTickAt } from './time/clock.ts';
import { holdsAny } from './world/containers.ts';
import { asFormat9, asFormat10, hasFlatSpace, type PackWorld, worldProblem } from './world/packWorld.ts';
import { hasTags } from './world/places.ts';

export type { PackMap } from './world/packMaps.ts';
export type { PackWorld } from './world/packWorld.ts';

/**
 * The newest format this engine reads and writes. Format 2 (M3.2) adds the project's scripts as
 * JavaScript; format 3 (M3.3) the kits its project lists, scripts or none; format 4 (M4.1) the
 * game's screens, kits and scripts or none; format 5 (M4.2) the game's feedback, the words its
 * beats are said in, screens or none; format 6 (M4.3) its play shell's settings, ui/shell.json,
 * feedback or none; format 7 (M4.4) its assets' credits, from the provenance log, ui or none;
 * format 8 (M4.8) the audio files its music names, as base64, credits or none; format 9 (M5.8) its
 * spaces and what they draw from, audio or none; format 10 (M5.9) its uses, spawn points and start;
 * format 11 (M6.2) its navmeshes and where each actor is placed; format 12 (M6.3) the clock that runs
 * while its spaces are walked, navmeshes or none; format 13 (M6.4) project.json's fighting, the player
 * and the combat record a walked space's fights read, clock or none; format 14 (M6.6) the spaces' maps;
 * format 15 (M6.7) the tags of the spaces and their objects, maps or none; format 16 (M6.8) what a use holds;
 * format 17 (M7.1) a 2D space, holding or none; format 18 (M7.2) a tilemap; format 19 (M7.3) a building,
 * tilemap or none.
 * A pack is written in the lowest format that holds it,
 * so one without scripts or kits is still format 1, an older engine reads it and its hash stays
 * what it was.
 */
export const PACK_FORMAT = 19;

export interface PackProject {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  /** Format 3 and up: the kits the project lists, in the engine's order (M3.3, D41). */
  readonly kits?: readonly string[];
  /** Format 3 and up, with the time kit: the calendar project.json gives (M3.5, D43). */
  readonly calendar?: CalendarDef;
  /** Format 12, with the time kit and spaces: the clock as it runs while walking, never one stopped (M6.3, D75). */
  readonly clock?: ClockDef;
  /** Format 13, with the fighting kit and spaces: who the player is and the combat record a hit reads (M6.4, D76). */
  readonly fighting?: PackFighting;
}

/** project.json's `fighting`: the actor who is the player in a walked space, and the combat record whose stats a hit reads. */
export interface PackFighting {
  readonly player: string;
  readonly combat: string;
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
  readonly format: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19;
  readonly project: PackProject;
  readonly records: RecordPack;
  /** Format 2, and 3 and 4 when there are any: each script's JavaScript by id, scripts/game.ts's among them (M3.2, D38). */
  readonly scripts?: Readonly<Record<string, string>>;
  /** Format 4: the screens, at least one, and the theme if there is one. Format 5: the feedback too, screens or none. Format 6: the shell, feedback or none. */
  readonly ui?: PackUi;
  /** Format 7: each asset's credit, by its path, at least one (M4.4). Format 8: credits or none. */
  readonly credits?: readonly PackCredit[];
  /** Format 8: the audio files the music records name, base64 by their path inside assets/, at least one (M4.8). Format 9: audio or none. */
  readonly audio?: Readonly<Record<string, string>>;
  /** Format 9: the spaces walked in play (M5.8). Format 10: their uses, spawn points and start too (M5.9). */
  readonly world?: PackWorld;
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
    ...(pack.audio !== undefined ? { audio: pack.audio } : {}),
    ...(pack.world !== undefined ? { world: pack.world } : {}),
  });

/**
 * A pack of the records, with the scripts when there are any (format 2), the kits when the project
 * lists any (format 3), the screens when there are any (format 4), the feedback when there is
 * any (format 5), the shell's settings when there are any (format 6), the assets' credits
 * when there are any (format 7), the music's files (format 8) and the spaces (format 9), with
 * their uses, spawn points and start (format 10), their navmeshes (format 11), the clock (format 12),
 * the fighting (format 13), the maps (format 14), the tags (format 15), what uses hold (format 16)
 * a 2D space (format 17), a tilemap (format 18) and a building (format 19).
 */
export function createPack(
  project: PackProject,
  records: RecordPack,
  scripts?: Readonly<Record<string, string>>,
  ui?: PackUi,
  credits?: readonly PackCredit[],
  audio?: Readonly<Record<string, string>>,
  world?: PackWorld,
): Pack {
  const scripted = scripts !== undefined && Object.keys(scripts).length > 0;
  // The calendar travels only with the kits: it is the time kit's. So does the clock, which only a
  // walk runs, and the fighting, which only a walk fights.
  const { kits, calendar, clock, fighting, ...plain } = project;
  const hasKits = kits !== undefined && kits.length > 0;
  const walked = world !== undefined && Object.keys(world.spaces).length > 0;
  const clocked = walked && clock !== undefined && hasKits && kits.includes('time');
  const fought = walked && fighting !== undefined && hasKits && kits.includes('fighting');
  const mapped = walked && world.maps !== undefined && Object.keys(world.maps).length > 0;
  const tagged = walked && hasTags(world.places);
  const held = walked && holdsAny(world.uses);
  const flat = walked && hasFlatSpace(world.spaces);
  const tiled = walked && world.tiles !== undefined && Object.keys(world.tiles).length > 0;
  const built = walked && world.buildings !== undefined && Object.keys(world.buildings).length > 0;
  const kitted = hasKits
    ? {
        ...plain,
        kits,
        ...(calendar !== undefined ? { calendar } : {}),
        ...(clocked ? { clock } : {}),
        ...(fought ? { fighting } : {}),
      }
    : plain;
  const screened = ui !== undefined && Object.keys(ui.screens).length > 0;
  const hasUi = screened || ui?.feedback !== undefined || ui?.shell !== undefined;
  const credited = credits !== undefined && credits.length > 0;
  const sounded = audio !== undefined && Object.keys(audio).length > 0;
  const later = clocked || fought || mapped || tagged || held || flat || tiled || built;
  const ten = walked && !later ? asFormat10(withoutMaps(world)) : undefined;
  const nine = ten !== undefined ? asFormat9(ten) : undefined;
  // The lowest format that holds it: each format adds one thing to the one before.
  const format = walked
    ? built
      ? 19
      : tiled
        ? 18
        : flat
          ? 17
          : held
            ? 16
            : tagged
              ? 15
              : mapped
                ? 14
                : fought
                  ? 13
                  : clocked
                    ? 12
                    : ten === undefined
                      ? 11
                      : nine === undefined
                        ? 10
                        : 9
    : sounded
      ? 8
      : credited
        ? 7
        : ui?.shell !== undefined
          ? 6
          : ui?.feedback !== undefined
            ? 5
            : screened
              ? 4
              : hasKits
                ? 3
                : scripted
                  ? 2
                  : 1;
  const content = {
    format,
    project: kitted,
    records,
    ...(scripted ? { scripts } : {}),
    ...(hasUi ? { ui: uiOf(ui as PackUi) } : {}),
    ...(credited ? { credits: [...credits].sort((a, b) => (a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0)) } : {}),
    ...(sounded ? { audio } : {}),
    ...(walked ? { world: worldIn(format, nine ?? ten ?? world) } : {}),
  } as const;
  return { ...content, hash: packHash(content) };
}

// Formats 12 to 19 keep format 11's navmeshes and actors, none or not, so a clocked, fought, mapped,
// tagged or holding pack has one world shape; format 14 and up keep the maps, and 15 and up the places,
// every space untagged for a world given none.
function worldIn(format: number, world: PackWorld): PackWorld {
  // Format 19 keeps the buildings, and 18 and up the tilemaps; an older format, which can't hold one, has none.
  if (format < 19 && world.buildings !== undefined) {
    const { buildings, ...unbuilt } = world;
    return worldIn(format, unbuilt);
  }
  if (format < 18 && world.tiles !== undefined) {
    const { tiles, ...untiled } = world;
    return worldIn(format, untiled);
  }
  const { places, ...placeless } = world;
  const kept =
    format >= 15 ? { ...world, places: places ?? untagged(world) } : format === 14 ? placeless : withoutMaps(placeless);
  return format >= 12 ? { ...kept, navmeshes: kept.navmeshes ?? {}, actors: kept.actors ?? {} } : kept;
}

const untagged = (world: PackWorld) => ({
  spaces: Object.fromEntries(
    Object.keys(world.spaces)
      .sort()
      .map((id) => [id, { tags: [] }]),
  ),
  objects: {},
});

function withoutMaps(world: PackWorld): PackWorld {
  const { maps, ...rest } = world;
  return rest;
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
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].includes(value.format as number)) {
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
    ...(format >= 8 ? ['audio'] : []),
    ...(format >= 9 ? ['world'] : []),
  ];
  checkKeys(value, [...fields, 'hash'], 'pack');
  checkProject(value.project, format);
  checkRecords(value.records);
  if (format === 2 || value.scripts !== undefined) checkScripts(value.scripts, format);
  // Format 7 is the format for credits, which a game without screens may carry.
  if (format >= 4 && (format < 7 || value.ui !== undefined)) checkUi(value.ui, format);
  // Format 8 is the format for audio, which a game without credits may carry.
  if (format === 7 || (format >= 8 && value.credits !== undefined)) checkCredits(value.credits);
  // Format 9 is the format for spaces, which a game without music may carry.
  if (format === 8 || (format >= 9 && value.audio !== undefined)) checkAudio(value.audio);
  const world = format >= 9 ? worldProblem(value.world, format) : undefined;
  if (world !== undefined) throw new PackError(world);
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
  const kitted =
    format >= 3 ? ['kits', 'calendar', ...(format >= 12 ? ['clock'] : []), ...(format >= 13 ? ['fighting'] : [])] : [];
  checkKeys(project, ['id', 'name', 'version', ...kitted], 'pack project');
  if (!isRecordId(project.id)) throw new PackError('The pack project has no valid id');
  for (const key of ['name', 'version'] as const) {
    if (typeof project[key] !== 'string') throw new PackError(`The pack project has no ${key}`);
  }
  // Formats 4 and 5 list kits only when the project has some; format 3 is the format for kits.
  if (format === 12 && project.clock === undefined) throw new PackError('A format 12 pack has a clock');
  if (format === 13 && project.fighting === undefined) throw new PackError('A format 13 pack has its fighting');
  if (format < 3 || (format >= 4 && project.kits === undefined && project.calendar === undefined)) return;
  const { kits, calendar, clock, fighting } = project;
  if (!Array.isArray(kits) || kits.length === 0 || !kits.every(isRecordId)) {
    throw new PackError(
      format === 3 ? 'A format 3 pack lists its kits' : `A format ${format} pack with kits lists them`,
    );
  }
  if (fighting !== undefined) checkFighting(fighting, kits);
  if (calendar === undefined && clock === undefined) return;
  if (!kits.includes('time')) {
    throw new PackError(
      `A pack's ${calendar !== undefined ? 'calendar' : 'clock'} is the time kit's, which it doesn't list`,
    );
  }
  if (calendar !== undefined) {
    try {
      calendarOf(calendar as CalendarDef);
    } catch (error) {
      throw new PackError(`The pack's calendar: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (clock !== undefined) checkClock(clock, (calendar as CalendarDef | undefined)?.ticksPerDay ?? 1);
}

/** Format 13's fighting: the fighting kit's, an actor and a combat record by id (E082 keeps any other from a project). */
function checkFighting(fighting: unknown, kits: readonly unknown[]): void {
  if (!kits.includes('fighting')) throw new PackError("A pack's fighting is the fighting kit's, which it doesn't list");
  if (!isObject(fighting)) throw new PackError("The pack's fighting is not an object");
  checkKeys(fighting, ['player', 'combat'], 'pack fighting');
  if (!isRecordId(fighting.player) || !isRecordId(fighting.combat))
    throw new PackError("The pack's fighting names its player and its combat record by id");
}

/** Format 12's clock: a rate that runs, its ticks whole real milliseconds (E080 keeps any other from a project). */
function checkClock(clock: unknown, ticksPerDay: number): void {
  if (!isObject(clock)) throw new PackError("The pack's clock is not an object");
  checkKeys(clock, ['rate'], 'pack clock');
  const { rate } = clock;
  if (typeof rate !== 'number' || !Number.isSafeInteger(rate) || rate < 1 || rate > MAX_RATE) {
    throw new PackError(`The pack's clock runs at a whole number of game seconds a second, from 1 to ${MAX_RATE}`);
  }
  if (msPerTickAt(ticksPerDay, rate) === undefined) {
    throw new PackError(`At ${rate}x, the pack's calendar's ticks aren't whole real milliseconds`);
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

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function checkAudio(audio: unknown): void {
  if (!isObject(audio) || Object.keys(audio).length === 0) throw new PackError('A format 8 pack has no audio');
  for (const [path, data] of Object.entries(audio)) {
    if (typeof data !== 'string' || !BASE64.test(data)) throw new PackError(`The pack's audio "${path}" is not base64`);
  }
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
