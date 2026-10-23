/**
 * The Problems panel's list (M2.8): every problem `eb validate` gives for the open project, from
 * what the editor keeps up to date already. The catalog has the files' own, read as the compiler
 * reads them (readProjectFiles); the record index has each record's, from the compiler's checks;
 * the game has its scripts' (M3.2), from the script worker; the index also holds the screens' (M4.1) and export.json's
 * (M4.10). A test holds the three together to
 * the list `eb validate` gives.
 */
import { compareDiagnostics, type Diagnostic } from '@eb/schema';
import type { Catalog } from '../forms/catalog.ts';
import type { RecordIndex } from '../records/recordIndex.ts';
import type { GameState } from '../scripts/gameState.ts';

/** Every problem, sorted as the compiler sorts them. Until the index is read, the files' and the scripts' alone. */
export function projectProblems(catalog: Catalog, index: RecordIndex | null, game?: GameState): Diagnostic[] {
  // A record that isn't JSON has its E007 among its problems (the index's own).
  const found: Diagnostic[] = [...catalog.problems, ...(game?.problems ?? [])];
  for (const record of index?.records.values() ?? []) found.push(...record.problems);
  found.push(...(index?.screens ?? []), ...(index?.exports ?? []), ...(index?.guide ?? []));
  return found.sort(compareDiagnostics);
}

export interface ProblemCounts {
  readonly errors: number;
  readonly warnings: number;
}

export const countProblems = (problems: readonly Diagnostic[]): ProblemCounts => {
  const errors = problems.filter((p) => p.severity === 'error').length;
  return { errors, warnings: problems.length - errors };
};

/** The project's problems counted without listing them, for the Problems tab's badge after every change. */
export function tally(catalog: Catalog, index: RecordIndex | null, game?: GameState): ProblemCounts {
  let errors = 0;
  let warnings = 0;
  const add = (problem: Diagnostic) => {
    if (problem.severity === 'error') errors++;
    else warnings++;
  };
  catalog.problems.forEach(add);
  game?.problems.forEach(add);
  for (const record of index?.records.values() ?? []) record.problems.forEach(add);
  index?.screens?.forEach(add);
  index?.exports?.forEach(add);
  index?.guide?.forEach(add);
  return { errors, warnings };
}

/** The Problems tab's badge: how many, or nothing when there are none. */
export function badgeText(counts: ProblemCounts | null): string | null {
  const total = counts ? counts.errors + counts.warnings : 0;
  return total > 0 ? String(total) : null;
}

/** "2 errors and 1 warning", "No problems". */
export function countsText({ errors, warnings }: ProblemCounts): string {
  const said = [
    errors > 0 ? `${errors} ${errors === 1 ? 'error' : 'errors'}` : '',
    warnings > 0 ? `${warnings} ${warnings === 1 ? 'warning' : 'warnings'}` : '',
  ].filter(Boolean);
  return said.length === 0 ? 'No problems' : said.join(' and ');
}
