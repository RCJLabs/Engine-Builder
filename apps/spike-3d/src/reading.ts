/**
 * The reading a measuring run ends with, as text to copy into a message: the device, then one
 * line per tier and backend, then Rapier's load time. ROADMAP's Readings take it as written.
 */
import type { FrameStats } from './frames.ts';
import type { Run } from './plan.ts';

export interface Device {
  readonly userAgent: string;
  /** CSS pixels, as width×height, and the device pixel ratio. */
  readonly screen: string;
  readonly devicePixelRatio: number;
  /** The date of the reading, as YYYY-MM-DD. */
  readonly date: string;
}

const ms = (value: number) => value.toFixed(1);

export function statsText(stats: FrameStats | null): string {
  if (!stats) return 'no frames drawn';
  return `${stats.fps.toFixed(1)} fps (median ${ms(stats.medianMs)} ms, p95 ${ms(stats.p95Ms)} ms, worst ${ms(stats.worstMs)} ms, N=${stats.frames} frames over ${stats.seconds.toFixed(1)} s)`;
}

export function formatReading(device: Device, run: Run): string {
  const lines = [
    `3D spike reading, ${device.date}`,
    `Device: ${device.userAgent}`,
    `Screen: ${device.screen} CSS px at ${device.devicePixelRatio}x`,
    `Protocol: ${run.warmup} s to settle, ${run.measure} s measured, each step on a fresh page load`,
  ];
  for (const result of run.results) {
    const ran = result.ran === result.backend ? result.ran : `${result.backend} asked, ${result.ran} ran`;
    lines.push(`${result.tier} on ${ran} at ${result.canvas}: ${statsText(result.stats)}`);
  }
  const skipped = run.steps.length - run.results.length;
  if (skipped > 0) lines.push(`${skipped} ${skipped === 1 ? 'step' : 'steps'} not run`);
  // The first page load may have fetched Rapier; the rest find it in the browser's cache.
  const loads = run.results.map((r) => (r.physics ? `${ms(r.physics.importMs)} + ${ms(r.physics.initMs)}` : 'failed'));
  lines.push(`Rapier, ms to load + start, by page load: ${loads.join(', ')}`);
  return lines.join('\n');
}
