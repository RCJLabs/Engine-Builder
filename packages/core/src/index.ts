/**
 * @eb/core: the pure simulation kernel.
 *
 * So far: hashing, seeded random streams (M1.1) and state fingerprints (M1.2). Next in Phase 1:
 * records, conditions and effects, reducers and saves (ROADMAP.md, docs/architecture.md).
 */
export { CanonicalError, canonicalJson, pointerSegment } from './canonical.ts';
export { fnv1a32, fnv1a64, hashParts, utf8Length } from './hash.ts';
export { Rng, type RngState } from './rng.ts';
export { type Difference, type FacetReading, firstDifference, readFacets, stateHash } from './stateHash.ts';
