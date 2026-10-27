/**
 * The open project's game as the editor knows it (M3.2, D38): its scripts, their problems, and
 * what scripts/game.ts declares once it has run. The script worker reads them again after each
 * change under scripts/; a project with no scripts never starts the worker.
 */
import {
  classifySpaceFile,
  gameOptions,
  MANIFEST_FILE,
  PREFABS_DIR,
  type ProjectSource,
  readFiles,
  SPACES_DIR,
} from '@eb/compiler';
import { type Diagnostic, severityOf, type ValidateOptions } from '@eb/schema';
import { classifyScript, GAME_SCRIPT, type GameCatalog, SCRIPTS_DIR, STAGES_DIR, scriptPath } from '@eb/script';
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
  /** E028 to E032, W111 and W112, sorted as the compiler sorts; the stages' too, E095 and W159 (M7.4). */
  readonly problems: readonly Diagnostic[];
  /** Every stage file by its path under stages/ without `.ts`, sorted (M7.4). */
  readonly stages: readonly string[];
  /** What the game declares, once it has run and loaded. */
  readonly catalog: GameCatalog | null;
}

export const NO_SCRIPTS: GameState = { ids: [], status: 'none', problems: [], catalog: null, stages: [] };

export const isScriptPath = (path: string): boolean => path === SCRIPTS_DIR || path.startsWith(`${SCRIPTS_DIR}/`);

/** A file under stages/ (M7.4), which the script worker checks with the scripts. */
export const isStagePath = (path: string): boolean => path === STAGES_DIR || path.startsWith(`${STAGES_DIR}/`);

/** The project's space files (M5.8): with any, the world module joins its game. */
const spaceFiles = async (source: ProjectSource): Promise<string[]> =>
  (await source.files(SPACES_DIR)).filter((path) => classifySpaceFile(path).kind === 'space');

export const hasSpaces = async (source: ProjectSource): Promise<boolean> => (await spaceFiles(source)).length > 0;

/** Which stage each space names (M7.4), in a line, so a change to one checks the stages again. */
export async function stagesNamed(source: ProjectSource): Promise<string> {
  const named: string[] = [];
  for (const path of await spaceFiles(source)) {
    const bytes = await source.read(path);
    const text = bytes === undefined ? '' : new TextDecoder().decode(bytes);
    if (!text.includes('"stage"')) continue;
    try {
      const stage = (JSON.parse(text) as { stage?: unknown }).stage;
      if (typeof stage === 'string') named.push(`${path}=${stage}`);
    } catch {
      // A space that isn't JSON is E007's, and names no stage.
    }
  }
  return named.join('\n');
}

/**
 * A space's or a prefab's bytes when an interact in it holds items (M6.8), or a space names a stage
 * (M7.4), else none.
 */
async function holding(source: ProjectSource, path: string): Promise<Uint8Array> {
  const bytes = await source.read(path);
  const text = bytes === undefined ? '' : new TextDecoder().decode(bytes);
  return bytes !== undefined && (text.includes('"holds"') || text.includes('"stage"')) ? bytes : new Uint8Array();
}

/**
 * Every file under scripts/, as the worker reads them, and project.json, whose kits join the game
 * its scripts make (M3.3, D41); and each space file's name, empty, since whether there are any is
 * all the check reads of them (M5.8), but whole, as a prefab is, when it holds items: its game then
 * has the container mode (M6.8).
 */
export async function scriptFiles(source: ProjectSource): Promise<SentFile[]> {
  const read = await readFiles(source, [
    MANIFEST_FILE,
    ...(await source.files(SCRIPTS_DIR)),
    ...(await source.files(STAGES_DIR)),
  ]);
  const spaces = await Promise.all(
    (await spaceFiles(source)).map(async (path): Promise<SentFile> => [path, await holding(source, path)]),
  );
  const prefabs = (await source.files(PREFABS_DIR)).filter((path) => classifySpaceFile(path).kind === 'prefab');
  const held = await Promise.all(prefabs.map(async (path): Promise<SentFile> => [path, await holding(source, path)]));
  return [...read, ...spaces, ...held.filter(([, bytes]) => bytes.length > 0)];
}

export function stateOf(result: CheckResult, run: boolean): GameState {
  const { ids, hasGame, diagnostics: problems, ran, game, stages } = result;
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
  return { ids, status, problems, catalog: game, stages };
}

/** The game's state as the scripts are now; `run` when the project is trusted. */
export async function readGameState(source: ProjectSource, worker: ScriptWorker, run: boolean): Promise<GameState> {
  const files = await scriptFiles(source);
  if (!files.some(([path]) => isScriptPath(path) || isStagePath(path))) return NO_SCRIPTS;
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
    return { ids, status: 'failed', problems: [problem], catalog: null, stages: [] };
  }
}

/** What the game gives validation: its facts, events and effects, all plain data. */
export type GameChecks = Pick<ValidateOptions, 'facts' | 'events' | 'effectNames'>;

/** What records are checked against: the game's facts, events and effects once it has loaded, else the engine's (D36). */
export const gameChecks = (game: GameState): GameChecks => (game.catalog ? gameOptions(game.catalog) : {});
