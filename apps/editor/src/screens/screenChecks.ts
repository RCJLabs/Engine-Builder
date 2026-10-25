/**
 * The screens' problems in the editor (M4.1, D51), the feedback's with them (M4.2): the files under ui/ read and checked as
 * compileProject checks them (checkProjectUi), against the game once its scripts have run, each
 * at its line in its file. Read again after every change, once the record index is, since a
 * screen's facts can name records.
 */
import { checkProjectUi, type ProjectSource, readUi, screenReads, withScreens } from '@eb/compiler';
import { type Diagnostic, type FlagUses, knownFrom, recordFieldsOf } from '@eb/schema';
import type { Catalog } from '../forms/catalog.ts';
import { recordLookup } from '../records/lookup.ts';
import type { RecordIndex } from '../records/recordIndex.ts';
import { type GameState, gameChecks } from '../scripts/gameState.ts';

// export.json's checks (M4.10) load with these: both run once the record index is read.
export { exportProblems } from '../export/exportChecks.ts';
export { guideProblems } from '../guide/guideChecks.ts';
// And the model records' files' (M5.5).
export { modelProblems } from '../models/modelChecks.ts';
// The spaces' checks that read records (M5.2) load with these too.
export { spaceProblems } from '../spaces/spaceChecks.ts';

export interface ScreenChecks {
  readonly problems: readonly Diagnostic[];
  /** The flags the screens' conditions read (M5.8), for the flags' lint. */
  readonly reads: ReadonlyMap<string, ReadonlySet<string>>;
}

export async function screenProblems(
  source: ProjectSource,
  catalog: Catalog,
  index: RecordIndex,
  game: GameState,
): Promise<ScreenChecks> {
  if (catalog.screens.length === 0 && !catalog.theme && !catalog.feedback && !catalog.shell)
    return { problems: [], reads: new Map() };
  const read = await readUi(source);
  const calendar = catalog.calendar ? { calendar: catalog.calendar } : {};
  const known = knownFrom({ ...gameChecks(game), kits: catalog.kits, ...calendar });
  const reads = screenReads(known.facts);
  const found = checkProjectUi(read, {
    facts: known.facts,
    openFacts: known.openFacts,
    kits: catalog.kits,
    ...(game.catalog ? { actions: game.catalog.actions, modes: game.catalog.modes, events: game.catalog.events } : {}),
    records: recordLookup(index),
    assets: new Set(catalog.assets),
    recordFields: recordFieldsOf(catalog.recordTypes),
    spaces: new Set(catalog.spaces.map((entry) => entry.id)),
    read: reads.read,
  });
  // The catalog has W132 already, as it has W131 for scenes.
  return { problems: [...read.diagnostics.filter((d) => d.code !== 'W132'), ...found], reads: reads.found };
}

/** The flags the zones and the screens set and read, as the flags' lint counts them (M5.8). */
export const flagsElsewhere = (spaces: { readonly flags: FlagUses }, screens: ScreenChecks): FlagUses =>
  withScreens(spaces.flags, screens.reads);
