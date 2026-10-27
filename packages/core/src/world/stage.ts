/**
 * The world's stage for headless runs (M6.9, D81, docs/specs/runner.md#a-walked-games-stage-m69-d81):
 * each use and each zone of the space the player is in, as the walk would send them on reaching
 * it. It places no one, so a bot reaches anything in that space; the runner keeps only what the sim
 * takes, which leaves out a use whose `when` fails, a taken object and a once zone that has run.
 */
import type { Stage } from '../runner/stage.ts';
import type { Action, GameState } from '../sim/types.ts';
import { WORLD, type WorldData, type WorldSlice } from './types.ts';

/** The space the player is in, or none in a game without the world module. */
export const spaceOf = (state: GameState): string | undefined =>
  ((state as Readonly<Record<string, unknown>>)[WORLD] as WorldSlice | undefined)?.space;

export function worldStage(world: WorldData): Stage {
  return {
    name: 'walk',
    candidates(state) {
      const space = spaceOf(state);
      if (space === undefined) return [];
      const uses: Action[] = Object.keys(world.uses[space] ?? {})
        .sort()
        .map((object) => ({ type: 'world/use', space, object }));
      const zones: Action[] = Object.keys(world.triggers[space] ?? {})
        .sort()
        .map((object) => ({ type: 'world/trigger', space, object }));
      return [...uses, ...zones];
    },
  };
}
