/**
 * Save files (docs/specs/saves.md): a snapshot of the game and the actions since it, beside what
 * the stage knows about the save. The file is JSON, and its checksum tells a damaged one.
 */
import { CanonicalError } from '../canonical.ts';
import { isRecordId } from '../records.ts';
import type { Action, GameState } from '../sim/types.ts';
import { stateHash } from '../stateHash.ts';

/**
 * The save file's format, which also covers the kernel's own state. Bump it when either changes
 * shape, with a migration and a fixture saved by the old format that must still load.
 */
export const SAVE_VERSION = 1;

/** What the stage knows about a save, kept beside the game's state rather than in it. */
export interface SaveInfo {
  /** The game's project id. */
  readonly game: string;
  /** The edition (a demo, the full game), whose saves are kept apart. */
  readonly edition: string;
  /** The build that wrote it. A replay is held to the saved state only on the same build. */
  readonly build: string;
  /** Wall-clock milliseconds when it was written: for slot lists, and for offline time on load. */
  readonly savedAt: number;
  /** What a slot list shows, as JSON: the day, the place, the playtime. */
  readonly summary?: Readonly<Record<string, unknown>>;
}

export interface SaveFile extends SaveInfo {
  readonly format: number;
  /** The state the log starts from. */
  readonly snapshot: GameState;
  /** The actions accepted since the snapshot, oldest first. */
  readonly log: readonly Action[];
  /** stateHash of the state the log reaches: the game as it was saved. */
  readonly hash: string;
  /** FNV-1a 64 of the canonical JSON of everything else in the file. */
  readonly check: string;
}

export type SaveProblem = 'damaged' | 'newer' | 'other-game' | 'cannot-migrate' | 'replay-differs';

export type Verified =
  | { readonly ok: true; readonly file: SaveFile }
  | { readonly ok: false; readonly problem: SaveProblem; readonly message: string };

/** A save of `run`: the snapshot and log it can be replayed from, and the state they reach. */
export function createSaveFile(
  run: { readonly snapshot: GameState; readonly log: readonly Action[]; readonly state: GameState },
  info: SaveInfo,
): SaveFile {
  const { game, edition, build, savedAt, summary } = info;
  const body = {
    format: SAVE_VERSION,
    game,
    edition,
    build,
    savedAt,
    ...(summary === undefined ? {} : { summary }),
    snapshot: run.snapshot,
    log: [...run.log],
    hash: stateHash(run.state),
  };
  return { ...body, check: stateHash(body) };
}

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A save file's format, checksum and shape, before anything in it is migrated or replayed. A
 * file from a newer format is "newer" rather than "damaged": a newer game can read it.
 */
export function verifySaveFile(raw: unknown, game?: string): Verified {
  const fail = (problem: SaveProblem, message: string): Verified => ({ ok: false, problem, message });
  if (!isObject(raw) || !Number.isSafeInteger(raw.format) || (raw.format as number) < 1) {
    return fail('damaged', 'Not a save file');
  }
  if ((raw.format as number) > SAVE_VERSION) {
    return fail('newer', `The save is format ${raw.format}; this game reads formats up to ${SAVE_VERSION}`);
  }
  const { check, ...body } = raw;
  try {
    if (check !== stateHash(body)) return fail('damaged', "The save's checksum doesn't match its contents");
  } catch (error) {
    if (error instanceof CanonicalError)
      return fail('damaged', `The save holds something JSON can't: ${error.message}`);
    throw error;
  }
  const problem = shapeProblem(raw);
  if (problem) return fail('damaged', problem);
  if (game !== undefined && raw.game !== game)
    return fail('other-game', `The save is from "${raw.game}", not "${game}"`);
  return { ok: true, file: raw as unknown as SaveFile };
}

function shapeProblem(raw: Readonly<Record<string, unknown>>): string | undefined {
  if (!isRecordId(raw.game) || !isRecordId(raw.edition)) return 'The save names no game or edition';
  if (typeof raw.build !== 'string') return 'The save names no build';
  if (typeof raw.savedAt !== 'number' || !Number.isFinite(raw.savedAt)) return 'The save has no time';
  if (raw.summary !== undefined && !isObject(raw.summary)) return "The save's summary is not an object";
  if (!isObject(raw.snapshot)) return 'The save has no snapshot';
  if (!Array.isArray(raw.log) || !raw.log.every((a) => isObject(a) && typeof a.type === 'string')) {
    return "The save's log is not a list of actions";
  }
  if (typeof raw.hash !== 'string') return 'The save has no hash';
  return undefined;
}
