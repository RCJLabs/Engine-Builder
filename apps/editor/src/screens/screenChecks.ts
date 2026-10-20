/**
 * The screens' problems in the editor (M4.1, D51), the feedback's with them (M4.2): the files under ui/ read and checked as
 * compileProject checks them (checkProjectUi), against the game once its scripts have run, each
 * at its line in its file. Read again after every change, once the record index is, since a
 * screen's facts can name records.
 */
import { checkProjectUi, type ProjectSource, readUi } from '@eb/compiler';
import type { RecordIndex as RecordLookup } from '@eb/core';
import { type Diagnostic, knownFrom, recordFieldsOf } from '@eb/schema';
import type { Catalog } from '../forms/catalog.ts';
import type { RecordIndex } from '../records/recordIndex.ts';
import { type GameState, gameChecks } from '../scripts/gameState.ts';

/** The index's records, as a fact's arguments look them up. */
function lookup(index: RecordIndex): RecordLookup {
  const byType = new Map<string, string[]>();
  for (const { type, id } of index.records.values()) byType.set(type, [...(byType.get(type) ?? []), id]);
  return { ids: (type) => byType.get(type) ?? [], has: (type, id) => byType.get(type)?.includes(id) ?? false };
}

export async function screenProblems(
  source: ProjectSource,
  catalog: Catalog,
  index: RecordIndex,
  game: GameState,
): Promise<Diagnostic[]> {
  if (catalog.screens.length === 0 && !catalog.theme && !catalog.feedback && !catalog.shell) return [];
  const read = await readUi(source);
  const calendar = catalog.calendar ? { calendar: catalog.calendar } : {};
  const known = knownFrom({ ...gameChecks(game), kits: catalog.kits, ...calendar });
  const found = checkProjectUi(read, {
    facts: known.facts,
    openFacts: known.openFacts,
    kits: catalog.kits,
    ...(game.catalog ? { actions: game.catalog.actions, modes: game.catalog.modes, events: game.catalog.events } : {}),
    records: lookup(index),
    assets: new Set(catalog.assets),
    recordFields: recordFieldsOf(catalog.recordTypes),
  });
  // The catalog has W132 already, as it has W131 for scenes.
  return [...read.diagnostics.filter((d) => d.code !== 'W132'), ...found];
}
