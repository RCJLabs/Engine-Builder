/**
 * NPCs that walk (M6.2, D74, docs/specs/navigation.md#goals-and-arrivals): `walk-to` gives a placed
 * actor a goal, an object in its space, and the stage's crowd walks it there; `world/npcs-at` is the
 * stage saying where each NPC it walks stands, and which reached its goal. The sim never walks
 * anyone: it keeps the goals and hears the arrivals, so a save puts each NPC back where it stood.
 * M6.3 (D75, docs/specs/ai.md#the-world-module-at-version-4): `follow` sends one after the player and
 * `stand` stops it, turned to them or not; each replaces the others.
 * M6.4 (D76, docs/specs/combat.md#an-npc-fighting): `attack` sends one at the player, the first two
 * sent engaged and the rest circling, and `fall` puts one down for good.
 */
import type { ModuleContext } from '../sim/module.ts';
import type { Action, Effect } from '../sim/types.ts';
import type { NpcPlace, WorldData, WorldSlice } from './types.ts';

const own = <T>(map: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(map, key) ? map[key] : undefined;

type Npcs = Record<string, NpcPlace>;
const npcsOf = (ctx: ModuleContext<WorldSlice>) => (ctx.write() as { npcs: Npcs }).npcs;

/** Where it stood, what it is told now aside: the effect's actor, once it is one placed in a space. */
function stillOf(world: WorldData, ctx: ModuleContext<WorldSlice>, effect: Effect, name: string) {
  const { actor } = effect as Effect & { actor?: unknown };
  // E079 keeps a bad actor from content; a script's own effect can still get it wrong.
  const placed = typeof actor === 'string' ? own(world.actors, actor) : undefined;
  if (placed === undefined) throw new Error(`${name}: no actor placed in a space: ${JSON.stringify(actor)}`);
  const npcs = npcsOf(ctx);
  const {
    goal: _goal,
    follow: _follow,
    facing: _facing,
    fight: _fight,
    ...was
  } = own(npcs, actor as string) ?? {
    space: placed.space,
  };
  return { npcs, actor: actor as string, was, down: own(npcs, actor as string)?.down === true };
}

export function walkTo(world: WorldData, ctx: ModuleContext<WorldSlice>, effect: Effect): void {
  const { to } = effect as Effect & { to?: unknown };
  const { npcs, actor, was, down } = stillOf(world, ctx, effect, 'walk-to');
  if (typeof to !== 'string' || to.length === 0)
    throw new Error(`walk-to: no object to walk to: ${JSON.stringify(to)}`);
  if (down) return;
  const { arrived: _left, ...kept } = was;
  npcs[actor] = { ...kept, goal: to };
}

/** The metres a follower keeps from the player when the effect gives none. */
export const FOLLOW_M = 2;

export function follow(world: WorldData, ctx: ModuleContext<WorldSlice>, effect: Effect): void {
  const { distance = FOLLOW_M } = effect as Effect & { distance?: unknown };
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance <= 0)
    throw new Error(`follow: a distance is metres, more than 0: ${JSON.stringify(distance)}`);
  const { npcs, actor, was, down } = stillOf(world, ctx, effect, 'follow');
  if (down) return;
  const { arrived: _left, ...kept } = was;
  npcs[actor] = { ...kept, follow: cm(distance) };
}

/** Stops it where it is: where it last arrived it still last arrived. */
export function stand(world: WorldData, ctx: ModuleContext<WorldSlice>, effect: Effect): void {
  const { facing } = effect as Effect & { facing?: unknown };
  if (facing !== undefined && facing !== 'player') throw new Error(`stand: it faces only "player": ${facing}`);
  const { npcs, actor, was, down } = stillOf(world, ctx, effect, 'stand');
  if (down) return;
  npcs[actor] = { ...was, ...(facing === 'player' ? { facing } : {}) };
}

