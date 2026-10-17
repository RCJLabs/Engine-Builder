import { CanonicalError } from '../canonical.ts';
import { Rng, type RngState } from '../rng.ts';
import { cloneJson, freezeJson } from './json.ts';
import { KERNEL, type Registry } from './registry.ts';
import type { GameState, KernelState, ModeFrame, SimContext } from './types.ts';

/** What bringing a state up to date changed. */
export interface MigrationReport {
  /** Slices migrated: the module, the version saved and the version now. */
  readonly migrated: readonly { readonly module: string; readonly from: number; readonly to: number }[];
  /** Modules the state had no slice for, started from their init. */
  readonly added: readonly string[];
  /** Slices that no module in this game owns, kept as they were, with their versions. */
  readonly kept: readonly string[];
}

/** A state this game can't bring up to date: from a newer game, or broken. */
export class MigrationError extends Error {
  /** The state is from a newer game, which can still read it: the player should update, not lose it. */
  readonly newer: boolean;
  constructor(message: string, newer = false) {
    super(message);
    this.name = 'MigrationError';
    this.newer = newer;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Brings a state from an older version of the game up to this one (docs/specs/saves.md). Each
 * slice runs its module's migrations in order from the version it was saved at. A module the
 * state lacks starts from its init, drawing from its own streams as a new game would. A slice no
 * module owns is kept, so a module that comes back finds it. The result is checked and frozen.
 */
export function migrateState(
  registry: Registry,
  raw: unknown,
  sim: SimContext,
): { state: GameState; report: MigrationReport } {
  // A copy, so migrations may change it in place and the caller's state is never frozen.
  const state = cloneJson(raw) as Record<string, unknown>;
  const kernel = checkKernel(state);
  const next: Record<string, unknown> = { ...state };
  const versions: Record<string, number> = { ...kernel.versions };
  const streams = new Map<string, Rng>();
  const migrated: { module: string; from: number; to: number }[] = [];
  const added: string[] = [];
  for (const module of registry.modules) {
    const current = module.version ?? 1;
    if (!(module.id in state)) {
      // Streams as a new game's init would fork them, so the module starts as it would have.
      const rng = (name: string) => {
        const label = `${module.id}/${name}`;
        if (!streams.has(label)) streams.set(label, Rng.create(kernel.seed).fork(label));
        return streams.get(label) as Rng;
      };
      next[module.id] = module.init({ content: sim.content, rng });
      versions[module.id] = current;
      added.push(module.id);
      continue;
    }
    const saved = versions[module.id];
    if (!Number.isSafeInteger(saved) || (saved as number) < 1)
      throw new MigrationError(`The state has no version for its ${module.id} slice`);
    if ((saved as number) > current) {
      throw new MigrationError(
        `The ${module.id} slice is version ${saved}, and this game knows up to ${current}: it needs a newer game`,
        true,
      );
    }
    let slice = state[module.id];
    // The registry checked that every version from 2 up has its migration.
    const migrations = module.migrate ?? {};
    for (let to = (saved as number) + 1; to <= current; to++) {
      slice = (migrations[to] as (slice: unknown) => unknown)(slice);
    }
    if ((saved as number) < current) migrated.push({ module: module.id, from: saved as number, to: current });
    next[module.id] = slice;
    versions[module.id] = current;
  }
  for (const frame of kernel.modes) {
    if (!registry.modes.has(frame.id))
      throw new MigrationError(`The state is in mode "${frame.id}", which this game no longer has`);
  }
  const owned = new Set([KERNEL, ...registry.modules.map((m) => m.id)]);
  const kept = Object.keys(state)
    .filter((key) => !owned.has(key))
    .sort();
  const newStreams = Object.fromEntries([...streams].map(([label, rng]) => [label, rng.toState()]));
  next[KERNEL] = { ...kernel, streams: { ...kernel.streams, ...newStreams }, versions: sortKeys(versions) };
  try {
    freezeJson(next, '');
  } catch (error) {
    if (error instanceof CanonicalError)
      throw new MigrationError(`A migration left something a save can't hold: ${error.message}`);
    throw error;
  }
  return { state: next as GameState, report: { migrated, added, kept } };
}

const sortKeys = (record: Record<string, number>) =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)));

// The kernel's own shape is SAVE_VERSION's to change; here it is only checked.
function checkKernel(raw: unknown): KernelState {
  const fail = (problem: string): never => {
    throw new MigrationError(`The state's kernel ${problem}`);
  };
  if (!isObject(raw) || !isObject(raw[KERNEL])) return fail('is missing');
  const kernel = raw[KERNEL] as Record<string, unknown>;
  if (typeof kernel.seed !== 'string') fail('has no seed');
  if (!Number.isSafeInteger(kernel.step) || (kernel.step as number) < 0) fail('has no step count');
  const modes = kernel.modes;
  if (!Array.isArray(modes) || modes.length === 0 || !modes.every((f) => isObject(f) && typeof f.id === 'string')) {
    fail('has no mode stack');
  }
  if (!isObject(kernel.streams) || !Object.values(kernel.streams).every(isStreamState)) fail('has broken streams');
  if (!isObject(kernel.versions) || !Object.values(kernel.versions).every(Number.isSafeInteger))
    fail('has no versions');
  return kernel as unknown as KernelState & { modes: readonly ModeFrame[] };
}

const isStreamState = (value: unknown): value is RngState =>
  isObject(value) && typeof value.seed === 'string' && Array.isArray(value.s) && value.s.length === 4;
