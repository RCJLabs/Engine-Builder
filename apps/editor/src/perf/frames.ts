/**
 * Frame times as the overlay and the step down read them (M5.7, D69): the frames drawn back to
 * back, each the time since the one before. The view draws only when something changes, so a
 * frame drawn after a pause says nothing about how fast the view can draw.
 */

export interface FrameStats {
  readonly count: number;
  readonly fps: number;
  /** In milliseconds. */
  readonly median: number;
  readonly p95: number;
}

/** The `p`th percentile of `sorted`, ascending, by the nearest rank. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] as number;
}

export function frameStats(intervals: readonly number[]): FrameStats {
  if (intervals.length === 0) return { count: 0, fps: 0, median: 0, p95: 0 };
  const sorted = [...intervals].sort((a, b) => a - b);
  const total = intervals.reduce((sum, n) => sum + n, 0);
  return {
    count: intervals.length,
    fps: total > 0 ? Math.round((intervals.length * 1000 * 10) / total) / 10 : 0,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
  };
}
