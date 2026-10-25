/**
 * The world module (M5.8, D70, docs/specs/movement.md#the-sim-worldtrigger): what the sim hears of
 * a space walked on the page. The stage moves the character, which the sim never sees; entering a
 * trigger zone is `world/trigger`, checked and run here like any action, so a game's state stays
 * replayable though the walk that reached the zone isn't. The zones come from the pack, each
 * space's resolved through its prefabs and overrides by the compiler.
 */
import type { Condition, Domain } from '../logic/types.ts';
import { defineModule, type Module, type ModuleContext } from '../sim/module.ts';
import type { Action, Effect } from '../sim/types.ts';

/** The world module's id, and its slice's key. */
export const WORLD = 'world';

/** A trigger zone as the pack holds it: its condition as a tree, its effects as written. */
export interface TriggerZone {
  readonly when?: Condition;
  readonly effects: readonly Effect[];
  readonly once?: boolean;
}

/** By space id, then by the object's path: its id, or "placement/inner" through a prefab. */
export type Triggers = Readonly<Record<string, Readonly<Record<string, TriggerZone>>>>;

export interface WorldSlice {
  /** The once zones that have run, as "space/object", sorted. */
  readonly fired: readonly string[];
}

const firedKey = (space: string, object: string) => `${space}/${object}`;

const TEXT: Domain = { type: 'text' };

function remember(ctx: ModuleContext<WorldSlice>, key: string): void {
  const fired = ctx.write().fired as string[];
  let i = fired.length;
  while (i > 0 && (fired[i - 1] as string) > key) i--;
  fired.splice(i, 0, key);
}

function trigger(triggers: Triggers, ctx: ModuleContext<WorldSlice>, action: Action): void {
  const { space, object } = action as Action & { space?: unknown; object?: unknown };
  if (typeof space !== 'string' || typeof object !== 'string') ctx.refuse('bad-trigger');
  // Own keys only: a space or an object named like Object's own (`constructor`) is no zone.
  const zones = Object.hasOwn(triggers, space) ? triggers[space] : undefined;
  const zone = zones !== undefined && Object.hasOwn(zones, object) ? zones[object] : undefined;
  if (zone === undefined) ctx.refuse('no-zone', { space, object });
  const key = firedKey(space, object);
  if (zone.once === true && ctx.read().fired.includes(key)) ctx.refuse('spent');
  if (zone.when !== undefined && ctx.check(zone.when) !== true) ctx.refuse('unmet');
  ctx.emit('entered', { space, object });
  for (const effect of zone.effects) ctx.apply(effect);
  if (zone.once === true) remember(ctx, key);
}

/** The module for a pack's trigger zones: on whenever the pack has spaces. */
export function worldModule(triggers: Triggers): Module {
  return defineModule<WorldSlice>({
    id: WORLD,
    init: () => ({ fired: [] }),
    events: {
      entered: { args: { space: TEXT, object: TEXT }, label: 'The player enters a trigger zone' },
    },
    actions: {
      // Never offered: only the stage, as the character walks in, sends it.
      trigger: { run: (ctx, action) => trigger(triggers, ctx, action), options: () => [] },
    },
    facts: {
      fired: {
        args: { space: TEXT, object: TEXT },
        domain: { type: 'bool' },
        label: 'a once zone has run',
        read: (view, args) =>
          typeof args.space === 'string' &&
          typeof args.object === 'string' &&
          view.state.fired.includes(firedKey(args.space, args.object)),
      },
    },
  });
}
