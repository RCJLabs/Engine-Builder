/** What `eb sim` prints about a golden file; the sweep's own lines are core's formatSweep. */
import type { GoldenComparison } from '@eb/core';

export function formatGolden(file: string, runs: number, comparison: GoldenComparison | 'wrote'): string[] {
  if (comparison === 'wrote') return [`Wrote ${runs} runs to ${file}.`];
  if (comparison.same) {
    const since = comparison.contentChanged ? ', though the content has changed since it was written' : '';
    return [`All ${runs} runs match ${file}${since}.`];
  }
  const { differences, contentChanged } = comparison;
  const lines = [
    `${differences.length} of ${runs} runs differ from ${file}${contentChanged ? ', and the content has changed since it was written' : ''}:`,
  ];
  for (const d of differences.slice(0, 10)) {
    const where = d.facets.length > 0 ? d.facets.join(', ') : 'the same state';
    const end = d.was.end === d.now.end ? '' : `, ${d.was.end} then, ${d.now.end} now`;
    lines.push(`  ${d.seed}: ${where} (${d.was.turns} turns then, ${d.now.turns} now${end})`);
  }
  if (differences.length > 10) lines.push(`  and ${differences.length - 10} more.`);
  lines.push('If the change is meant, run again with --update to write the new runs.');
  return lines;
}
