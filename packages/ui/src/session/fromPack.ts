/**
 * A game played from its pack (M4.1, D51): the records, the compiled scripts and the kits the
 * project lists, as the Project panel's Export game writes them. The editor's Play panel compiles
 * the open project to a pack and plays it here too, so it plays what an export would. The scripts
 * run where this runs, which must be a worker its caller has locked down (the editor's lockDown.ts).
 */
import { createGame, createRecordStore, type Pack, PackError, readPack } from '@eb/core';
import { loadProjectGame } from '@eb/script';
import { wantsOf } from '../format/bindings.ts';
import type { Feedback } from '../format/feedback.ts';
import type { Screen } from '../format/screen.ts';
import type { Theme } from '../format/theme.ts';
import { type Play, startPlay } from './play.ts';

export type Loaded =
  | {
      readonly ok: true;
      readonly play: Play;
      readonly screens: Readonly<Record<string, Screen>>;
      readonly theme: Theme | undefined;
      readonly name: string;
    }
  | { readonly ok: false; readonly message: string };

/** A pack as it came from a file, checked by readPack, then its game started with this seed. */
export function playPack(value: unknown, seed: string): Loaded {
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
  const loaded = loadProjectGame(new Map(Object.entries(scripts)), kits, pack.project.calendar);
  if (!loaded.ok) return { ok: false, message: `The game didn’t load: ${loaded.problem.message}` };
  const { modules, start } = loaded.game;
  const screens = (pack.ui?.screens ?? {}) as Readonly<Record<string, Screen>>;
  const game = createGame({ modules, start });
  const sim = { content: createRecordStore(pack.records) };
  const feedback = pack.ui?.feedback as Feedback | undefined;
  const wants = wantsOf(Object.values(screens));
  const play = startPlay({ game, sim, kits, wants, ...(feedback ? { feedback } : {}) }, seed);
  return { ok: true, play, screens, theme: pack.ui?.theme as Theme | undefined, name: pack.project.name };
}
