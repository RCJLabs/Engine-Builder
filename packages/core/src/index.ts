/**
 * @eb/core: the pure simulation kernel.
 *
 * So far: hashing and seeded random streams (M1.1). Next in Phase 1: state hashing, records,
 * conditions and effects, reducers and saves (ROADMAP.md, docs/architecture.md).
 */
export { fnv1a32, hashParts } from './hash.ts';
export { Rng, type RngState } from './rng.ts';
