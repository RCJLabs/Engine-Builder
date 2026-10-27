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
import { doorsBetween, doorsOf } from './doors.ts';
import { attack, engaged, fall, follow, npcsAt, rise, stand, walkTo } from './npcs.ts';
import { type PackWorld, worldDataOf } from './packWorld.ts';
import { cover, sees } from './tiles/facts.ts';
import { placeKey, WORLD, WORLD_VERSION, type WorldData, type WorldSlice } from './types.ts';

export * from './types.ts';

const own = <T>(map: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(map, key) ? map[key] : undefined;

const TEXT: Domain = { type: 'text' };
const BOOL: Domain = { type: 'bool' };
const DOORS: Domain = { type: 'int', min: 0 };
const PLACE = { space: TEXT, object: TEXT };
const COVER: Domain = { type: 'enum', values: ['none', 'half', 'full'] };

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
  const doors = doorsOf(world);
  return defineModule<WorldSlice>({
    id: WORLD,
    version: WORLD_VERSION,
    migrate: {
      // Version 1 had only `fired`: nothing was taken, and the player is in the start.
      2: (slice) => ({ ...(slice as object), taken: [], space: world.start }),
      // Version 2 had no NPCs walking: each stands where it was placed.
      3: (slice) => ({ ...(slice as object), npcs: {} }),
      // Version 3 had no NPC following the player or facing them: its NPCs load as they were.
      4: (slice) => slice,
      // Version 4 had no NPC fighting or fallen: likewise.
      5: (slice) => slice,
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
      follow: { run: (ctx, effect) => follow(world, ctx, effect) },
      stand: { run: (ctx, effect) => stand(world, ctx, effect) },
      // Not `fight`, the encounters kit's turn-based fight, which the fighting kit needs beside it.
      attack: { run: (ctx, effect) => attack(world, ctx, effect) },
      fall: { run: (ctx, effect) => fall(world, ctx, effect) },
      rise: { run: (ctx, effect) => rise(world, ctx, effect) },
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
      // M6.7 (D79): what a quest's slot reads to take the nearest.
      doors: {
        args: { space: TEXT },
        domain: DOORS,
        label: 'the fewest doors from where the player is to the space',
        read: (view, args) =>
          typeof args.space === 'string' ? doorsBetween(doors, view.state.space, args.space) : undefined,
      },
      // The space a placed actor stands in (M6.3): the ai kit's, as it hears what NPCs of a space sensed.
      'npc-space': {
        args: { actor: TEXT },
        domain: TEXT,
        label: 'the space the NPC stands in',
        read: (_view, args) => (typeof args.actor === 'string' ? own(world.actors, args.actor)?.space : undefined),
      },
      // M6.4 (D76): one of the two fighting the player now, and one fallen.
      'npc-engaged': {
        args: { actor: TEXT },
        domain: BOOL,
        label: 'the NPC is one of the two fighting the player',
        read: (view, args) => typeof args.actor === 'string' && engaged(view.state.npcs, args.actor),
      },
      'npc-down': {
        args: { actor: TEXT },
        domain: BOOL,
        label: 'the NPC is down',
        read: (view, args) =>
          typeof args.actor === 'string' &&
          Object.hasOwn(view.state.npcs, args.actor) &&
          view.state.npcs[args.actor]?.down === true,
      },
      // M7.2 (D84): a tilemap's sight and cover between two objects of a space.
      sees: {
        args: { space: TEXT, from: TEXT, to: TEXT },
        domain: BOOL,
        label: 'there is a line of sight between the two',
        read: (view, args) => sees(world, view.state, args),
      },
      cover: {
        args: { space: TEXT, at: TEXT, from: TEXT },
        domain: COVER,
        label: 'the cover the first has against the second',
        read: (view, args) => cover(world, view.state, args),
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
