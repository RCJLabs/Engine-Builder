/**
 * Save slots for one game and edition (docs/specs/saves.md). Every key starts with
 * `eb/<game>/<edition>/`, because every game on an origin shares its storage. A save that won't
 * load, or that a write would destroy, is copied to quarantine first: a save is never lost to a
 * bug, an old build or another tab.
 */
import {
  createSaveFile,
  type Game,
  isRecordId,
  type LoadReport,
  type LoadResult,
  loadSave,
  type SaveFile,
  type SaveInfo,
  type SaveProblem,
  type Session,
  type SimContext,
  verifySaveFile,
} from '@eb/core';
import { parse, type QuarantineReason, replaceDoubt } from './doubts.ts';
import { listSlots, type SlotSummary } from './listing.ts';
import { type Quarantined, quarantineIn } from './quarantine.ts';
import { type Store, type StoreFailure, storeError } from './store.ts';

/** How many logged actions a save may reach before writeSession compacts its session. */
export const MAX_LOG = 200;

export interface SavesOptions {
  readonly store: Store;
  readonly game: string;
  readonly edition: string;
  /** writeSession compacts a session after a write that saved this many actions or more. MAX_LOG by default. */
  readonly maxLog?: number;
  /** Hears about every write that fails, so the stage can tell the player instead of losing progress quietly. */
  readonly onFailure?: (failure: {
    readonly slot: string;
    readonly reason: StoreFailure;
    readonly message: string;
  }) => void;
}

export type WriteResult =
  | {
      readonly ok: true;
      /** Where the save this write replaced went, when it couldn't simply be replaced. */
      readonly quarantined?: string;
    }
  | { readonly ok: false; readonly reason: StoreFailure; readonly message: string };

type Loaded = Extract<LoadResult, { ok: true }>;
type Failed = { readonly ok: false; readonly problem: SaveProblem | 'crashed'; readonly message: string };
type Read = LoadResult | Failed;

/** What a reader made of a save's text: what `loadSave` says, with or without the state (M4.3). */
export type Readable = { readonly ok: true; readonly file: SaveFile; readonly report: LoadReport } | Failed;

/** A slot's save read by `loadWith`'s reader, or why it wasn't. */
export type SlotRead<T> =
  | (Extract<T, { ok: true }> & { readonly fromBackup?: true; readonly quarantined?: string })
  | {
      readonly ok: false;
      readonly problem: SaveProblem | 'empty' | 'crashed';
      readonly message: string;
      readonly quarantined?: string;
    };

export type SlotLoad =
  | (Loaded & {
      /** The slot's save would not load, and this is the one before it. */
      readonly fromBackup?: true;
      /** Where a copy of the slot's save went: it would not load, or loading changed it. */
      readonly quarantined?: string;
    })
  | {
      readonly ok: false;
      readonly problem: SaveProblem | 'empty' | 'crashed';
      readonly message: string;
      readonly quarantined?: string;
    };

/**
 * Writes report a failure in their result and to `onFailure`, because a save that fails quietly
 * costs the player progress. Reads that storage refuses throw a StoreError: there is nothing to show.
 */
export interface Saves {
  /** Every slot, the most recent first, from the summaries written beside the saves. */
  list(): Promise<SlotSummary[]>;
  write(slot: string, file: SaveFile): Promise<WriteResult>;
  /** Saves a session, then compacts it once its log has reached `maxLog`, so saves stop growing. */
  writeSession(slot: string, session: Session, info: Omit<SaveInfo, 'game' | 'edition'>): Promise<WriteResult>;
  load(slot: string, game: Game, sim: SimContext, build: string): Promise<SlotLoad>;
  /**
   * As `load`, with the save's text read by `read`: where the game runs apart from storage, as a
   * game's worker does (M4.3), the page keeps the saves and the worker reads them.
   */
  loadWith<T extends Readable>(slot: string, build: string, read: (raw: string) => Promise<T>): Promise<SlotRead<T>>;
  /** The slot's save as it is stored, unread: to save as a file, even one that won't load. */
  raw(slot: string): Promise<string | undefined>;
  remove(slot: string): Promise<WriteResult>;
  quarantined(): Promise<Quarantined[]>;
  /** Removes a quarantined copy, which only the player does, once they have saved it out. */
  forget(key: string): Promise<WriteResult>;
}

