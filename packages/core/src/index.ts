/**
 * @eb/core: the pure simulation kernel.
 *
 * Phase 0 ships only the hash. Phase 1 adds seeded rng streams, state hashing, records,
 * conditions and effects, reducers and saves (ROADMAP.md, docs/architecture.md).
 */
export { fnv1a32 } from './hash.ts';
