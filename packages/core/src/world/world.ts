/**
 * The world module (M5.8, D70; M5.9, D71, docs/specs/worldspaces.md): what the sim hears of the
 * spaces walked on the page. The stage moves the character, which the sim never sees; entering a
 * trigger zone is `world/trigger`, using what the player faces is `world/use`, and where the player
 * stands is `world/at`, each checked and run here like any action, so a game's state stays
 * replayable though the walk between them isn't. `enter-space` moves the player to a space. The
 * zones and uses come from the pack, each space's resolved through its prefabs and overrides by
 * the compiler.
 */
import type { Domain } from '../logic/types.ts';
import { defineModule, type Module } from '../sim/module.ts';
import { at, enterSpace, trigger, use } from './actions.ts';
import { npcsAt, walkTo } from './npcs.ts';
import { type PackWorld, worldDataOf } from './packWorld.ts';
import { placeKey, WORLD, WORLD_VERSION, type WorldData, type WorldSlice } from './types.ts';

export * from './types.ts';

const TEXT: Domain = { type: 'text' };
const BOOL: Domain = { type: 'bool' };
const PLACE = { space: TEXT, object: TEXT };

const placeIn = (list: readonly string[], args: Readonly<Record<string, unknown>>) =>
  typeof args.space === 'string' && typeof args.object === 'string' && list.includes(placeKey(args.space, args.object));

/**
 * A game's modules with the world module built from the pack's world: checking joins one with no
 * spaces' data (EMPTY_WORLD), and a game played headless, by eb sim or the editor's Run, needs the
 * spaces enter-space names.
 */
export function withPackWorld(modules: readonly Module[], world: PackWorld | undefined): readonly Module[] {
  if (!world) return modules;
  return modules.map((m) => (m.id === WORLD ? worldModule(worldDataOf(world)) : m));
}

/** The module for a pack's world: on whenever the pack has spaces. */
export function worldModule(world: WorldData): Module {
  return defineModule<WorldSlice>({
    id: WORLD,
    version: WORLD_VERSION,
    migrate: {
      // Version 1 had only `fired`: nothing was taken, and the player is in the start.
      2: (slice) => ({ ...(slice as object), taken: [], space: world.start }),
      // Version 2 had no NPCs walking: each stands where it was placed.
      3: (slice) => ({ ...(slice as object), npcs: {} }),
    },
    init: () => ({ fired: [], taken: [], space: world.start, npcs: {} }),
    events: {
      entered: { args: PLACE, label: 'The player enters a trigger zone' },
      used: { args: PLACE, label: 'The player uses something' },
      arrived: { args: { space: TEXT }, label: 'The player arrives in a space' },
      'npc-arrived': { args: { actor: TEXT, at: TEXT }, label: 'An NPC arrives where it was sent' },
    },
    actions: {
      // None is ever offered: only the stage sends them, as the character walks, uses and stands.
      trigger: { run: (ctx, action) => trigger(world, ctx, action), options: () => [] },
      use: { run: (ctx, action) => use(world, ctx, action), options: () => [] },
      at: { run: (ctx, action) => at(ctx, action), options: () => [] },
      'npcs-at': { run: (ctx, action) => npcsAt(world, ctx, action), options: () => [] },
    },
    effects: {
      'enter-space': { run: (ctx, effect) => enterSpace(world, ctx, effect) },
      'walk-to': { run: (ctx, effect) => walkTo(world, ctx, effect) },
    },
    facts: {
      fired: {
        args: PLACE,
        domain: BOOL,
        label: 'a once zone or use has run',
        read: (v, a) => placeIn(v.state.fired, a),
      },
      taken: {
        args: PLACE,
        domain: BOOL,
        label: 'the object has been taken',
        read: (v, a) => placeIn(v.state.taken, a),
      },
      in: {
        args: { space: TEXT },
        domain: BOOL,
        label: 'the player is in the space',
        read: (view, args) => typeof args.space === 'string' && view.state.space === args.space,
      },
      'npc-at': {
        args: { actor: TEXT },
        domain: TEXT,
        label: 'where the NPC last arrived',
        read: (view, args) =>
          typeof args.actor === 'string' && Object.hasOwn(view.state.npcs, args.actor)
            ? view.state.npcs[args.actor]?.arrived
            : undefined,
      },
    },
  });
}
