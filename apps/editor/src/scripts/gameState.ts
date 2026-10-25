/**
 * The open project's game as the editor knows it (M3.2, D38): its scripts, their problems, and
 * what scripts/game.ts declares once it has run. The script worker reads them again after each
 * change under scripts/; a project with no scripts never starts the worker.
 */
import { classifySpaceFile, gameOptions, MANIFEST_FILE, type ProjectSource, readFiles, SPACES_DIR } from '@eb/compiler';
import { type Diagnostic, severityOf, type ValidateOptions } from '@eb/schema';
import { classifyScript, GAME_SCRIPT, type GameCatalog, SCRIPTS_DIR, scriptPath } from '@eb/script';
import type { CheckResult, SentFile } from './protocol.ts';
import { CHECK_MS, ScriptTimeout, type ScriptWorker } from './scriptWorker.ts';

export type GameStatus =
  /** No scripts at all. */
  | 'none'
  /** Scripts, but no scripts/game.ts to run them. */
  | 'no-game'
  /** game.ts hasn't run: the project came from a zip or a folder, and running it hasn't been allowed. */
  | 'untrusted'
  /** A script game.ts reaches has an error, so nothing ran. */
  | 'broken'
  /** It ran and failed (E031, E032), or never finished. */
  | 'failed'
  | 'loaded';

export interface GameState {
  /** Every script by id, sorted. */
  readonly ids: readonly string[];
  readonly status: GameStatus;
  /** E028 to E032, W111 and W112, sorted as the compiler sorts. */
  readonly problems: readonly Diagnostic[];
  /** What the game declares, once it has run and loaded. */
  readonly catalog: GameCatalog | null;
}

export const NO_SCRIPTS: GameState = { ids: [], status: 'none', problems: [], catalog: null };

export const isScriptPath = (path: string): boolean => path === SCRIPTS_DIR || path.startsWith(`${SCRIPTS_DIR}/`);

/** The project's space files (M5.8): with any, the world module joins its game. */
const spaceFiles = async (source: ProjectSource): Promise<string[]> =>
  (await source.files(SPACES_DIR)).filter((path) => classifySpaceFile(path).kind === 'space');

export const hasSpaces = async (source: ProjectSource): Promise<boolean> => (await spaceFiles(source)).length > 0;

/**
 * Every file under scripts/, as the worker reads them, and project.json, whose kits join the game
 * its scripts make (M3.3, D41); and each space file's name, empty, since whether there are any is
 * all the check reads of them (M5.8).
 */
export async function scriptFiles(source: ProjectSource): Promise<SentFile[]> {
  const read = await readFiles(source, [MANIFEST_FILE, ...(await source.files(SCRIPTS_DIR))]);
  const spaces = (await spaceFiles(source)).map((path): SentFile => [path, new Uint8Array()]);
  return [...read, ...spaces];
}

export function stateOf(result: CheckResult, run: boolean): GameState {
  const { ids, hasGame, diagnostics: problems, ran, game } = result;
  const status: GameStatus =
    ids.length === 0
      ? 'none'
      : !hasGame
        ? 'no-game'
        : !run
          ? 'untrusted'
          : !ran
            ? 'broken'
            : game
              ? 'loaded'
              : 'failed';
  return { ids, status, problems, catalog: game };
}

/** The game's state as the scripts are now; `run` when the project is trusted. */
export async function readGameState(source: ProjectSource, worker: ScriptWorker, run: boolean): Promise<GameState> {
  const files = await scriptFiles(source);
  if (!files.some(([path]) => isScriptPath(path))) return NO_SCRIPTS;
  try {
    return stateOf(await worker.check(files, run), run);
  } catch (error) {
    if (!(error instanceof ScriptTimeout)) throw error;
    // The worker is stopped, and what it found with it: the ids come from the paths, as the compiler takes them.
    const ids = files
      .map(([path]) => classifyScript(path))
      .flatMap((file) => (file.kind === 'script' ? [file.id] : []))
      .sort();
    const problem: Diagnostic = {
      code: 'E031',
      severity: severityOf('E031'),
      message: `It didn’t finish loading within ${CHECK_MS / 1000} seconds: does a loop never end?`,
      file: scriptPath(GAME_SCRIPT),
      path: '',
    };
    return { ids, status: 'failed', problems: [problem], catalog: null };
  }
}

/** What the game gives validation: its facts, events and effects, all plain data. */
export type GameChecks = Pick<ValidateOptions, 'facts' | 'events' | 'effectNames'>;

/** What records are checked against: the game's facts, events and effects once it has loaded, else the engine's (D36). */
export const gameChecks = (game: GameState): GameChecks => (game.catalog ? gameOptions(game.catalog) : {});
