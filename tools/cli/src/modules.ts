/**
 * Loading the JS or TS modules that tell `eb` about a game: `--types` for record types and the
 * facts, events and effects content is checked against, `--game` for everything `eb sim` needs
 * to play it.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  type EventCatalog,
  eventCatalog,
  type FactCatalog,
  factCatalog,
  isRecordId,
  type MetricSpec,
  type Module,
  type Policy,
} from '@eb/core';
import { effectCatalog, type RecordType, type z } from '@eb/schema';

export class UsageError extends Error {}

/** What `eb sim` plays: the game's modules and start mode, its record types, and its bots and metrics. */
export interface GameModule {
  readonly recordTypes: readonly RecordType[];
  readonly modules: readonly Module[];
  readonly start: string;
  readonly policies: readonly Policy[];
  readonly metrics: readonly MetricSpec[];
  /** The schemas of every effect the game has (M3.1), when it says: content may then name no other. */
  readonly effects?: readonly z.core.$ZodType[];
  /** A project game's effects by name (M3.2), from its modules: content may name no other. */
  readonly effectNames?: readonly string[];
}

/** What `--types` gives: the record types, and the catalogues a game's content is checked against. */
export interface TypesModule {
  readonly types: readonly RecordType[];
  readonly facts?: FactCatalog;
  readonly events?: EventCatalog;
  readonly effects?: readonly z.core.$ZodType[];
}

async function importModule(path: string, flag: string): Promise<Record<string, unknown>> {
  try {
    return await import(pathToFileURL(resolve(path)).href);
  } catch (error) {
    throw new UsageError(`Could not load ${flag} ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// The fields defineRecordType and defineModule leave; validation and createGame check the rest.
const isRecordType = (value: unknown): value is RecordType =>
  typeof value === 'object' && value !== null && 'type' in value && 'schema' in value && 'targets' in value;
const isModule = (value: unknown): value is Module =>
  typeof value === 'object' && value !== null && typeof (value as Module).id === 'string' && 'init' in value;
const isPolicy = (value: unknown): value is Policy =>
  typeof value === 'object' &&
  value !== null &&
  isRecordId((value as Policy).name) &&
  typeof (value as Policy).choose === 'function';
const isMetric = (value: unknown): value is MetricSpec =>
  typeof value === 'string' ||
  (typeof value === 'object' && value !== null && typeof (value as { fact?: unknown }).fact === 'string');

/**
 * `--types`: a module whose recordTypes export lists the record types; whose facts and events
 * exports are the catalogues conditions and rows are checked against, or whose modules export
 * gives them; and whose effects export, if any, lists every effect's schema (M3.1).
 */
export async function loadTypes(path: string): Promise<TypesModule> {
  const loaded = await importModule(path, '--types');
  const types = loaded.recordTypes;
  if (!Array.isArray(types) || !types.every(isRecordType)) {
    throw new UsageError(`${path} must export recordTypes: a list of record types made by defineRecordType`);
  }
  const { facts, events, modules } = loaded;
  const fromModules = Array.isArray(modules) && modules.every(isModule) ? (modules as Module[]) : undefined;
  const catalog = (value: unknown, name: string, made: string) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new UsageError(`${path} exports ${name}, which must be ${made} from @eb/core`);
    }
    return value;
  };
  const effects = effectsOf(loaded.effects, path);
  return {
    types,
    ...(facts !== undefined
      ? { facts: catalog(facts, 'facts', 'a fact catalog: factCatalog(modules)') as FactCatalog }
      : fromModules
        ? { facts: factCatalog(fromModules) }
        : {}),
    ...(events !== undefined
      ? { events: catalog(events, 'events', 'an event catalog: eventCatalog(modules)') as EventCatalog }
      : fromModules
        ? { events: eventCatalog(fromModules) }
        : {}),
    ...(effects ? { effects } : {}),
  };
}

/** An effects export: each effect's schema, checked as validation will read them. */
function effectsOf(effects: unknown, path: string): readonly z.core.$ZodType[] | undefined {
  if (effects === undefined) return undefined;
  if (!Array.isArray(effects)) throw new UsageError(`${path} exports effects, which must be a list of effect schemas`);
  try {
    effectCatalog(effects, true);
  } catch (error) {
    throw new UsageError(`${path} exports effects: ${(error as Error).message}`);
  }
  return effects;
}

/** `--game`: recordTypes, modules and start, and policies and metrics if it has them. */
export async function loadGame(path: string): Promise<GameModule> {
  const loaded = await importModule(path, '--game');
  const fail = (what: string): never => {
    throw new UsageError(`${path} must export ${what}`);
  };
  const { recordTypes, modules, start, policies = [], metrics = [] } = loaded;
  const effects = effectsOf(loaded.effects, path);
  if (!Array.isArray(recordTypes) || !recordTypes.every(isRecordType))
    fail('recordTypes: record types made by defineRecordType');
  if (!Array.isArray(modules) || modules.length === 0 || !modules.every(isModule))
    fail('modules: modules made by defineModule');
  if (typeof start !== 'string') fail('start: the mode a new game starts in');
  if (!Array.isArray(policies) || !policies.every(isPolicy))
    fail('policies, if any: policies such as weightedPolicy(...)');
  if (!Array.isArray(metrics) || !metrics.every(isMetric)) fail('metrics, if any: fact ids, or { fact, args, label }');
  return { recordTypes, modules, start, policies, metrics, ...(effects ? { effects } : {}) } as GameModule;
}
