import type { FactCatalog, FactInfo } from '../logic/types.ts';
import { domainError, FACT_PATTERN, NAME_PATTERN } from '../logic/values.ts';
import { isRecordId } from '../records.ts';
import { DEBUG, isDebugModule } from './debug.ts';
import { type EventCatalog, type EventInfo, eventInfoError } from './events.ts';
import type { Maker } from './made.ts';
import type { ActionRun, ActionSpec, EffectRun, EffectSpec, FactRead, Listener, Module } from './module.ts';

/** The module id the kernel's own state uses. */
export const KERNEL = 'kernel';

export interface FactEntry {
  readonly module: string;
  readonly read: FactRead<unknown>;
  readonly info: FactInfo;
}

export interface ActionEntry {
  readonly module: string;
  readonly run: ActionRun<unknown>;
  readonly options?: ActionSpec<unknown>['options'];
  /** The debug step (M4.9): allowed in every mode, and in no mode's list, so nothing offers it. */
  readonly anyMode?: true;
}

export interface EffectEntry {
  readonly module: string;
  readonly run: EffectRun<unknown>;
  readonly preview?: EffectSpec<unknown>['preview'];
}

export interface EventEntry {
  readonly module: string;
  readonly info: EventInfo;
}

export interface ListenerEntry {
  readonly module: string;
  readonly run: Listener<unknown>;
}

export interface Registry {
  /** In the order given, which is the order their slices are created. */
  readonly modules: readonly Module[];
  readonly actions: ReadonlyMap<string, ActionEntry>;
  readonly facts: ReadonlyMap<string, FactEntry>;
  readonly effects: ReadonlyMap<string, EffectEntry>;
  readonly events: ReadonlyMap<string, EventEntry>;
  /** Each event's listeners, in module order: a module's own entry for it, or else its "*". */
  readonly listeners: ReadonlyMap<string, readonly ListenerEntry[]>;
  /** Each mode's allowed action types, with its patterns already expanded. */
  readonly modes: ReadonlyMap<string, ReadonlySet<string>>;
  /** The modules that make records in play, in module order (D44). */
  readonly makers: readonly Maker[];
}

/**
 * Indexes the modules and checks every name, so a typo fails when the game is made rather than
 * as an action that is quietly never allowed. Throws on a programmer error.
 */
