/**
 * A sweep's report as lines for a person: what `eb sim` prints, and what the editor's Run shows
 * (M3.2), so the two never word a run differently. Numbers print with toFixed, which the
 * language defines exactly, so the lines are the same in every engine.
 */
import type { RunEnd } from './play.ts';
import type { NumberSummary } from './stats.ts';
import type { MetricReport, Share, SweepReport } from './sweep.ts';

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

// The stage a walked game's runs play with (M6.9): what the walk could send, as its names say.
const stageText = (stage: string | undefined): string =>
  stage === undefined ? '' : ` and the ${stage.split('+').join(' and ')} stage`;

export function formatSweep(project: string, report: SweepReport, maxTurns: number): string[] {
  const ends = (['ended', 'stopped', 'capped'] as const)
    .filter((end) => report.ends[end] > 0)
    .map((end) => `${report.ends[end]} ${ENDS[end]}`);
  const lines = [
    `${project}: ${report.runs} runs with the ${report.policy} policy${stageText(report.stage)}, at most ${maxTurns} turns each.`,
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
