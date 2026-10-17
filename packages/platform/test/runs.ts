/** Salvage-run sessions and saves of them, which the platform tests share. */
import { type Action, createSaveFile, createSession, type SaveFile, stateHash } from '@eb/core';
import { IDBFactory } from 'fake-indexeddb';
import { botAction, botFor, game, sim } from '../../core/test/salvage.ts';
import { indexedDbStore, localStore, memoryStore, type Store } from '../src/index.ts';
import { FakeStorage } from './fake-storage.ts';

export { game, sim };
export const BUILD = 'test';
export const SLOT = 'eb/salvage-run/full/slot/slot-1';
export const BACKUP = 'eb/salvage-run/full/backup/slot-1';
export const SUMMARY = 'eb/salvage-run/full/summary/slot-1';

export const info = (savedAt: number, build = BUILD) => ({
  game: 'salvage-run',
  edition: 'full',
  build,
  savedAt,
  summary: { savedAt },
});

/** A run the test bot plays from `seed`, for at most `limit` actions. */
export function play(seed: string, limit = 400) {
  const session = createSession(game, sim, game.init(seed, sim));
  const bot = botFor(seed);
  for (let n = 0; n < limit; n++) {
    const action = botAction(session.state, game.allowedActions(session.state), bot);
    if (!action) break;
    session.dispatch(action as Action);
  }
  return session;
}

export const saveOf = (session: ReturnType<typeof play>, savedAt = 1, build = BUILD): SaveFile =>
  createSaveFile({ snapshot: session.start, log: session.log, state: session.state }, info(savedAt, build));

/** A save file with `change` made to it and its checksum made right again, so only the change is wrong. */
export function edited(file: SaveFile, change: (body: Record<string, unknown>) => void): SaveFile {
  const { check: _, ...body } = structuredClone(file) as unknown as Record<string, unknown>;
  change(body);
  return { ...body, check: stateHash(body) } as unknown as SaveFile;
}

export const stores: [string, () => Promise<Store>][] = [
  ['memory', async () => memoryStore()],
  ['localStorage', async () => localStore(new FakeStorage())],
  ['IndexedDB', () => indexedDbStore('saves', new IDBFactory())],
];
