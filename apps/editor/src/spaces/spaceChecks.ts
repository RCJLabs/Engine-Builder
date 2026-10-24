/**
 * The spaces' and prefabs' problems that need the records (M5.2, D64): components against their
 * kinds, placed records and every override, as compileProject checks them (checkProjectSpaceParts),
 * and every reference they hold, which "used by" lists beside the records'. Read again after every
 * change, once the record index is.
 */
import { checkProjectSpaceParts, type ProjectSource, readSpaces, type SpaceUse } from '@eb/compiler';
import { compareText, type Diagnostic, knownFrom } from '@eb/schema';
import type { Catalog } from '../forms/catalog.ts';
import { recordLookup } from '../records/lookup.ts';
import type { RecordIndex } from '../records/recordIndex.ts';
import { type GameState, gameChecks } from '../scripts/gameState.ts';

export interface SpaceChecks {
  readonly problems: readonly Diagnostic[];
  /** What names each "type:id", by file and path. */
  readonly users: ReadonlyMap<string, readonly SpaceUse[]>;
}

export async function spaceProblems(
  source: ProjectSource,
  catalog: Catalog,
  index: RecordIndex,
  game: GameState,
): Promise<SpaceChecks> {
  if (catalog.spaces.length === 0 && catalog.prefabs.length === 0) return { problems: [], users: new Map() };
  const read = await readSpaces(source);
  const calendar = catalog.calendar ? { calendar: catalog.calendar } : {};
  const found = checkProjectSpaceParts(read.files, {
    types: new Map(catalog.recordTypes.map((t) => [t.type, t])),
    records: recordLookup(index),
    value: (type, id) => {
      const record = index.records.get(`${type}:${id}`);
      return record?.unreadable === undefined ? record?.value : undefined;
    },
    known: knownFrom({ ...gameChecks(game), kits: catalog.kits, ...calendar }),
    kinds: catalog.components,
    uncheckedKinds: new Set(catalog.componentFiles.filter((kind) => !catalog.components.has(kind))),
    assets: new Set(catalog.assets),
  });
  const users = new Map<string, SpaceUse[]>();
  for (const use of found.uses) users.set(use.key, [...(users.get(use.key) ?? []), use]);
  for (const list of users.values()) list.sort((a, b) => compareText(a.file, b.file) || compareText(a.path, b.path));
  return { problems: found.diagnostics, users };
}
