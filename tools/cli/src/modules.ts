/**
 * Loading the JS or TS modules that tell `eb` about a game: `--types` for record types and facts,
 * `--game` for everything `eb sim` needs to play it.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type FactCatalog, factCatalog, isRecordId, type MetricSpec, type Module, type Policy } from '@eb/core';
import type { RecordType } from '@eb/schema';

export class UsageError extends Error {}

/** What `eb sim` plays: the game's modules and start mode, its record types, and its bots and metrics. */
export interface GameModule {
  readonly recordTypes: readonly RecordType[];
  readonly modules: readonly Module[];
  readonly start: string;
  readonly policies: readonly Policy[];
  readonly metrics: readonly MetricSpec[];
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
 * `--types`: a module whose recordTypes export lists the record types, and whose facts export is
 * the fact catalog conditions are checked against, or whose modules export gives one.
 */
export async function loadTypes(path: string): Promise<{ types: readonly RecordType[]; facts?: FactCatalog }> {
  const loaded = await importModule(path, '--types');
  const types = loaded.recordTypes;
  if (!Array.isArray(types) || !types.every(isRecordType)) {
    throw new UsageError(`${path} must export recordTypes: a list of record types made by defineRecordType`);
  }
  const { facts, modules } = loaded;
  if (facts === undefined) {
    return Array.isArray(modules) && modules.every(isModule) ? { types, facts: factCatalog(modules) } : { types };
  }
  if (typeof facts !== 'object' || facts === null || Array.isArray(facts)) {
    throw new UsageError(`${path} exports facts, which must be a fact catalog: factCatalog(modules) from @eb/core`);
  }
  return { types, facts: facts as FactCatalog };
}

/** `--game`: recordTypes, modules and start, and policies and metrics if it has them. */
export async function loadGame(path: string): Promise<GameModule> {
  const loaded = await importModule(path, '--game');
  const fail = (what: string): never => {
    throw new UsageError(`${path} must export ${what}`);
  };
  const { recordTypes, modules, start, policies = [], metrics = [] } = loaded;
  if (!Array.isArray(recordTypes) || !recordTypes.every(isRecordType))
    fail('recordTypes: record types made by defineRecordType');
  if (!Array.isArray(modules) || modules.length === 0 || !modules.every(isModule))
    fail('modules: modules made by defineModule');
  if (typeof start !== 'string') fail('start: the mode a new game starts in');
  if (!Array.isArray(policies) || !policies.every(isPolicy))
    fail('policies, if any: policies such as weightedPolicy(...)');
  if (!Array.isArray(metrics) || !metrics.every(isMetric)) fail('metrics, if any: fact ids, or { fact, args, label }');
  return { recordTypes, modules, start, policies, metrics } as GameModule;
}
