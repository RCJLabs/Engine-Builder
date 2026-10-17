/**
 * @eb/core: the pure simulation kernel.
 *
 * So far: hashing, seeded random streams (M1.1), state fingerprints (M1.2), record lookups
 * (M1.3) and reading content packs (M1.4). Next in Phase 1: reducers and the module API,
 * conditions and effects, time and saves (ROADMAP.md, docs/architecture.md).
 */
export { CanonicalError, canonicalJson, pointerSegment } from './canonical.ts';
export { fnv1a32, fnv1a64, hashParts, utf8Length } from './hash.ts';
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
export { type Difference, type FacetReading, firstDifference, readFacets, stateHash } from './stateHash.ts';
