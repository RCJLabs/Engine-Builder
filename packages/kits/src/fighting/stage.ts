/**
 * The fighting kit's stage for headless runs (M6.9, D81, docs/specs/runner.md#a-walked-games-stage-m69-d81):
 * in the space the player is in, the player's blow at each NPC still standing there, each engaged
 * NPC's blow at the player, the search of each body there and the rise of each NPC down (M6.10),
 * every blow with what its striker wields ("" for fists, as the kit has it). No reach, no aim and no
 * arrow's flight, so a bow's blow spends no arrow: the runner keeps only what the sim takes.
 */
import { type Action, type Stage, spaceOf } from '@eb/core';
import type { FightingDef } from './types.ts';

/** `actors`, the world's placed actors: the NPCs that can stand in a space, never the player. */
export function fightingStage(def: FightingDef, actors: readonly string[]): Stage {
  const npcs = [...actors].sort();
  return {
    name: 'fight',
    candidates(state, game, sim) {
      const space = spaceOf(state);
      if (space === undefined) return [];
      const fact = (id: string, actor: string) => game.fact(state, id, { actor }, sim);
      const weapon = (actor: string) => {
        const item = fact('fighting.weapon', actor);
        return typeof item === 'string' ? item : '';
      };
      const player = def.player;
      const mine = weapon(player);
      const sent: Action[] = [];
      for (const actor of npcs) {
        if (fact('world.npc-space', actor) !== space) continue;
        if (fact('fighting.fallen', actor) === true) {
          sent.push({ type: 'fighting/search', actor });
          continue;
        }
        // An essential NPC down gets up as the page's stage would stand it, a while later (M6.10, D82).
        if (fact('fighting.down', actor) === true) {
          sent.push({ type: 'fighting/rise', actor });
          continue;
        }
        sent.push({ type: 'fighting/hit', by: player, on: actor, weapon: mine });
        if (fact('world.npc-engaged', actor) === true) {
          sent.push({ type: 'fighting/hit', by: actor, on: player, weapon: weapon(actor) });
        }
      }
      return sent;
    },
  };
}