export function buildRegistry(modules: readonly Module[]): Registry {
  const actions = new Map<string, ActionEntry>();
  const facts = new Map<string, FactEntry>();
  const effects = new Map<string, EffectEntry>();
  const events = new Map<string, EventEntry>();
  const ids = new Set<string>();
  for (const module of modules) {
    name(module.id, 'module id');
    if (module.id === KERNEL) throw new Error(`"${KERNEL}" is the kernel's own state; pick another module id`);
    const debug = isDebugModule(module);
    if (module.id === DEBUG && !debug)
      throw new Error(`"${DEBUG}" is the editor's debug step (M4.9); pick another module id`);
    if (ids.has(module.id)) throw new Error(`Two modules have the id "${module.id}"`);
    ids.add(module.id);
    checkVersion(module);
    if (module.start !== undefined && typeof module.start !== 'function') {
      throw new Error(`Module "${module.id}": start must be a function`);
    }
    for (const [verb, def] of Object.entries(module.actions ?? {})) {
      const type = `${module.id}/${name(verb, `${module.id} action`)}`;
      const spec = typeof def === 'function' ? { run: def } : def;
      if (typeof spec.run !== 'function') throw new Error(`Action "${type}" has no run function`);
      if (spec.options !== undefined && typeof spec.options !== 'function') {
        throw new Error(`Action "${type}": options must be a function`);
      }
      actions.set(type, {
        module: module.id,
        run: spec.run,
        ...(spec.options ? { options: spec.options } : {}),
        ...(debug ? { anyMode: true as const } : {}),
      });
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
    for (const [event, info] of Object.entries(module.events ?? {})) {
      const id = `${module.id}/${name(event, `${module.id} event`)}`;
      const problem = eventInfoError(info);
      if (problem) throw new Error(`Event "${id}": ${problem}`);
      events.set(id, { module: module.id, info: Object.freeze({ ...info }) });
    }
  }
  const listeners = listenersOf(modules, events);
  const makers = makersOf(modules);
  return { modules, actions, facts, effects, events, listeners, modes: expandModes(modules, actions), makers };
}

function makersOf(modules: readonly Module[]): Maker[] {
  return modules.flatMap((module) => {
    const spec = module.made;
    if (spec === undefined) return [];
    if (!Array.isArray(spec.types) || spec.types.length === 0 || !spec.types.every(isRecordId)) {
      throw new Error(`Module "${module.id}": made.types must list the record types it makes`);
    }
    if (typeof spec.ids !== 'function' || typeof spec.get !== 'function') {
      throw new Error(`Module "${module.id}": made needs ids and get functions`);
    }
    return [{ module: module.id, spec }];
  });
}

// A listener for an event nobody declares would never run, which is a typo found too late.
function listenersOf(modules: readonly Module[], events: ReadonlyMap<string, EventEntry>) {
  const listeners = new Map<string, ListenerEntry[]>([...events.keys()].map((id) => [id, []]));
  for (const module of modules) {
    const on = module.on ?? {};
    for (const [key, run] of Object.entries(on)) {
      if (key !== '*' && !events.has(key))
        throw new Error(`Module "${module.id}" listens for "${key}", which no module declares`);
      if (typeof run !== 'function')
        throw new Error(`Module "${module.id}": its listener for "${key}" must be a function`);
    }
    for (const [id, list] of listeners) {
      const run = on[id] ?? on['*'];
      if (run) list.push({ module: module.id, run });
    }
  }
  return listeners;
}

/** Each module's slice version, by module id in sorted order. */
export const versionsOf = (registry: Registry): Record<string, number> =>
  Object.fromEntries(registry.modules.map((m) => [m.id, m.version ?? 1] as const).sort(([a], [b]) => (a < b ? -1 : 1)));

/** Every fact by id, sorted, with what its module says about it: what content is checked against. */
export function catalogOf(registry: Registry): FactCatalog {
  const ids = [...registry.facts.keys()].sort();
  return Object.freeze(Object.fromEntries(ids.map((id) => [id, registry.facts.get(id)?.info as FactInfo])));
}

/** A game's fact catalog from its modules alone, for tools that check content without playing. */
export const factCatalog = (modules: readonly Module[]): FactCatalog => catalogOf(buildRegistry(modules));

/** Every event by id, sorted, with its arguments: what rows' When is checked against. */
export function eventsOf(registry: Registry): EventCatalog {
  const ids = [...registry.events.keys()].sort();
  return Object.freeze(Object.fromEntries(ids.map((id) => [id, registry.events.get(id)?.info as EventInfo])));
}

/** A game's event catalog from its modules alone, as factCatalog is for facts. */
export const eventCatalog = (modules: readonly Module[]): EventCatalog => eventsOf(buildRegistry(modules));

// A gap in the migrations would leave saves from the version before it unable to load.
function checkVersion(module: Module): void {
  const version = module.version ?? 1;
  if (!Number.isSafeInteger(version) || version < 1)
    throw new Error(`Module "${module.id}": version must be a whole number, at least 1`);
  for (const key of Object.keys(module.migrate ?? {})) {
    const to = Number(key);
    if (!Number.isSafeInteger(to) || to < 2 || to > version) {
      throw new Error(`Module "${module.id}" has a migration to ${key}, but its versions run from 1 to ${version}`);
    }
  }
  for (let to = 2; to <= version; to++) {
    if (typeof module.migrate?.[to] !== 'function') {
      throw new Error(
        `Module "${module.id}" is version ${version} but has no migration to ${to}: saves of version ${to - 1} could not load`,
      );
    }
  }
}

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

function expandModes(modules: readonly Module[], actions: ReadonlyMap<string, ActionEntry>): Map<string, Set<string>> {
  const modes = new Map<string, Set<string>>();
  // The debug step is in no mode's list, "*" included, so options() never offers it.
  const listed = [...actions].filter(([, entry]) => !entry.anyMode).map(([type]) => type);
  for (const module of modules) {
    for (const [mode, def] of Object.entries(module.modes ?? {})) {
      if (modes.has(name(mode, `${module.id} mode`))) throw new Error(`Two modules register the mode "${mode}"`);
      const allowed = new Set<string>();
      for (const pattern of def.actions) {
        const matched = listed.filter((type) => matches(pattern, type));
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
