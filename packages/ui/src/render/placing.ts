/**
 * Where a Space widget's stage starts (M5.9, D71, docs/specs/worldspaces.md#the-space-widget): in the
 * space the player is in, where they last stood or the spawn point they arrive at; in any other, its
 * start. What is taken there is gone either way. A plain function of the world's view.
 */
import type { WorldView } from '../session/types.ts';
import type { NpcGoal, SpaceAsk } from './spaceHost.ts';

/** The NPCs of `space` the sim knows of (M6.2), by actor, as the stage reads them. */
export function npcsIn(space: string, world: WorldView | undefined): Readonly<Record<string, NpcGoal>> {
  const out: Record<string, NpcGoal> = {};
  for (const [actor, npc] of Object.entries(world?.npcs ?? {})) {
    if (npc.space !== space) continue;
    const { space: _here, ...goal } = npc;
    out[actor] = goal;
  }
  return out;
}

export function placingIn(
  space: string,
  world: WorldView | undefined,
): Pick<SpaceAsk, 'at' | 'arrive' | 'taken' | 'npcs'> {
  const here = world?.space === space;
  const prefix = `${space}/`;
  const taken = (world?.taken ?? []).filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
  const at = here && world?.at?.space === space ? { feet: world.at.feet, yaw: world.at.yaw } : undefined;
  const npcs = npcsIn(space, world);
  return {
    ...(at ? { at } : {}),
    ...(here && world?.arrive !== undefined ? { arrive: world.arrive } : {}),
    taken,
    ...(Object.keys(npcs).length > 0 ? { npcs } : {}),
  };
}