// The problems that mean the slot's save is broken, so the one before it is worth trying. A
// newer save is not broken: the player should update rather than play on from an older one.
const FALLS_BACK: ReadonlySet<string> = new Set([
  'damaged',
  'other-game',
  'cannot-migrate',
  'replay-differs',
  'crashed',
]);

export function createSaves(options: SavesOptions): Saves {
  const { store, game, edition, maxLog = MAX_LOG } = options;
  if (!isRecordId(game) || !isRecordId(edition))
    throw new RangeError('createSaves(): game and edition are kebab-case ids');
  const prefix = `eb/${game}/${edition}/`;
  const keyOf = (kind: 'slot' | 'summary' | 'backup', slot: string) => {
    if (!isRecordId(slot)) throw new RangeError(`"${slot}" is not a valid slot name: use kebab-case`);
    return `${prefix}${kind}/${slot}`;
  };
  const quarantine = quarantineIn(store, prefix);
  // The checksum of each slot's save as this tab last saw it, to notice when another tab wrote since.
  const seen = new Map<string, string>();

  // The one way writes reach storage: whatever fails in `work` is reported, never thrown.
  const guarded = async (slot: string, work: () => Promise<WriteResult>): Promise<WriteResult> => {
    try {
      return await work();
    } catch (error) {
      const failure = storeError(error);
      options.onFailure?.({ slot, reason: failure.reason, message: failure.message });
      return { ok: false, reason: failure.reason, message: failure.message };
    }
  };

  const keep = async (slot: string, raw: string, problem: QuarantineReason, message: string) => {
    let kept: string | undefined;
    await guarded(slot, async () => {
      const entry = await quarantine.entryFor(slot, raw, problem, message);
      if (Object.keys(entry.entries).length > 0) await store.write(entry.entries);
      kept = entry.key;
      return { ok: true };
    });
    return kept;
  };

  const readIn = (raw: string, gameDef: Game, sim: SimContext, build: string): Read => {
    const parsed = parse(raw);
    if (parsed === undefined) return { ok: false, problem: 'damaged', message: 'The save is not JSON' };
    try {
      return loadSave(gameDef, parsed, sim, { game, build });
    } catch (error) {
      return {
        ok: false,
        problem: 'crashed',
        message: `The game failed while loading the save: ${(error as Error).message}`,
      };
    }
  };

  // A load that changed the save keeps the original, which a later build may read better.
  const loaded = async <T extends Extract<Readable, { ok: true }>>(
    slot: string,
    raw: string,
    result: T,
    build: string,
  ) => {
    seen.set(slot, result.file.check);
    if (!result.report.differs && result.report.skipped === 0) return result;
    const quarantined = await keep(slot, raw, 'changed', changeOf(result.report, build));
    return quarantined ? { ...result, quarantined } : (result as T & { readonly quarantined?: string });
  };

  // A slot's save, or its backup when the save is broken, read by `read`; what won't load is kept.
  const loadFrom = async <T extends Readable>(slot: string, build: string, read: (raw: string) => Promise<T>) => {
    const raw = await store.get(keyOf('slot', slot));
    if (raw === undefined) return { ok: false, problem: 'empty', message: `Slot ${slot} is empty` } as const;
    const result = await read(raw);
    if (result.ok) return loaded(slot, raw, result as Extract<T, { ok: true }>, build);
    const quarantined = await keep(slot, raw, result.problem, result.message);
    const failed = quarantined ? { ...result, quarantined } : result;
    const backup = FALLS_BACK.has(result.problem) ? await store.get(keyOf('backup', slot)) : undefined;
    if (backup === undefined) return failed as Extract<T, { ok: false }>;
    const fallback = await read(backup);
    if (!fallback.ok) {
      await keep(slot, backup, fallback.problem, `The backup: ${fallback.message}`);
      return failed as Extract<T, { ok: false }>;
    }
    // Seen as the backup, so the next write quarantines the broken save rather than backing it up.
    const settled = await loaded(slot, backup, fallback as Extract<T, { ok: true }>, build);
    return { ...settled, fromBackup: true as const, ...(quarantined ? { quarantined } : {}) };
  };

  // Async, so a bad slot or file rejects like any other failure rather than throwing at the call.
  const write = async (slot: string, file: SaveFile): Promise<WriteResult> => {
    if (file.game !== game || file.edition !== edition)
      throw new RangeError(`A save of ${file.game}/${file.edition} can't go in ${game}/${edition}`);
    const verified = verifySaveFile(file, game);
    if (!verified.ok) throw new RangeError(`write(): not a save to keep: ${verified.message}`);
    const slotKey = keyOf('slot', slot);
    const raw = JSON.stringify(file);
    return guarded(slot, async () => {
      const existing = await store.get(slotKey);
      const doubt = existing === undefined ? undefined : replaceDoubt(existing, file, seen.get(slot), game);
      // Quarantine first, then the backup, so a localStorage write cut short loses nothing.
      const entries: Record<string, string> = {};
      let quarantined: string | undefined;
      if (existing !== undefined && doubt) {
        const entry = await quarantine.entryFor(slot, existing, doubt.problem, doubt.message);
        Object.assign(entries, entry.entries);
        quarantined = entry.key;
      } else if (existing !== undefined && existing !== raw) {
        entries[keyOf('backup', slot)] = existing;
      }
      entries[slotKey] = raw;
      const summary = { slot, savedAt: file.savedAt, build: file.build, summary: file.summary ?? {} };
      entries[keyOf('summary', slot)] = JSON.stringify(summary);
      await store.write(entries);
      seen.set(slot, file.check);
      return quarantined ? { ok: true, quarantined } : { ok: true };
    });
  };

  return {
    list: () => listSlots(store, prefix),
    write,
    quarantined: () => quarantine.list(),

    async writeSession(slot, session, info) {
      const run = { snapshot: session.start, log: session.log, state: session.state };
      const file = createSaveFile(run, { ...info, game, edition });
      const result = await write(slot, file);
      if (result.ok && file.log.length >= maxLog) session.compact();
      return result;
    },

    load: (slot, gameDef, sim, build) =>
      loadFrom(slot, build, async (raw) => readIn(raw, gameDef, sim, build)) as Promise<SlotLoad>,

    loadWith: (slot, build, read) => loadFrom(slot, build, read) as Promise<SlotRead<never>>,

    raw: (slot) => store.get(keyOf('slot', slot)),

    forget: (key) =>
      guarded(key, async () => {
        if (!key.startsWith(`${prefix}quarantine/`)) throw new RangeError(`"${key}" is not a quarantined save`);
        await store.write({ [key]: undefined });
        return { ok: true };
      }),

    async remove(slot) {
      const keys = [keyOf('slot', slot), keyOf('summary', slot), keyOf('backup', slot)];
      return guarded(slot, async () => {
        await store.write(Object.fromEntries(keys.map((key) => [key, undefined])));
        seen.delete(slot);
        return { ok: true };
      });
    },
  };
}

function changeOf(report: LoadReport, build: string): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const parts = [
    ...report.migrated.map((m) => `migrated ${m.module} from version ${m.from} to ${m.to}`),
    ...report.added.map((module) => `added ${module}`),
    ...(report.skipped > 0 ? [`skipped ${plural(report.skipped, 'logged action')}`] : []),
  ];
  if (parts.length === 0) parts.push('its log played out otherwise');
  return `The save as it was before build ${build} loaded it, which ${parts.join(', ')}`;
}
