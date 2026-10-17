import type { FactCatalog, FactInfo } from '../logic/types.ts';
import { domainError, FACT_PATTERN, NAME_PATTERN } from '../logic/values.ts';
import { isRecordId } from '../records.ts';
import type { EffectRun, EffectSpec, FactRead, Module } from './module.ts';

/** The module id the kernel's own state uses. */
export const KERNEL = 'kernel';

export interface FactEntry {
  readonly module: string;
  readonly read: FactRead<unknown>;
  readonly info: FactInfo;
}

export interface EffectEntry {
  readonly module: string;
  readonly run: EffectRun<unknown>;
  readonly preview?: EffectSpec<unknown>['preview'];
}

export interface Registry {
  /** In the order given, which is the order their slices are created. */
  readonly modules: readonly Module[];
  readonly actions: ReadonlyMap<
    string,
    { readonly module: string; readonly run: NonNullable<Module['actions']>[string] }
  >;
  readonly facts: ReadonlyMap<string, FactEntry>;
  readonly effects: ReadonlyMap<string, EffectEntry>;
  /** Each mode's allowed action types, with its patterns already expanded. */
  readonly modes: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Indexes the modules and checks every name, so a typo fails when the game is made rather than
 * as an action that is quietly never allowed. Throws on a programmer error.
 */
export function buildRegistry(modules: readonly Module[]): Registry {
  const actions = new Map<string, { module: string; run: NonNullable<Module['actions']>[string] }>();
  const facts = new Map<string, FactEntry>();
  const effects = new Map<string, EffectEntry>();
  const ids = new Set<string>();
  for (const module of modules) {
    name(module.id, 'module id');
    if (module.id === KERNEL) throw new Error(`"${KERNEL}" is the kernel's own state; pick another module id`);
    if (ids.has(module.id)) throw new Error(`Two modules have the id "${module.id}"`);
    ids.add(module.id);
    for (const [verb, run] of Object.entries(module.actions ?? {})) {
      actions.set(`${module.id}/${name(verb, `${module.id} action`)}`, { module: module.id, run });
    }
    for (const [fact, def] of Object.entries(module.facts ?? {})) {
      const id = `${module.id}.${name(fact, `${module.id} fact`)}`;
      const { read, ...info } = typeof def === 'function' ? { read: def } : def;
      checkFact(id, info);
      facts.set(id, { module: module.id, read, info: Object.freeze(info) });
    }
    for (const [effect, def] of Object.entries(module.effects ?? {})) {
      const owner = effects.get(name(effect, `${module.id} effect`));
      if (owner) throw new Error(`Effect "${effect}" is registered by both ${owner.module} and ${module.id}`);
      effects.set(effect, typeof def === 'function' ? { module: module.id, run: def } : { module: module.id, ...def });
    }
  }
  return { modules, actions, facts, effects, modes: expandModes(modules, actions) };
}

/** Every fact by id, sorted, with what its module says about it: what content is checked against. */
export function catalogOf(registry: Registry): FactCatalog {
  const ids = [...registry.facts.keys()].sort();
  return Object.freeze(Object.fromEntries(ids.map((id) => [id, registry.facts.get(id)?.info as FactInfo])));
}

/** A game's fact catalog from its modules alone, for tools that check content without playing. */
export const factCatalog = (modules: readonly Module[]): FactCatalog => catalogOf(buildRegistry(modules));

// A domain that is wrong would make the lint wrong about every condition that reads the fact.
function checkFact(id: string, info: FactInfo): void {
  if (!FACT_PATTERN.test(id)) {
    throw new Error(`Fact "${id}" can't be named in a condition: module ids and fact names start with a letter`);
  }
  for (const [arg, domain] of Object.entries(info.args ?? {})) {
    if (!NAME_PATTERN.test(arg)) throw new Error(`Fact "${id}": "${arg}" is not a valid argument name`);
    const problem = domainError(domain);
    if (problem) throw new Error(`Fact "${id}", argument "${arg}": ${problem}`);
  }
  const problem = info.domain && domainError(info.domain);
  if (problem) throw new Error(`Fact "${id}": ${problem}`);
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
