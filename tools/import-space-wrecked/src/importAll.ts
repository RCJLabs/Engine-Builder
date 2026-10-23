/**
 * The whole import: Space-Wrecked's data, family by family, into one set of records. Pure but for
 * reading the source: the same files always make the same records.
 */
import { importBoard } from './board.ts';
import { importCrew } from './crew.ts';
import { importEvents } from './events.ts';
import { importFights } from './fights.ts';
import { importQuests } from './quests.ts';
import { RecordSet } from './records.ts';
import { importRun } from './run.ts';
import { importShip } from './ship.ts';
import { readSource, type Source } from './source.ts';

export function importSource(source: Source): RecordSet {
  const set = new RecordSet();
  importShip(source, set);
  importCrew(source, set);
  importFights(source, set);
  importEvents(source, set);
  importQuests(source, set);
  importBoard(source, set);
  importRun(source, set);
  return set;
}

export const importFolder = (folder: string): RecordSet => importSource(readSource(folder));
