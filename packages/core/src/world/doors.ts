/**
 * The doors between spaces (M6.6, D78, docs/specs/markers.md#places-and-doors): a use or a zone among
 * whose own effects is enter-space is a door from its space to that effect's space. A marker for a
 * target in another space points at the door out of this one on the fewest doors to it, never across
 * the grid (dirtbag's B5). Plain functions of the pack's world, so the stage, the map and a bot agree.
 */
import type { Triggers, Uses } from './types.ts';

/** By space, each door's object path and the space it leads to. */
export type Doors = Readonly<Record<string, Readonly<Record<string, string>>>>;

const ENTER = 'enter-space';

/** The space the first enter-space among the effects leads to, if any. */
function leadsTo(effects: readonly unknown[]): string | undefined {
  for (const effect of effects) {
    const e = effect as { effect?: unknown; space?: unknown };
    if (e.effect === ENTER && typeof e.space === 'string') return e.space;
  }
  return undefined;
}

/** Every door of the world's uses and zones, by space. */
export function doorsOf(world: { readonly uses: Uses; readonly triggers: Triggers }): Doors {
  const doors: Record<string, Record<string, string>> = {};
  const add = (space: string, path: string, effects: readonly unknown[]) => {
    const to = leadsTo(effects);
    if (to === undefined || to === space) return;
    doors[space] ??= {};
    (doors[space] as Record<string, string>)[path] = to;
  };
  for (const [space, found] of Object.entries(world.uses)) {
    for (const [path, use] of Object.entries(found)) add(space, path, use.effects);
  }
  for (const [space, found] of Object.entries(world.triggers)) {
    for (const [path, zone] of Object.entries(found)) add(space, path, zone.effects);
  }
  return doors;
}

/**
 * The door out of `from` on the fewest doors to `to`, ties to the first by path, or none when
 * `from` is `to` or no door leads there.
 */
export function doorToward(doors: Doors, from: string, to: string): string | undefined {
  if (from === to) return undefined;
  const first = new Map<string, string>();
  const seen = new Set([from]);
  let frontier = [from];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const space of frontier) {
      const out = Object.entries(doors[space] ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      for (const [path, lead] of out) {
        if (seen.has(lead)) continue;
        seen.add(lead);
        const door = space === from ? path : (first.get(space) as string);
        if (lead === to) return door;
        first.set(lead, door);
        next.push(lead);
      }
    }
    frontier = next;
  }
  return undefined;
}
