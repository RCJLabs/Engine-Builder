/**
 * A game played from its pack (M4.1, D51): the records, the compiled scripts and the kits the
 * project lists, as the Project panel's Export game writes them. The editor's Play panel compiles
 * the open project to a pack and plays it here too, so it plays what an export would. The scripts
 * run where this runs, which must be a worker its caller has locked down (the editor's lockDown.ts).
 * A pack is opened once; its games are started from a seed or loaded from a save (M4.3).
 */
import {
  createGame,
  createRecordStore,
  debugModule,
  debugStepsOf,
  type LoadReport,
  loadSave,
  type Pack,
  PackError,
  readPack,
  type SaveFile,
  type SaveProblem,
  verifySaveFile,
  worldDataOf,
} from '@eb/core';
import { loadProjectGame } from '@eb/script';
import { audioConditions } from '../audio/mix.ts';
import type { AudioPack } from '../format/audio.ts';
import { wantsOf } from '../format/bindings.ts';
import type { Feedback } from '../format/feedback.ts';
import type { Screen } from '../format/screen.ts';
import type { ShellFile } from '../format/shell.ts';
import type { Theme } from '../format/theme.ts';
import { audioOf } from './audioPack.ts';
import { type Play, type PlaySetup, resumePlay, startPlay } from './play.ts';

/** A pack read and its game loaded, ready to start or load games of. */
export interface Opened {
  readonly pack: Pack;
  readonly setup: PlaySetup;
  readonly screens: Readonly<Record<string, Screen>>;
  readonly theme: Theme | undefined;
  readonly shell: ShellFile | undefined;
  readonly name: string;
  /** Its sounds, ambience and music, and the files its music names (M4.8). */
  readonly audio: AudioPack;
  /** Its game has the debug step (M4.9, D59): the editor's games, never the player page's. */
  readonly debug: boolean;
}

export type OpenResult =
  | { readonly ok: true; readonly opened: Opened }
  | { readonly ok: false; readonly message: string };

export interface OpenOptions {
  /** Adds the debug module after the game's own (M4.9): only the editor's Play worker asks for it. */
  readonly debug?: boolean;
}

/** A pack as it came from a file, checked by readPack, and its game loaded. */
export function openPack(value: unknown, options: OpenOptions = {}): OpenResult {
  const debug = options.debug === true;
  let pack: Pack;
  try {
    pack = readPack(value);
  } catch (error) {
    if (error instanceof PackError) {
      return { ok: false, message: `This isn’t a game file Engine-Builder can play: ${error.message}.` };
    }
    throw error;
  }
  const scripts = pack.scripts ?? {};
  if (!('game' in scripts)) {
    return { ok: false, message: 'This game has no scripts/game.ts, so there is nothing to play' };
  }
  const kits = pack.project.kits ?? [];
  const loaded = loadProjectGame(
    new Map(Object.entries(scripts)),
    kits,
    pack.project.calendar,
    pack.world ? worldDataOf(pack.world) : undefined,
    pack.project.clock,
    pack.project.fighting,
  );
  if (!loaded.ok) return { ok: false, message: `The game didn’t load: ${loaded.problem.message}` };
  const { modules, start } = loaded.game;
  const screens = (pack.ui?.screens ?? {}) as Readonly<Record<string, Screen>>;
  const shell = pack.ui?.shell as ShellFile | undefined;
  const feedback = pack.ui?.feedback as Feedback | undefined;
  // Last, so the game's own modules start and draw exactly as they do without it.
  const game = createGame({ modules: debug ? [...modules, debugModule()] : modules, start });
  const audio = audioOf(pack, game.catalog());
  // The shell's slot line is filled from the view as each save is made, so its facts are read too.
  const screenWants = wantsOf(Object.values(screens), shell?.['slot-line'] === undefined ? [] : [shell['slot-line']]);
  // The audio's conditions are read after each step as a screen's are: the page's mix follows them.
  const wants = {
    ...screenWants,
    conditions: [...new Set([...screenWants.conditions, ...audioConditions(audio)])],
  };
  const setup: PlaySetup = {
    game,
    sim: { content: createRecordStore(pack.records) },
    kits,
    wants,
    ...(feedback ? { feedback } : {}),
    ...(pack.credits ? { credits: pack.credits } : {}),
    ...(pack.project.fighting && pack.world ? { fighting: pack.project.fighting } : {}),
  };
  const theme = pack.ui?.theme as Theme | undefined;
  return { ok: true, opened: { pack, setup, screens, theme, shell, name: pack.project.name, audio, debug } };
}

export type Loaded =
  | {
      readonly ok: true;
      readonly play: Play;
      readonly screens: Readonly<Record<string, Screen>>;
      readonly theme: Theme | undefined;
      readonly name: string;
    }
  | { readonly ok: false; readonly message: string };

/** A pack opened and a game of it started with this seed. */
export function playPack(value: unknown, seed: string): Loaded {
  const opened = openPack(value);
  if (!opened.ok) return opened;
  const { setup, screens, theme, name } = opened.opened;
  return { ok: true, play: startPlay(setup, seed), screens, theme, name };
}

export type Resumed =
  | { readonly ok: true; readonly play: Play; readonly file: SaveFile; readonly report: LoadReport }
  | { readonly ok: false; readonly problem: SaveProblem | 'crashed' | 'debug'; readonly message: string };

/**
 * A save's text loaded into a game of the opened pack, as `@eb/platform`'s `loadWith` asks: what
 * won't parse is damaged, and a game that throws while it replays has crashed. A game without the
 * debug step refuses a save that holds one (D59), before replaying it: the replay would skip those
 * steps and reach a state the player never had.
 */
export function resumeFrom(opened: Opened, raw: string): Resumed {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, problem: 'damaged', message: 'The save is not JSON' };
  }
  const { game, sim } = opened.setup;
  const id = opened.pack.project.id;
  if (!opened.debug) {
    const verified = verifySaveFile(parsed, id);
    if (verified.ok && debugStepsOf(verified.file) > 0) return DEBUGGED;
  }
  try {
    const result = loadSave(game, parsed, sim, { game: id, build: opened.pack.hash });
    if (!result.ok) return result;
    return { ok: true, play: resumePlay(opened.setup, result.state), file: result.file, report: result.report };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, problem: 'crashed', message: `The game failed while loading the save: ${message}` };
  }
}

const DEBUGGED = {
  ok: false,
  problem: 'debug',
  message: 'The editor’s debug tools changed this game, so it plays only in the editor',
} as const;
