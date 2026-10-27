/**
 * The world module's actions and its effect (M5.9, D71, docs/specs/worldspaces.md): a trigger zone
 * entered, a use, where the player stands, and enter-space. Each refusal names what was wrong, so
 * the stage can tell a spent zone from a mistake.
 */
import type { ModuleContext } from '../sim/module.ts';
import type { Action, Effect } from '../sim/types.ts';
import { placeKey, type StoodAt, type WorldData, type WorldSlice } from './types.ts';

/** Into a sorted list of keys, once. */
function remember(list: string[], key: string): void {
  if (list.includes(key)) return;
  let i = list.length;
  while (i > 0 && (list[i - 1] as string) > key) i--;
  list.splice(i, 0, key);
}

/** An own key's value only: a space or an object named like Object's own (`constructor`) is none. */
const own = <T>(map: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(map, key) ? map[key] : undefined;

function placeOf(ctx: ModuleContext<WorldSlice>, action: Action, bad: string): { space: string; object: string } {
  const { space, object } = action as Action & { space?: unknown; object?: unknown };
  if (typeof space !== 'string' || typeof object !== 'string') ctx.refuse(bad);
  return { space, object };
}

export function trigger(world: WorldData, ctx: ModuleContext<WorldSlice>, action: Action): void {
  const { space, object } = placeOf(ctx, action, 'bad-trigger');
  const zones = own(world.triggers, space);
  const zone = zones !== undefined ? own(zones, object) : undefined;
  if (zone === undefined) ctx.refuse('no-zone', { space, object });
  const key = placeKey(space, object);
  if (zone.once === true && ctx.read().fired.includes(key)) ctx.refuse('spent');
  if (zone.when !== undefined && ctx.check(zone.when) !== true) ctx.refuse('unmet');
  ctx.emit('entered', { space, object });
  for (const effect of zone.effects) ctx.apply(effect);
  if (zone.once === true) remember(ctx.write().fired as string[], key);
}

export function use(world: WorldData, ctx: ModuleContext<WorldSlice>, action: Action): void {
  const { space, object } = placeOf(ctx, action, 'bad-use');
  const uses = own(world.uses, space);
  const found = uses !== undefined ? own(uses, object) : undefined;
  if (found === undefined) ctx.refuse('no-use', { space, object });
  const key = placeKey(space, object);
  const slice = ctx.read();
  if (slice.taken.includes(key)) ctx.refuse('taken');
  if (found.once === true && slice.fired.includes(key)) ctx.refuse('spent');
  if (found.when !== undefined && ctx.check(found.when) !== true) ctx.refuse('unmet');
  // An NPC down, fallen or an essential one until it gets up (M6.10), answers no use: no talk with it.
  const actor = Object.keys(world.actors).find(
    (a) => world.actors[a]?.space === space && world.actors[a]?.path === object,
  );
  if (actor !== undefined && own(slice.npcs, actor)?.down === true) ctx.refuse('down', { actor });
  ctx.emit('used', { space, object });
  // Taken before its effects run, so an enter-space among them leaves the place as it should be.
  if (found.takes === true) remember(ctx.write().taken as string[], key);
  if (found.once === true) remember(ctx.write().fired as string[], key);
  for (const effect of found.effects) ctx.apply(effect);
  // M6.8 (D80): a use that holds items opens them, once its own effects have run; E089 keeps the kit on.
  if (found.holds !== undefined) ctx.apply({ effect: 'open-container', space, object });
}

/** To the centimetre and the tenth of a degree: what the stage sends, kept canonical whatever it rounded. */
const cm = (n: number) => Math.round(n * 100) / 100;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function at(ctx: ModuleContext<WorldSlice>, action: Action): void {
  const { space, feet, yaw } = action as Action & { space?: unknown; feet?: unknown; yaw?: unknown };
  if (typeof space !== 'string' || !Array.isArray(feet) || feet.length !== 3 || !feet.every(finite) || !finite(yaw)) {
    ctx.refuse('bad-at');
  }
  // A stage a step behind, still sending the space it left, must not undo the enter-space.
  if (space !== ctx.read().space) ctx.refuse('elsewhere', { space });
  const stood: StoodAt = {
    space,
    feet: [cm(feet[0] as number), cm(feet[1] as number), cm(feet[2] as number)],
    yaw: Math.round((((yaw % 360) + 360) % 360) * 10) / 10,
  };
  const slice = ctx.write() as { at?: StoodAt };
  slice.at = stood;
}

export function enterSpace(world: WorldData, ctx: ModuleContext<WorldSlice>, effect: Effect): void {
  const { space, spawn } = effect as Effect & { space?: unknown; spawn?: unknown };
  // E076 keeps these from content; a script's own effect can still get them wrong.
  const spawns = typeof space === 'string' ? own(world.spawns, space) : undefined;
  if (spawns === undefined) throw new Error(`enter-space: no space ${JSON.stringify(space)}`);
  if (spawn !== undefined && (typeof spawn !== 'string' || !spawns.includes(spawn))) {
    throw new Error(`enter-space: the space "${space}" has no spawn point ${JSON.stringify(spawn)}`);
  }
  const slice = ctx.write() as { space?: string; at?: StoodAt; arrive?: string };
  slice.space = space as string;
  delete slice.at;
  if (spawn === undefined) delete slice.arrive;
  else slice.arrive = spawn as string;
  ctx.emit('arrived', { space: space as string });
}
