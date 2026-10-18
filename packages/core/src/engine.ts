/**
 * The engine's own modules (D36): what the editor and `eb validate` know without a game's code.
 * A game lists the ones it uses among its modules; its own facts, events and effects join them
 * when `--types` gives them. The time module isn't here: it needs the game's calendar.
 */
import { logicModule } from './logic/module.ts';
import { flagModule } from './sheets/flags.ts';
import { sheetModule } from './sheets/sheets.ts';
import type { Module } from './sim/module.ts';

export const engineModules: readonly Module[] = Object.freeze([logicModule, flagModule, sheetModule]);