/** How many NPCs fight the player at once (D76); the rest circle until one falls or is sent elsewhere. */
export const ENGAGED_MOST = 2;

/** Sends it at the player, at the back of the queue; one fighting already keeps its turn. */
export function attack(world: WorldData, ctx: ModuleContext<WorldSlice>, effect: Effect): void {
  const { npcs, actor, was, down } = stillOf(world, ctx, effect, 'attack');
  if (down) return;
  const kept = own(npcs, actor)?.fight;
  const last = Object.values(npcs).reduce((most, npc) => Math.max(most, npc.fight ?? 0), 0);
  const { arrived: _left, ...rest } = was;
  npcs[actor] = { ...rest, fight: kept ?? last + 1 };
}

/** Puts it down where it stands, its goals cleared: every goal effect after leaves it there. */
export function fall(world: WorldData, ctx: ModuleContext<WorldSlice>, effect: Effect): void {
  const { npcs, actor, was } = stillOf(world, ctx, effect, 'fall');
  npcs[actor] = { ...was, down: true };
}

/** Whether the NPC is one of the first ENGAGED_MOST of those fighting, by turn and then by id. */
export function engaged(npcs: Readonly<Record<string, Pick<NpcPlace, 'fight' | 'down'>>>, actor: string): boolean {
  const turn = own(npcs, actor)?.fight;
  if (turn === undefined) return false;
  const ahead = Object.entries(npcs).filter(
    ([other, npc]) =>
      npc.fight !== undefined && npc.down !== true && (npc.fight < turn || (npc.fight === turn && other < actor)),
  );
  return ahead.length < ENGAGED_MOST;
}

/** To the centimetre and the tenth of a degree, as world/at keeps the player's. */
const cm = (n: number) => Math.round(n * 100) / 100;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isObject = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** One NPC's stand as the stage sends it, or undefined when it isn't one. */
function standOf(value: unknown): { feet: [number, number, number]; yaw: number; arrived?: string } | undefined {
  if (!isObject(value)) return undefined;
  const { feet, yaw, arrived } = value;
  if (!Array.isArray(feet) || feet.length !== 3 || !feet.every(finite) || !finite(yaw)) return undefined;
  if (arrived !== undefined && typeof arrived !== 'string') return undefined;
  return {
    feet: [cm(feet[0] as number), cm(feet[1] as number), cm(feet[2] as number)],
    yaw: Math.round((((yaw % 360) + 360) % 360) * 10) / 10,
    ...(arrived !== undefined ? { arrived } : {}),
  };
}

export function npcsAt(world: WorldData, ctx: ModuleContext<WorldSlice>, action: Action): void {
  const { space, npcs: told } = action as Action & { space?: unknown; npcs?: unknown };
  if (typeof space !== 'string' || !isObject(told)) ctx.refuse('bad-npcs-at');
  // A stage a step behind, still walking the space the player left, must not move anyone.
  if (space !== ctx.read().space) ctx.refuse('elsewhere', { space });
  const stands = Object.entries(told).map(([actor, value]) => [actor, standOf(value)] as const);
  for (const [actor, stand] of stands) {
    if (stand === undefined) ctx.refuse('bad-npcs-at', { actor });
    if (own(world.actors, actor)?.space !== space) ctx.refuse('no-npc', { actor });
  }
  const npcs = npcsOf(ctx);
  for (const [actor, stand] of stands) {
    const { arrived, feet, yaw } = stand as NonNullable<typeof stand>;
    const was = own(npcs, actor) ?? { space };
    // An arrival counts only at the goal the sim gave: one for an older goal is the stage behind.
    if (arrived !== undefined && arrived === was.goal) {
      const { goal: _done, ...rest } = was;
      npcs[actor] = { ...rest, feet, yaw, arrived };
      ctx.emit('npc-arrived', { actor, at: arrived });
    } else {
      npcs[actor] = { ...was, feet, yaw };
    }
  }
}
