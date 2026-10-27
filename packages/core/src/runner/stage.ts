/**
 * A walked game's stage for headless runs (M6.9, D81, docs/specs/runner.md#a-walked-games-stage-m69-d81):
 * what a page's stage could send now, beside the game's options. A walked game moves only by what
 * its stage sends, so without one a bot can't take a step. Each candidate is reduced and kept only
 * when the sim takes it, so nothing a stage offers is refused.
 */
import type { Game } from '../sim/game.ts';
import type { Action, GameState, SimContext } from '../sim/types.ts';

export interface Stage {
  /** Kebab-case, for reports and golden files. */
  readonly name: string;
  /** What it could send now, in its order: the sim decides which it takes. */
  candidates(state: GameState, game: Game, sim: SimContext): readonly Action[];
}

/** The stage's candidates the sim takes now, in their order. */
export function stageOptions(stage: Stage, game: Game, sim: SimContext, state: GameState): readonly Action[] {
  return stage.candidates(state, game, sim).filter((action) => game.reduce(state, action, sim).accepted);
}

/** Stages played together, each one's candidates after the one before's: their names joined by "+". */
export function joinStages(stages: readonly Stage[]): Stage {
  return {
    name: stages.map((s) => s.name).join('+'),
    candidates: (state, game, sim) => stages.flatMap((s) => s.candidates(state, game, sim)),
  };
}
