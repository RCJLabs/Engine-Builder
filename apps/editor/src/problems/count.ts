/** The open project's problems counted, for the Problems tab's badge (M2.8). */
import { computed } from '@preact/signals';
import { current } from '../projects/opened.ts';
import { type ProblemCounts, tally } from './collect.ts';

/** Null with no project open. */
export const problemCount = computed<ProblemCounts | null>(() => {
  const project = current.value;
  return project ? tally(project.catalog, project.index, project.game) : null;
});
