/** What `eb sim` prints for a person: the sweep, then what the golden file says about it. */
import type { GoldenComparison, MetricReport, NumberSummary, RunEnd, Share, SweepReport } from '@eb/core';

const fixed = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2));
const percent = (x: number) => `${(x * 100).toFixed(1)}%`;
const shareText = (s: Share) => `${percent(s.share)} (95% ${percent(s.low)} to ${percent(s.high)})`;
const valueText = (value: unknown) => (value === null ? 'none' : String(value));

function numberText(s: NumberSummary): string {
  const interval = s.interval ? ` (95% ${fixed(s.interval.low)} to ${fixed(s.interval.high)})` : '';
  const spread = `p10 ${fixed(s.p10)}, median ${fixed(s.p50)}, p90 ${fixed(s.p90)}; ${fixed(s.min)} to ${fixed(s.max)}`;
  return `mean ${fixed(s.mean)}${interval}; ${spread}`;
}

function metricText(metric: MetricReport): string {
  if (metric.kind === 'values') return metric.values.map((v) => `${valueText(v.value)} ${shareText(v)}`).join(', ');
  const none = metric.none > 0 ? `; no value in ${metric.none} runs` : '';
  return metric.summary ? `${numberText(metric.summary)}${none}` : 'no values';
}

const ENDS: Readonly<Record<RunEnd, string>> = {
  ended: 'ended',
  stopped: 'stopped by the bot',
  capped: 'cut off at the turn cap',
};

export function formatSweep(project: string, report: SweepReport, maxTurns: number): string[] {
  const ends = (['ended', 'stopped', 'capped'] as const)
    .filter((end) => report.ends[end] > 0)
    .map((end) => `${report.ends[end]} ${ENDS[end]}`);
  const lines = [
    `${project}: ${report.runs} runs with the ${report.policy} policy, at most ${maxTurns} turns each.`,
    `Ends: ${ends.join(', ')}, in ${report.distinct} different ${report.distinct === 1 ? 'state' : 'states'}.`,
  ];
  if (report.turns) lines.push(`Turns: ${numberText(report.turns)}.`);
  for (const metric of report.metrics) lines.push(`${metric.label}: ${metricText(metric)}.`);
  const { count, first } = report.refused;
  if (count === 0) lines.push('Refused offers: none.');
  else {
    const shown = first.slice(0, 3).map((o) => `${o.seed} turn ${o.turn}, ${o.action.type} (${o.reason})`);
    lines.push(`Refused offers: ${count}. The game offered these and then refused them: ${shown.join('; ')}.`);
  }
  return lines;
}

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
