/**
 * @eb/core: the pure simulation kernel.
 *
 * So far: hashing, seeded random streams (M1.1), state fingerprints (M1.2), record lookups
 * (M1.3), reading content packs (M1.4), the sim kernel: modules, reduce and sessions (M1.5),
 * conditions with their lint, plus the roll effect (M1.6), time: calendars, timers and
 * wall-clock settling (M1.7), and save files with migrations (M1.8). Next in Phase 1: the
 * headless runner (ROADMAP.md, docs/architecture.md).
 */
export { CanonicalError, canonicalJson, pointerSegment } from './canonical.ts';
export { fnv1a32, fnv1a64, hashParts, utf8Length } from './hash.ts';
export * from './logic/index.ts';
export {
  createPack,
  PACK_FORMAT,
  type Pack,
  PackError,
  type PackProject,
  packHash,
  readPack,
} from './pack.ts';
export {
  createRecordStore,
  formatRef,
  isRecordId,
  MAX_ID_LENGTH,
  parseRef,
  QUALIFIED_REF_PATTERN,
  RECORD_ID_PATTERN,
  type RecordKey,
  type RecordPack,
  type RecordStore,
} from './records.ts';
export { Rng, type RngState } from './rng.ts';
export * from './save/index.ts';
export * from './sim/index.ts';
export { type Difference, type FacetReading, firstDifference, readFacets, stateHash } from './stateHash.ts';
export * from './time/index.ts';
