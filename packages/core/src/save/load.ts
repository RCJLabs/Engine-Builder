import { ActionError, type Game } from '../sim/game.ts';
import { MigrationError, type MigrationReport } from '../sim/migrate.ts';
import type { GameState, SimContext } from '../sim/types.ts';
import { stateHash } from '../stateHash.ts';
import { type SaveFile, type SaveProblem, verifySaveFile } from './file.ts';

export interface LoadOptions {
  /** The game's project id: a save from another game is refused. */
  readonly game: string;
  /** This build. Only a save from the same build, with nothing migrated, is held to its hash. */
  readonly build: string;
}

export interface LoadReport extends MigrationReport {
  /** Logged actions replayed. */
  readonly replayed: number;
  /** Logged actions this game refused or no longer has, skipped. Only for a save from another build or game version. */
  readonly skipped: number;
  /**
   * The state loaded is not the state saved: the snapshot was migrated or gained a module, or the
   * log played out otherwise under this build's rules. Only for a save from another build or game
   * version.
   */
  readonly differs: boolean;
}

export type LoadResult =
  | { readonly ok: true; readonly state: GameState; readonly file: SaveFile; readonly report: LoadReport }
  | { readonly ok: false; readonly problem: SaveProblem; readonly message: string };

/**
 * Reads a save back to the state it holds (docs/specs/saves.md): checks the file, migrates the
 * snapshot, then replays the log.
 *
 * On the same build, with nothing migrated, the replay must reach exactly the state saved, or
 * the save is refused: it is damaged, or the game is not deterministic. A save from another
 * build or game version replays under today's rules instead. Actions those rules refuse are
 * skipped, and a replay that ends elsewhere is reported rather than refused, so an update never
 * costs a player their save.
 */
export function loadSave(game: Game, raw: unknown, sim: SimContext, options: LoadOptions): LoadResult {
  const verified = verifySaveFile(raw, options.game);
  if (!verified.ok) return verified;
  const { file } = verified;
  let migrated: ReturnType<Game['migrate']>;
  try {
    migrated = game.migrate(file.snapshot, sim);
  } catch (error) {
    if (error instanceof MigrationError) {
      return { ok: false, problem: error.newer ? 'newer' : 'cannot-migrate', message: error.message };
    }
    throw error;
  }
  const { migrated: changed, added, kept } = migrated.report;
  const strict = file.build === options.build && changed.length === 0 && added.length === 0 && kept.length === 0;
  const differ = (message: string): LoadResult => ({ ok: false, problem: 'replay-differs', message });
  let state = migrated.state;
  let replayed = 0;
  let skipped = 0;
  for (const [i, action] of file.log.entries()) {
    let step: ReturnType<Game['reduce']>;
    try {
      step = game.reduce(state, action, sim);
    } catch (error) {
      if (!(error instanceof ActionError) || strict) throw error;
      skipped++;
      continue;
    }
    if (!step.accepted) {
      if (strict) return differ(`Action ${i} of the log ("${action.type}") was refused on replay`);
      skipped++;
      continue;
    }
    state = step.state;
    replayed++;
  }
  const differs = stateHash(state) !== file.hash;
  if (differs && strict) return differ('The log replays to another state than the one saved');
  return { ok: true, state, file, report: { ...migrated.report, replayed, skipped, differs } };
}
