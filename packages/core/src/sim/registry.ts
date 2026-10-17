import { isRecordId } from '../records.ts';
import type { Module } from './module.ts';

/** The module id the kernel's own state uses. */
export const KERNEL = 'kernel';

export interface Registry {
  /** In the order given, which is the order their slices are created. */
  readonly modules: readonly Module[];
  readonly actions: ReadonlyMap<
    string,
    { readonly module: string; readonly run: NonNullable<Module['actions']>[string] }
  >;
  readonly facts: ReadonlyMap<string, { readonly module: string; readonly read: NonNullable<Module['facts']>[string] }>;
  readonly effects: ReadonlyMap<
    string,
    { readonly module: string; readonly run: NonNullable<Module['effects']>[string] }
  >;
  /** Each mode's allowed action types, with its patterns already expanded. */
  readonly modes: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Indexes the modules and checks every name, so a typo fails when the game is made rather than
 * as an action that is quietly never allowed. Throws on a programmer error.
 */
export function buildRegistry(modules: readonly Module[]): Registry {
  const actions = new Map<string, { module: string; run: NonNullable<Module['actions']>[string] }>();
  const facts = new Map<string, { module: string; read: NonNullable<Module['facts']>[string] }>();
  const effects = new Map<string, { module: string; run: NonNullable<Module['effects']>[string] }>();
  const ids = new Set<string>();
  for (const module of modules) {
    name(module.id, 'module id');
    if (module.id === KERNEL) throw new Error(`"${KERNEL}" is the kernel's own state; pick another module id`);
    if (ids.has(module.id)) throw new Error(`Two modules have the id "${module.id}"`);
    ids.add(module.id);
    for (const [verb, run] of Object.entries(module.actions ?? {})) {
      actions.set(`${module.id}/${name(verb, `${module.id} action`)}`, { module: module.id, run });
    }
    for (const [fact, read] of Object.entries(module.facts ?? {})) {
      facts.set(`${module.id}.${name(fact, `${module.id} fact`)}`, { module: module.id, read });
    }
    for (const [effect, run] of Object.entries(module.effects ?? {})) {
      const owner = effects.get(name(effect, `${module.id} effect`));
      if (owner) throw new Error(`Effect "${effect}" is registered by both ${owner.module} and ${module.id}`);
      effects.set(effect, { module: module.id, run });
    }
  }
  return { modules, actions, facts, effects, modes: expandModes(modules, actions) };
}

function expandModes(modules: readonly Module[], actions: ReadonlyMap<string, unknown>): Map<string, Set<string>> {
  const modes = new Map<string, Set<string>>();
  for (const module of modules) {
    for (const [mode, def] of Object.entries(module.modes ?? {})) {
      if (modes.has(name(mode, `${module.id} mode`))) throw new Error(`Two modules register the mode "${mode}"`);
      const allowed = new Set<string>();
      for (const pattern of def.actions) {
        const matched = [...actions.keys()].filter((type) => matches(pattern, type));
        if (matched.length === 0) throw new Error(`Mode "${mode}" allows "${pattern}", which matches no action`);
        for (const type of matched) allowed.add(type);
      }
      modes.set(mode, allowed);
    }
  }
  return modes;
}

/** "*" matches everything, "crew/*" every action of the crew module, and anything else itself. */
export function matches(pattern: string, type: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('/*')) return type.startsWith(pattern.slice(0, -1));
  return pattern === type;
}

function name(text: string, what: string): string {
  if (!isRecordId(text)) throw new Error(`"${text}" is not a valid ${what}: use kebab-case, like "dead-hauler"`);
  return text;
}
