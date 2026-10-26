/**
 * A project's game from its scripts' JavaScript (D38): game.ts run, its exports read, the game
 * made once, and its catalogue taken. What goes wrong comes back as one problem, at a script and
 * line when it can be said.
 */
import type { CalendarDef, ClockDef, PackFighting, WorldData } from '@eb/core';
import { type GameCatalog, gameCatalog } from './catalog.ts';
import { GAME_SCRIPT } from './files.ts';
import { type GameProblem, type ProjectGame, readGame } from './game.ts';
import { asScriptError, loadScripts } from './load.ts';

export type LoadedGame =
  | { readonly ok: true; readonly game: ProjectGame; readonly catalog: GameCatalog }
  | { readonly ok: false; readonly problem: GameProblem };

/**
 * `compiled` holds each script's JavaScript by id; scripts/game.ts must be among them. The time kit
 * keeps `calendar`; the world module, on when the project has spaces, keeps `world`'s zones and uses (M5.8, M5.9);
 * the fighting kit, `fighting` (M6.4).
 */
export function loadProjectGame(
  compiled: ReadonlyMap<string, string>,
  kits: readonly string[] = [],
  calendar?: CalendarDef,
  world?: WorldData,
  clock?: ClockDef,
  fighting?: PackFighting,
): LoadedGame {
  let exports: Readonly<Record<string, unknown>>;
  try {
    exports = loadScripts(compiled, GAME_SCRIPT);
  } catch (error) {
    const { message, script, line } = asScriptError(error);
    return {
      ok: false,
      problem: {
        code: 'E031',
        message: `It threw as it loaded: ${message}`,
        ...(script !== undefined ? { script } : {}),
        ...(line !== undefined ? { line } : {}),
      },
    };
  }
  const read = readGame(exports, kits, calendar, world, clock, fighting);
  if (!read.ok) return read;
  return { ok: true, game: read.game, catalog: gameCatalog(read.game) };
}
