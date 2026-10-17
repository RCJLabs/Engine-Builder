/**
 * @eb/platform: the browser's side of a game (docs/specs/saves.md). Save slots over IndexedDB,
 * localStorage or memory, with backups and quarantine; save codes; storage persistence. Not
 * pure: it touches storage, so the sim never imports it.
 */
export { type Decoded, decodeSaveCode, encodeSaveCode, MAX_CODE_BYTES } from './codes.ts';
export type { QuarantineReason } from './doubts.ts';
export { indexedDbStore } from './indexeddb.ts';
export type { SlotSummary } from './listing.ts';
export { openStore, type Persistence, requestPersistence } from './open.ts';
export type { Quarantined } from './quarantine.ts';
export {
  createSaves,
  MAX_LOG,
  type Saves,
  type SavesOptions,
  type SlotLoad,
  type WriteResult,
} from './saves.ts';
export { localStore, memoryStore, type Store, StoreError, type StoreFailure, storeError } from './store.ts';
