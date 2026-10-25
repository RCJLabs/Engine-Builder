/**
 * Where a Space widget's stage starts (M5.9, D71, docs/specs/worldspaces.md#the-space-widget): in the
 * space the player is in, where they last stood or the spawn point they arrive at; in any other, its
 * start. What is taken there is gone either way. A plain function of the world's view.
 */
import type { WorldView } from '../session/types.ts';
import type { SpaceAsk } from './spaceHost.ts';

export function placingIn(space: string, world: WorldView | undefined): Pick<SpaceAsk, 'at' | 'arrive' | 'taken'> {
  const here = world?.space === space;
  const prefix = `${space}/`;
  const taken = (world?.taken ?? []).filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
  const at = here && world?.at?.space === space ? { feet: world.at.feet, yaw: world.at.yaw } : undefined;
  return { ...(at ? { at } : {}), ...(here && world?.arrive !== undefined ? { arrive: world.arrive } : {}), taken };
}
