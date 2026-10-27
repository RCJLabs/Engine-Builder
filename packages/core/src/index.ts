/**
 * @eb/core: the pure simulation kernel.
 *
 * So far: hashing, seeded random streams (M1.1), state fingerprints (M1.2), record lookups
 * (M1.3), reading content packs (M1.4), the sim kernel: modules, reduce and sessions (M1.5),
 * conditions with their lint, plus the roll effect (M1.6), time: calendars, timers and
 * wall-clock settling (M1.7), save files with migrations (M1.8), the headless runner: bot
 * policies, seed sweeps and golden files (M1.9), and trigger sheets: events, listeners, flags
 * and sheets (M3.1). The plan is ROADMAP.md; the design, docs/architecture.md.
 */
export { CanonicalError, canonicalJson, pointerKeys, pointerSegment } from './canonical.ts';
export { engineModules } from './engine.ts';
export { fnv1a32, fnv1a64, hashParts, utf8Length } from './hash.ts';
export * from './logic/index.ts';
export {
  createPack,
  PACK_FORMAT,
  type Pack,
  type PackCredit,
  PackError,
  type PackFighting,
  type PackMap,
  type PackProject,
  type PackUi,
  type PackWorld,
  packHash,
  readPack,
} from './pack.ts';
export {
  createRecordStore,
  EVENT_PATTERN,
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
export * from './runner/index.ts';
export * from './save/index.ts';
export * from './sheets/index.ts';
export * from './sim/index.ts';
export { type Difference, type FacetReading, firstDifference, readFacets, stateHash } from './stateHash.ts';
export * from './time/index.ts';
export { type Containers, containerKey, containersOf, holdsAny, NO_CONTAINERS } from './world/containers.ts';
export { type Doors, doorsBetween, doorsOf, doorToward } from './world/doors.ts';
export { ENGAGED_MOST, engaged as npcEngaged } from './world/npcs.ts';
export { hasFlatSpace, worldDataOf } from './world/packWorld.ts';
export { hasTags, NO_PLACES, type PackPlaces, type PlacedTags, type WorldPlaces } from './world/places.ts';
export * from './world/rooms/index.ts';
export { spaceOf, worldStage } from './world/stage.ts';
export * from './world/tiles/index.ts';
export {
  EMPTY_WORLD,
  placeKey,
  type StoodAt,
  type Triggers,
  type TriggerZone,
  type Uses,
  WORLD,
  WORLD_VERSION,
  type WorldData,
  type WorldSlice,
  type WorldUse,
  withPackWorld,
  worldModule,
} from './world/world.ts';
