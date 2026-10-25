/**
 * The spaces' and prefabs' problems that need the records (M5.2, D64): components against their
 * kinds, placed records and every override, as compileProject checks them (checkProjectSpaceParts),
 * and every reference they hold, which "used by" lists beside the records'. Read again after every
 * change, once the record index is.
 */
import {
  checkNavFiles,
  checkProjectSpaceParts,
  modelFieldOf,
  navHashes,
  navModelsOf,
  type ProjectSource,
  readSpaces,
  type SpaceJson,
  type SpaceUse,
  spaceSpawns,
  walkersOf,
} from '@eb/compiler';
import { compareText, type Diagnostic, type FlagUses, knownFrom } from '@eb/schema';
import type { Catalog } from '../forms/catalog.ts';
import { recordLookup } from '../records/lookup.ts';
import type { RecordIndex } from '../records/recordIndex.ts';
import { type GameState, gameChecks } from '../scripts/gameState.ts';

export interface SpaceChecks {
  readonly problems: readonly Diagnostic[];
  /** What names each "type:id", by file and path. */
  readonly users: ReadonlyMap<string, readonly SpaceUse[]>;
  /**
   * The flags the trigger zones set and read (M5.8), for the flags' lint; what the zones and
   * interacts hold and each space's spawn points (M5.9), and where each actor stands (M6.2), for
   * the records' checks.
   */
  readonly flags: FlagUses;
}

export const NO_FLAG_USES: FlagUses = { set: new Map(), read: new Map() };

export async function spaceProblems(
  source: ProjectSource,
  catalog: Catalog,
  index: RecordIndex,
  game: GameState,
): Promise<SpaceChecks> {
  if (catalog.spaces.length === 0 && catalog.prefabs.length === 0)
    return { problems: [], users: new Map(), flags: NO_FLAG_USES };
  const read = await readSpaces(source);
  const spawns = spaceSpawns(read.files);
  const prefabs = new Map(
    read.files.filter((f) => f.kind === 'prefab' && f.value !== undefined).map((f) => [f.id, f.value as SpaceJson]),
  );
  const navved = new Set(read.navs.filter((nav) => nav.header !== null).map((nav) => nav.id));
  const walkers = walkersOf(read.files, prefabs, navved);
  const calendar = catalog.calendar ? { calendar: catalog.calendar } : {};
  const value = (type: string, id: string) => {
    const record = index.records.get(`${type}:${id}`);
    return record?.unreadable === undefined ? record?.value : undefined;
  };
  const found = checkProjectSpaceParts(read.files, {
    types: new Map(catalog.recordTypes.map((t) => [t.type, t])),
    records: recordLookup(index),
    value,
    known: knownFrom({ ...gameChecks(game), kits: catalog.kits, ...calendar }),
    kinds: catalog.components,
    uncheckedKinds: new Set(catalog.componentFiles.filter((kind) => !catalog.components.has(kind))),
    assets: new Set(catalog.assets),
    spaces: spawns,
    walkers,
  });
  // A navmesh baked from the space as it stands now (M6.2), as the compiler checks it.
  const models = navModelsOf({
    record: (key) => value(key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)),
    field: (type) => {
      const file = catalog.types.get(type)?.file;
      return file ? modelFieldOf(file) : null;
    },
  });
  const hashes = await navHashes(source, read.files, read.navs, models);
  const navs = checkNavFiles(read.navs, new Set(spawns.keys()), hashes);
  const users = new Map<string, SpaceUse[]>();
  for (const use of found.uses) users.set(use.key, [...(users.get(use.key) ?? []), use]);
  for (const list of users.values()) list.sort((a, b) => compareText(a.file, b.file) || compareText(a.path, b.path));
  return { problems: [...found.diagnostics, ...navs], users, flags: { ...found.flags, spawns, walkers } };
}
