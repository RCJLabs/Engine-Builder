/**
 * The editor's debug step (M4.9, D59, docs/specs/play-in-editor.md): effects run as a step of their
 * own, through the sim, so a debugged game is one the sim could reach. Its slice counts them, which
 * is how the player page knows a save it must refuse. Space-Wrecked's cheats are its game's own
 * functions in the same way; Afterglass marks its with a 'debug' action type that exports refuse.
 */
import { defineModule, type Module } from './module.ts';
import type { Action, Effect } from './types.ts';

/** The module's id, and its slice's key in the state. */
export const DEBUG = 'debug';

/**
 * Set only by debugModule(): the kernel lets this module's actions past the mode check, keeps them
 * out of every mode's list (so nothing offers them), and refuses any other module named "debug".
 */
export const DEBUG_MODULE: unique symbol = Symbol('eb debug module');

export interface DebugSlice {
  /** The debug steps in this state's history. */
  steps: number;
}

/** The most effects one debug step runs. */
export const MAX_DEBUG_EFFECTS = 20;

const isEffect = (value: unknown): value is Effect =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as Record<string, unknown>).effect === 'string';

/** The debug module, for the games the editor opens and never for a player's. */
export function debugModule(): Module {
  const module = defineModule<DebugSlice>({
    id: DEBUG,
    init: () => ({ steps: 0 }),
    actions: {
      run(ctx, action) {
        const { effects } = action;
        if (!Array.isArray(effects) || effects.length === 0 || effects.length > MAX_DEBUG_EFFECTS) {
          return ctx.refuse('bad-effects');
        }
        if (!effects.every(isEffect)) return ctx.refuse('bad-effects');
        for (const effect of effects) ctx.apply(effect);
        ctx.write().steps = ctx.read().steps + 1;
        // A beat, not a declared event: no row or quest can count debug steps.
        ctx.emit('ran', { effects: effects.length });
      },
    },
  });
  return Object.assign(module, { [DEBUG_MODULE]: true });
}

export const isDebugModule = (module: Module): boolean =>
  (module as { [DEBUG_MODULE]?: boolean })[DEBUG_MODULE] === true;

/** The debug step that runs these effects. */
export const debugRun = (effects: readonly Effect[]): Action => ({ type: `${DEBUG}/run`, effects });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The debug steps a save holds: those its snapshot counts, and those in its log. Read from the
 * file as it is, so a game without the module can tell before it replays the log.
 */
export function debugStepsOf(save: { readonly snapshot: unknown; readonly log: readonly unknown[] }): number {
  const slice = isObject(save.snapshot) ? save.snapshot[DEBUG] : undefined;
  const counted = isObject(slice) && Number.isSafeInteger(slice.steps) ? Math.max(slice.steps as number, 0) : 0;
  const logged = save.log.filter(
    (action) => isObject(action) && typeof action.type === 'string' && action.type.startsWith(`${DEBUG}/`),
  ).length;
  return counted + logged;
}
